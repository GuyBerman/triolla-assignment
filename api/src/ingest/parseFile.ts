import { parse } from 'csv-parse/sync';

import type {
  HeaderMapping,
  HeaderValidation,
  ParsedRow,
  SuppliedLabels,
  UploadRejection,
} from '../types';
import { mapHeaders, validateHeaders } from './headers';
import { canonicalize, canonicalizeLoggerCode } from './names';
import {
  isLegacyExcelFilename,
  isSpreadsheetFilename,
  readSpreadsheet,
} from './spreadsheet';
import { parseTemperature } from './temperature';
import { parseSplitDateTime, parseTimestamp } from './timestamp';

interface ParseFileResult {
  rows: ParsedRow[];
  rejections: UploadRejection[];
  mapping: HeaderMapping;
  validation: HeaderValidation;
  warnings: string[];
  /** Rows skipped because the same logger and time appeared earlier in the file. */
  duplicateCount: number;
  /** How many dates were ambiguous and read day-first. */
  dayFirstAssumedCount: number;
}

/**
 * Summer pastes into Excel, so files arrive comma-separated, tab-separated
 * (a straight paste), or semicolon-separated (Excel in a European locale).
 * Guessing from the header line is more reliable than asking her to care.
 */
export function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
  const candidates = [',', '\t', ';', '|'];

  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function cell(row: string[], index: number | undefined): string {
  if (index === undefined) return '';
  return (row[index] ?? '').trim();
}

export function parseLoggerFile(
  content: string,
  timeZone: string,
  labels: SuppliedLabels = {},
): ParseFileResult {
  return parseTextFile(content, timeZone, labels);
}

/**
 * Upload entry point. Spreadsheets are binary, so this takes a Buffer and the
 * filename; CSV/TSV still go through the same table parser as `parseLoggerFile`.
 */
export async function parseUploadedFile(
  content: string | Buffer,
  timeZone: string,
  labels: SuppliedLabels = {},
  filename = '',
): Promise<ParseFileResult> {
  if (isLegacyExcelFilename(filename)) {
    return {
      ...emptyTable('file could not be read'),
      warnings: [
        'That is an old Excel file (.xls). Save it as .xlsx or CSV and upload again.',
      ],
    };
  }
  if (isSpreadsheetFilename(filename)) {
    return parseSpreadsheetFile(asBuffer(content), timeZone, labels);
  }
  const text = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  return parseTextFile(text, timeZone, labels);
}

function asBuffer(content: string | Buffer): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content);
}

function emptyTable(message: string): ParseFileResult {
  return {
    rows: [],
    rejections: [],
    mapping: { columns: {}, mapped: [], unmapped: [], unitHint: null },
    validation: {
      ok: false,
      missing: [message],
      splitDateTime: false,
      needsLabels: false,
    },
    warnings: message === 'the file is empty' ? ['This file has no rows in it.'] : [],
    duplicateCount: 0,
    dayFirstAssumedCount: 0,
  };
}

async function parseSpreadsheetFile(
  buffer: Buffer,
  timeZone: string,
  labels: SuppliedLabels,
): Promise<ParseFileResult> {
  let sheets;
  try {
    sheets = await readSpreadsheet(buffer);
  } catch (err) {
    return {
      ...emptyTable('file could not be read'),
      warnings: [`This Excel file could not be read: ${(err as Error).message}`],
    };
  }

  if (sheets.length === 0) {
    return emptyTable('the file is empty');
  }

  const warnings = ['Read this as an Excel workbook.'];
  const used: string[] = [];
  const skipped: string[] = [];
  let combined: ParseFileResult | null = null;

  for (const sheet of sheets) {
    const part = parseRecords(sheet.records, timeZone, labels, '|');
    if (!part.validation.ok) {
      skipped.push(sheet.name);
      if (combined === null) combined = part;
      continue;
    }
    used.push(sheet.name);
    combined = combined?.validation.ok ? mergeParsedSheets(combined, part) : part;
  }

  if (combined === null || !combined.validation.ok) {
    return {
      ...(combined ?? emptyTable('the columns this file needs')),
      warnings,
    };
  }

  if (used.length > 1) {
    warnings.push(`Used ${used.length} sheets: ${used.join(', ')}.`);
  }
  if (skipped.length > 0) {
    warnings.push(
      `Skipped ${skipped.length} sheet(s) that were not a logger table: ${skipped.join(', ')}.`,
    );
  }

  return { ...combined, warnings: [...warnings, ...combined.warnings] };
}

