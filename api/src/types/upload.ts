export type TemperatureUnit = 'C' | 'F';

/** Logger list query, before it becomes `KnownLogger`. */
export interface KnownLoggerQueryRow {
  code: string;
  branch_name: string | null;
  fridge_name: string | null;
}

/** Upload history query, before it becomes `UploadHistoryEntry`. */
export interface UploadHistoryQueryRow {
  id: number;
  filename: string;
  uploaded_at: Date;
  rows_total: number;
  rows_accepted: number;
  rows_rejected: number;
  rows_duplicate: number;
  report: UploadReport | null;
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

/**
 * A logger we already know about, offered on the upload screen so Summer can
 * tap "TL-0417 - Tel Aviv Display 2" instead of retyping all three fields.
 */
export interface KnownLogger {
  code: string;
  branchName: string | null;
  fridgeName: string | null;
}

/**
 * Set when a file holds times and temperatures but nothing saying which fridge
 * they came from - a logger file straight off the device. Nothing was imported
 * yet; the app asks who it belongs to and uploads it again with the answer.
 */
export interface NeedsLabels {
  /** Which of logger, branch, fridge the file does not say. */
  missing: string[];
  knownLoggers: KnownLogger[];
}

export interface AppliedRule {
  ruleId: number;
  summary: string;
  rows: number;
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
  appliedRules: AppliedRule[];
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
