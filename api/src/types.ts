/**
 * Domain and wire types. Kept in sync by hand with `app/src/api/types.ts`.
 */

export type FridgeStatus = 'ok' | 'warning' | 'alarm' | 'no_data';

export type ReadingStatus = 'ok' | 'error';

export type TemperatureUnit = 'C' | 'F';

/** A single temperature sample, after normalisation. */
export interface Reading {
  recordedAt: string;
  tempC: number | null;
  rawValue: string;
  status: ReadingStatus;
}

/**
 * The analysis functions work on this rather than on `Reading`, because they
 * only ever care about readings that actually produced a number, and because
 * epoch milliseconds make the arithmetic far less error-prone than strings.
 */
export interface Sample {
  at: number;
  tempC: number;
}

export interface Excursion {
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  peakC: number;
  meanC: number;
  readingCount: number;
  ongoing: boolean;
}

export interface DoorEvent {
  at: string;
  durationMinutes: number;
  peakC: number;
}

export interface Gap {
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
}

export interface Drift {
  slopeCPerHour: number;
  windowStart: string;
  windowEnd: string;
  startC: number;
  endC: number;
}

export interface FridgeSummary {
  id: number;
  name: string;
  branchName: string;
  loggerCode: string | null;
  thresholdC: number;
  status: FridgeStatus;
  statusReason: string;
  lastReading: Reading | null;
  openExcursion: Excursion | null;
  excursionCount: number;
  doorEventCount: number;
  drift: Drift | null;
}

export interface FridgeDetail {
  fridge: FridgeSummary;
  from: string;
  to: string;
  readings: Reading[];
  excursions: Excursion[];
  doorEvents: DoorEvent[];
  gaps: Gap[];
  drift: Drift | null;
}

export interface ColumnMapping {
  field: string;
  sourceHeader: string;
}

export interface UploadRejection {
  row: number;
  reason: string;
  raw: string;
}

export interface LoggerMove {
  loggerCode: string;
  fromFridge: string | null;
  toFridge: string;
  at: string;
}

export interface UploadReport {
  uploadId: number;
  filename: string;
  rowsTotal: number;
  rowsAccepted: number;
  rowsRejected: number;
  rowsDuplicate: number;
  columnMapping: ColumnMapping[];
  unmappedColumns: string[];
  warnings: string[];
  rejections: UploadRejection[];
  loggerMoves: LoggerMove[];
  convertedFromFahrenheit: string[];
}

export interface ExcursionReportRow {
  fridgeId: number;
  fridgeName: string;
  branchName: string;
  thresholdC: number;
  excursions: Excursion[];
}

export interface ExcursionReport {
  from: string;
  to: string;
  generatedAt: string;
  rows: ExcursionReportRow[];
  totalExcursions: number;
}
