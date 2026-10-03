export type FridgeStatus = 'ok' | 'warning' | 'alarm' | 'no_data';

export type ReadingStatus = 'ok' | 'error';

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
  /** Hottest reading in the window being shown. */
  peakC: number | null;
  openExcursion: Excursion | null;
  excursionCount: number;
  doorEventCount: number;
  drift: Drift | null;
}

export interface FridgeListResponse {
  /** The newest reading in the data; the app shows this as "data as of". */
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

/**
 * Column names as Postgres returns them. The interfaces below are the same
 * rows after the repository has renamed them for the rest of the API.
 */
export interface FridgeQueryRow {
  id: number;
  name: string;
  branch_name: string;
  threshold_c: number;
}

export interface FridgeRow {
  id: number;
  name: string;
  branchName: string;
  thresholdC: number;
}

export interface AssignmentQueryRow {
  logger_id: number;
  code: string;
  fridge_id: number;
  branch_name: string;
  fridge_name: string;
  valid_from: Date;
  valid_to: Date | null;
}

export interface AssignmentRow {
  loggerId: number;
  loggerCode: string;
  fridgeId: number;
  fridgeLabel: string;
  validFrom: Date;
  validTo: Date | null;
}

export interface ReadingRow {
  fridge_id: number;
  recorded_at: Date;
  temp_c: number | null;
  raw_value: string;
  status: ReadingStatus;
}

/** Which logger is in which fridge now, and why a vacated fridge went quiet. */
export interface AssignmentContext {
  loggerCodeByFridge: Map<number, string>;
  noDataHintByFridge: Map<number, string>;
}
