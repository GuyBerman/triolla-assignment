import { parse } from 'csv-parse/sync';

import type { TemperatureUnit, UploadRejection } from '../types';
import { mapHeaders, validateHeaders, type HeaderMapping, type HeaderValidation } from './headers';
import { canonicalize, canonicalizeLoggerCode } from './names';
import { parseTemperature } from './temperature';
import { parseSplitDateTime, parseTimestamp } from './timestamp';

export interface ParsedRow {
  /** 1-based row number as a human would count it in a spreadsheet. */
  rowNumber: number;
  loggerCode: string;
  branchName: string;
  branchCanonical: string;
  fridgeName: string;
  fridgeCanonical: string;
  recordedAt: Date;
  /** Exactly what the cell contained. */
  rawValue: string;
  /** The number as written, still in the file's own unit. */
  rawNumber: number | null;
  /** A unit declared by the cell or the column header, if any. */
  unitOverride: TemperatureUnit | null;
  status: 'ok' | 'error';
}

export interface ParseFileResult {
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

export function parseLoggerFile(content: string, timeZone: string): ParseFileResult {
  const warnings: string[] = [];
  const rejections: UploadRejection[] = [];
  const rows: ParsedRow[] = [];

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
      rows: [],
      rejections: [],
      mapping: { columns: {}, mapped: [], unmapped: [], unitHint: null },
      validation: { ok: false, missing: ['file could not be read'], splitDateTime: false },
      warnings: [`This file could not be read as a table: ${(err as Error).message}`],
      duplicateCount: 0,
      dayFirstAssumedCount: 0,
    };
  }

  const headerRow = records[0];
  if (headerRow === undefined) {
    return {
      rows: [],
      rejections: [],
      mapping: { columns: {}, mapped: [], unmapped: [], unitHint: null },
      validation: { ok: false, missing: ['the file is empty'], splitDateTime: false },
      warnings: ['This file has no rows in it.'],
      duplicateCount: 0,
      dayFirstAssumedCount: 0,
    };
  }

  const mapping = mapHeaders(headerRow);
  const validation = validateHeaders(mapping);
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
    const rawLine = record.join(delimiter === '\t' ? ' | ' : delimiter);

    if (record.every((value) => value.trim() === '')) continue;

    const loggerRaw = cell(record, columns.logger);
    const branchRaw = cell(record, columns.branch);
    const fridgeRaw = cell(record, columns.fridge);

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
