import type { ColumnMapping, TemperatureUnit } from './upload';

/** A column a logger file can contain. Position is never used, only the header. */
export type IngestField =
  | 'logger'
  | 'branch'
  | 'fridge'
  | 'timestamp'
  | 'date'
  | 'time'
  | 'temperature'
  | 'unit';

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

export interface SpreadsheetSheet {
  name: string;
  records: string[][];
}

/** `branches` / `fridges` id lookup while a file is being saved. */
export interface NamedRecord {
  id: number;
  name: string;
}

export interface LoggerRecord {
  id: number;
  unit: TemperatureUnit;
}

/** One `logger_assignments` row, as stored. */
export interface StoredAssignment {
  id: number;
  fridge_id: number;
  valid_from: Date;
  valid_to: Date | null;
}

/** A reading ready to insert. Not yet a row, and not yet the JSON `Reading`. */
export interface PreparedReading {
  loggerId: number;
  fridgeId: number;
  recordedAt: Date;
  tempC: number | null;
  rawValue: string;
  status: 'ok' | 'error';
}