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
  /** Hottest reading in the window being shown. */
  peakC: number | null;
  openExcursion: Excursion | null;
  excursionCount: number;
  doorEventCount: number;
  drift: Drift | null;
}

export interface FridgeListResponse {
  /** The newest reading in the data; shown as "data as of". */
  asOf: string | null;
  from: string | null;
  to: string | null;
  fridges: FridgeSummary[];
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

/** A logger we already know about, offered when a file needs labelling. */
export interface KnownLogger {
  code: string;
  branchName: string | null;
  fridgeName: string | null;
}

/**
 * A logger file straight off the device: readings, but nothing saying which
 * fridge they came from. Nothing was imported - the app asks who it belongs to
 * and uploads the same file again with the answer.
 */
export interface NeedsLabels {
  missing: string[];
  knownLoggers: KnownLogger[];
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
  appliedRules: AppliedRule[];
  /** Non-null when the file is readable but nobody has said which fridge it is. */
  needsLabels: NeedsLabels | null;
}

/** One row of upload history. */
export interface UploadHistoryEntry {
  id: number;
  filename: string;
  uploadedAt: string;
  rowsTotal: number;
  rowsAccepted: number;
  rowsRejected: number;
  rowsDuplicate: number;
  warnings: string[];
}

export interface AppliedRule {
  ruleId: number;
  summary: string;
  rows: number;
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

type RuleUnit = 'as_written' | 'C' | 'F';

export interface ConversionRule {
  id: number;
  matchBranch: string | null;
  matchLogger: string | null;
  matchFridge: string | null;
  unit: RuleUnit;
  multiplyBy: number;
  add: number;
  createdAt: string;
  summary: string;
}

export interface RulesListResponse {
  rules: ConversionRule[];
}