function mergeParsedSheets(left: ParseFileResult, right: ParseFileResult): ParseFileResult {
  const seen = new Set(left.rows.map((row) => `${row.loggerCode}|${row.recordedAt.getTime()}`));
  const extra: ParsedRow[] = [];
  let extraDuplicates = 0;
  for (const row of right.rows) {
    const key = `${row.loggerCode}|${row.recordedAt.getTime()}`;
    if (seen.has(key)) {
      extraDuplicates += 1;
      continue;
    }
    seen.add(key);
    extra.push(row);
  }

  const rows = [...left.rows, ...extra].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );

  return {
    rows,
    rejections: [...left.rejections, ...right.rejections],
    mapping: left.mapping,
    validation: left.validation,
    warnings: [...left.warnings, ...right.warnings],
    duplicateCount: left.duplicateCount + right.duplicateCount + extraDuplicates,
    dayFirstAssumedCount: left.dayFirstAssumedCount + right.dayFirstAssumedCount,
  };
}

function parseTextFile(content: string, timeZone: string, labels: SuppliedLabels): ParseFileResult {
  const warnings: string[] = [];

  const delimiter = detectDelimiter(content);
  if (delimiter !== ',') {
    const named = delimiter === '\t' ? 'tab' : `"${delimiter}"`;
    warnings.push(`Read this file as ${named}-separated rather than comma-separated.`);
  }

  let records: string[][];
  try {
    records = parse(content, {
      delimiter,
      bom: true,
      skipEmptyLines: true,
      // Files from different loggers have different column counts; that is the
      // whole problem, so do not treat it as corruption.
      relaxColumnCount: true,
      relaxQuotes: true,
      trim: true,
    }) as string[][];
  } catch (err) {
    return {
      ...emptyTable('file could not be read'),
      warnings: [`This file could not be read as a table: ${(err as Error).message}`],
    };
  }

  const parsed = parseRecords(records, timeZone, labels, delimiter === '\t' ? ' | ' : delimiter);
  return { ...parsed, warnings: [...warnings, ...parsed.warnings] };
}

