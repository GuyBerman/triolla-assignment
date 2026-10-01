/**
 * Wire types for the API.
 *
 * These are hand-mirrored from `api/src/types.ts` rather than shared through a
 * workspace package. With one backend and one client, a shared package costs
 * more setup than it saves - but it does mean the two files have to be edited
 * together. See NOTES.md.
 */

export type FridgeStatus = 'ok' | 'warning' | 'alarm' | 'no_data';

export type ReadingStatus = 'ok' | 'error';

export interface Reading {
  recordedAt: string;
  tempC: number | null;
  rawValue: string;
  status: ReadingStatus;
}

/** A sustained period above the fridge's threshold. This is the thing an inspector asks about. */
export interface Excursion {
  startedAt: string;
  /** null while the fridge is still too warm */
  endedAt: string | null;
  durationMinutes: number;
  peakC: number;
  meanC: number;
  readingCount: number;
  ongoing: boolean;
}

/** Above threshold, but too briefly to be anything but a door opening. */
export interface DoorEvent {
  at: string;
  durationMinutes: number;
  peakC: number;
}

/** A hole in the data. Cause unknowable from the file alone. */
export interface Gap {
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
}

/** A fridge warming up steadily, even while still within range. */
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
  /** Plain-language explanation, written for someone non-technical. */
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
  /** Things Summer should look at but that did not stop the import. */
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

export interface HealthResponse {
  status: string;
  database: string;
  time: string;
}
