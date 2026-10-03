import type { ColumnMapping, TemperatureUnit } from '../types';

/**
 * The fields we need out of a logger file. `timestamp` is the normal case;
 * `date` + `time` cover the files that split them into two columns.
 */
type IngestField =
  | 'logger'
  | 'branch'
  | 'fridge'
  | 'timestamp'
  | 'date'
  | 'time'
  | 'temperature'
  | 'unit';

/**
 * Header synonyms, longest/most-specific first within each field. Summer said
 * "the columns move around" and that the files "don't look quite the same from
 * branch to branch", so position is never used - only the header text.
 */
const SYNONYMS: Record<IngestField, string[]> = {
  logger: [
    'logger number',
    'logger no',
    'logger id',
    'logger code',
    'logger serial',
    'serial number',
    'device id',
    'device',
    'sensor id',
    'sensor',
    'probe id',
    'probe',
    'serial',
    'tag',
    'logger',
  ],
  branch: ['branch name', 'branch', 'store', 'site', 'location', 'shop', 'bakery', 'city'],
  fridge: [
    'fridge name',
    'fridge id',
    'fridge',
    'refrigerator',
    'cooler',
    'chiller',
    'cabinet',
    'appliance',
    'asset',
    'compartment',
    'freezer',
  ],
  timestamp: [
    'date time',
    'date and time',
    'datetime',
    'timestamp',
    'recorded at',
    'reading time',
    'logged at',
    'measured at',
    'recorded',
  ],
  date: ['date', 'day'],
  time: ['time', 'clock', 'hour'],
  temperature: [
    'temperature c',
    'temperature f',
    'temperature',
    'temp c',
    'temp f',
    'tempc',
    'tempf',
    'celsius',
    'fahrenheit',
    'degrees',
    'deg',
    'temp',
    'reading',
    'value',
  ],
  unit: ['unit', 'units', 'scale'],
};

/** "Temp (°C)" -> "temp c", "Logger #" -> "logger", "Date/Time" -> "date time" */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface HeaderMapping {
  /** field -> column index in the row array */
  columns: Partial<Record<IngestField, number>>;
  mapped: ColumnMapping[];
  /** Reported back to Summer rather than silently dropped. */
  unmapped: string[];
  /**
   * A header like "Temp F" or "Fahrenheit" declares the file's unit. Trusted
   * over the logger's registered unit, because it came from the device.
   */
  unitHint: TemperatureUnit | null;
}

function matchField(normalized: string): IngestField | null {
  // Exact match wins, so a column literally called "time" is a time column
  // and not accidentally a "datetime" column.
  for (const [field, synonyms] of Object.entries(SYNONYMS) as [IngestField, string[]][]) {
    if (synonyms.includes(normalized)) return field;
  }
  // Then substring, so "fridge temperature probe id" still lands somewhere
  // sensible. Order of SYNONYMS entries decides precedence.
  for (const [field, synonyms] of Object.entries(SYNONYMS) as [IngestField, string[]][]) {
    if (synonyms.some((synonym) => normalized.includes(synonym))) return field;
  }
  return null;
}

function detectUnitHint(normalized: string): TemperatureUnit | null {
  if (/\bf\b/.test(normalized) || normalized.includes('fahrenheit')) return 'F';
  if (/\bc\b/.test(normalized) || normalized.includes('celsius')) return 'C';
  return null;
}

export function mapHeaders(headers: string[]): HeaderMapping {
  const columns: Partial<Record<IngestField, number>> = {};
  const mapped: ColumnMapping[] = [];
  const unmapped: string[] = [];
  let unitHint: TemperatureUnit | null = null;

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized === '') return;

    const field = matchField(normalized);
    if (field === null || columns[field] !== undefined) {
      // Either we do not recognise it, or we already have this field from an
      // earlier column. Either way Summer should be told it was ignored.
      unmapped.push(header);
      return;
    }

    columns[field] = index;
    mapped.push({ field, sourceHeader: header });

    if (field === 'temperature') {
      unitHint = detectUnitHint(normalized);
    }
  });

  return { columns, mapped, unmapped, unitHint };
}

export interface HeaderValidation {
  ok: boolean;
  missing: string[];
  /** True when the file has separate date and time columns to be joined. */
  splitDateTime: boolean;
  /**
   * True when the only thing wrong is that nobody said which fridge this is.
   * The file is readable; it just needs labelling, which Summer can do in the
   * app instead of in Excel first.
   */
  needsLabels: boolean;
}

/**
 * Which of logger, branch and fridge Summer can supply by hand at upload time.
 * She already does exactly this in Excel: "I type in the logger number, the
 * branch and the fridge myself when I paste".
 */
export interface SuppliedLabels {
  loggerCode?: string | null;
  branchName?: string | null;
  fridgeName?: string | null;
}

function supplied(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * The logger files themselves "only have the time and the temperature" - Summer
 * adds logger, branch and fridge when she pastes. So those three are required,
 * but they can come either from a column or from what she typed on the upload
 * screen; a raw logger export is not a file we have to turn away.
 *
 * A time and a temperature, though, have to be in the file. Nothing outside it
 * can supply those.
 */
export function validateHeaders(
  mapping: HeaderMapping,
  labels: SuppliedLabels = {},
): HeaderValidation {
  const { columns } = mapping;
  const missing: string[] = [];
  const unlabelled: string[] = [];

  if (columns.logger === undefined && !supplied(labels.loggerCode)) unlabelled.push('logger');
  if (columns.branch === undefined && !supplied(labels.branchName)) unlabelled.push('branch');
  if (columns.fridge === undefined && !supplied(labels.fridgeName)) unlabelled.push('fridge');
  missing.push(...unlabelled);

  if (columns.temperature === undefined) missing.push('temperature');

  const hasCombined = columns.timestamp !== undefined;
  const hasSplit = columns.date !== undefined && columns.time !== undefined;
  // A lone "date" or "time" column is treated as a full timestamp: Summer's own
  // sheet has a column called "Time" holding "2026-09-14 06:00".
  const hasLoneDateOrTime = columns.date !== undefined || columns.time !== undefined;

  if (!hasCombined && !hasSplit && !hasLoneDateOrTime) {
    missing.push('time');
  }

  return {
    ok: missing.length === 0,
    missing,
    splitDateTime: !hasCombined && hasSplit,
    // Only offer the labelling form when labelling is the whole problem. A
    // file with no readable temperature column is a different conversation.
    needsLabels: unlabelled.length > 0 && missing.length === unlabelled.length,
  };
}