function parseRecords(
  records: string[][],
  timeZone: string,
  labels: SuppliedLabels,
  rawJoin: string,
): ParseFileResult {
  const warnings: string[] = [];
  const rejections: UploadRejection[] = [];
  const rows: ParsedRow[] = [];

  const headerRow = records[0];
  if (headerRow === undefined) {
    return emptyTable('the file is empty');
  }

  const mapping = mapHeaders(headerRow);
  const validation = validateHeaders(mapping, labels);
  if (!validation.ok) {
    return {
      rows: [],
      rejections: [],
      mapping,
      validation,
      warnings,
      duplicateCount: 0,
      dayFirstAssumedCount: 0,
    };
  }

  const { columns } = mapping;
  const labelled = {
    loggerCode: (labels.loggerCode ?? '').trim(),
    branchName: (labels.branchName ?? '').trim(),
    fridgeName: (labels.fridgeName ?? '').trim(),
  };
  // Prefer a unit declared by a column over one implied by the header text.
  const unitColumnIndex = columns.unit;

  let duplicateCount = 0;
  let dayFirstAssumedCount = 0;

  /** logger + instant -> the raw value already accepted for it. */
  const seen = new Map<string, string>();
  let conflictWarned = false;

  for (let index = 1; index < records.length; index += 1) {
    const record = records[index]!;
    // +1 again because a spreadsheet's row 1 is the header.
    const rowNumber = index + 1;
    const rawLine = record.join(rawJoin);

    if (record.every((value) => value.trim() === '')) continue;

    // A raw logger export has no logger, branch or fridge column, so fall back
    // to what Summer typed on the upload screen. A column always wins: if the
    // file says which fridge a row belongs to, it knows better than the form.
    const loggerRaw = cell(record, columns.logger) || labelled.loggerCode;
    const branchRaw = cell(record, columns.branch) || labelled.branchName;
    const fridgeRaw = cell(record, columns.fridge) || labelled.fridgeName;

    if (loggerRaw === '' || branchRaw === '' || fridgeRaw === '') {
      const missing = [
        loggerRaw === '' ? 'logger' : null,
        branchRaw === '' ? 'branch' : null,
        fridgeRaw === '' ? 'fridge' : null,
      ].filter((value): value is string => value !== null);
      rejections.push({
        row: rowNumber,
        reason: `missing ${missing.join(', ')}`,
        raw: rawLine,
      });
      continue;
    }

    const timestamp = validation.splitDateTime
      ? parseSplitDateTime(cell(record, columns.date), cell(record, columns.time), timeZone)
      : parseTimestamp(
          cell(record, columns.timestamp ?? columns.date ?? columns.time),
          timeZone,
        );

    if (!timestamp.ok) {
      rejections.push({ row: rowNumber, reason: timestamp.reason, raw: rawLine });
      continue;
    }
    if (timestamp.dayFirstAssumed) dayFirstAssumedCount += 1;

    const loggerCode = canonicalizeLoggerCode(loggerRaw);
    const key = `${loggerCode}|${timestamp.at.getTime()}`;
    const temperatureRaw = cell(record, columns.temperature);

    const previous = seen.get(key);
    if (previous !== undefined) {
      duplicateCount += 1;
      // Two rows for the same logger at the same moment with *different*
      // numbers is a different problem from a re-paste, and Summer should know.
      if (previous !== temperatureRaw && !conflictWarned) {
        conflictWarned = true;
        warnings.push(
          `Row ${rowNumber}: ${loggerCode} has two different temperatures for the same ` +
            `time (${previous} and ${temperatureRaw}). Kept the first one. If this file ` +
            `mixes data from two loggers, they need separate logger numbers.`,
        );
      }
      continue;
    }
    seen.set(key, temperatureRaw);

    const temperature = parseTemperature(temperatureRaw);

    const unitFromColumn = (() => {
      const declared = cell(record, unitColumnIndex).toUpperCase();
      if (declared.startsWith('F')) return 'F' as const;
      if (declared.startsWith('C')) return 'C' as const;
      return null;
    })();

    rows.push({
      rowNumber,
      loggerCode,
      branchName: branchRaw,
      branchCanonical: canonicalize(branchRaw),
      fridgeName: fridgeRaw,
      fridgeCanonical: canonicalize(fridgeRaw),
      recordedAt: timestamp.at,
      rawValue: temperatureRaw === '' ? '(blank)' : temperatureRaw,
      rawNumber: temperature.ok ? temperature.value : null,
      unitOverride:
        unitFromColumn ??
        (temperature.ok ? temperature.unitFromCell : null) ??
        mapping.unitHint,
      status: temperature.ok ? 'ok' : 'error',
    });
  }

  if (dayFirstAssumedCount > 0) {
    warnings.push(
      `${dayFirstAssumedCount} date(s) in this file could be read either day-first or ` +
        `month-first (for example 03/04/2026). Read as day-first, so that is 3 April.`,
    );
  }

  if (mapping.unmapped.length > 0) {
    warnings.push(
      `Ignored ${mapping.unmapped.length} column(s) that were not recognised: ` +
        `${mapping.unmapped.join(', ')}.`,
    );
  }

  // Readings almost never arrive in order - the sample sheet has Tel Aviv's
  // 05:45 row sitting after its 06:30 row. Sorting here means every consumer
  // downstream can assume a chronological series.
  rows.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  return {
    rows,
    rejections,
    mapping,
    validation,
    warnings,
    duplicateCount,
    dayFirstAssumedCount,
  };
}
