import { pool } from './db/pool';
import { formatDate } from './format';
import type {
  AssignmentContext,
  AssignmentQueryRow,
  AssignmentRow,
  FridgeQueryRow,
  FridgeRow,
  KnownLogger,
  KnownLoggerQueryRow,
  Reading,
  ReadingRow,
  UploadHistoryEntry,
  UploadHistoryQueryRow,
} from './types';

/**
 * The newest reading anywhere in the data.
 *
 * Used as "now" throughout. Summer uploads a batch of files once a week, so
 * her present is the end of the data she has sent, not the wall clock. Judging
 * against the clock would turn every fridge grey a few hours after an upload.
 */
export async function getAsOf(): Promise<Date | null> {
  const result = await pool.query<{ as_of: Date | null }>(
    'select max(recorded_at) as as_of from readings',
  );
  return result.rows[0]?.as_of ?? null;
}

export async function listFridges(): Promise<FridgeRow[]> {
  const result = await pool.query<FridgeQueryRow>(
    `select f.id, f.name, b.name as branch_name, f.threshold_c
       from fridges f
       join branches b on b.id = f.branch_id
      order by b.name, f.name`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    branchName: row.branch_name,
    thresholdC: Number(row.threshold_c),
  }));
}

export async function getFridge(id: number): Promise<FridgeRow | null> {
  const result = await pool.query<FridgeQueryRow>(
    `select f.id, f.name, b.name as branch_name, f.threshold_c
       from fridges f
       join branches b on b.id = f.branch_id
      where f.id = $1`,
    [id],
  );

  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    branchName: row.branch_name,
    thresholdC: Number(row.threshold_c),
  };
}

/** Her edit. Does not touch readings; the next look recomputes against the new number. */
export async function updateFridgeThreshold(
  id: number,
  thresholdC: number,
): Promise<FridgeRow | null> {
  const result = await pool.query(`update fridges set threshold_c = $2 where id = $1`, [
    id,
    thresholdC,
  ]);
  if (result.rowCount === 0) return null;
  return getFridge(id);
}

/**
 * Every logger we have seen, with the fridge it is in now. Offered on the
 * upload screen when a file does not say which fridge it is from, so Summer
 * taps a logger she recognises rather than retyping a branch name slightly
 * differently and inventing a second "Tel Aviv".
 */
export async function listKnownLoggers(): Promise<KnownLogger[]> {
  const result = await pool.query<KnownLoggerQueryRow>(
    `select l.code, b.name as branch_name, f.name as fridge_name
       from loggers l
       left join logger_assignments la
              on la.logger_id = l.id and la.valid_to is null
       left join fridges f on f.id = la.fridge_id
       left join branches b on b.id = f.branch_id
      order by l.code`,
  );

  return result.rows.map((row) => ({
    code: row.code,
    branchName: row.branch_name,
    fridgeName: row.fridge_name,
  }));
}

export async function listAssignments(): Promise<AssignmentRow[]> {
  const result = await pool.query<AssignmentQueryRow>(
    `select la.logger_id, l.code, la.fridge_id,
            b.name as branch_name, f.name as fridge_name,
            la.valid_from, la.valid_to
       from logger_assignments la
       join loggers l on l.id = la.logger_id
       join fridges f on f.id = la.fridge_id
       join branches b on b.id = f.branch_id
      order by la.logger_id, la.valid_from`,
  );

  return result.rows.map((row) => ({
    loggerId: row.logger_id,
    loggerCode: row.code,
    fridgeId: row.fridge_id,
    fridgeLabel: `${row.branch_name} ${row.fridge_name}`,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  }));
}

function toReading(row: ReadingRow): Reading {
  return {
    recordedAt: row.recorded_at.toISOString(),
    // double precision, so this really is a number and not a string - see the
    // comment on the readings table in the initial migration.
    tempC: row.temp_c === null ? null : Number(row.temp_c),
    rawValue: row.raw_value,
    status: row.status,
  };
}

/**
 * Every reading in the window for every fridge, in one query, grouped in
 * memory. The dashboard needs all twenty fridges at once, and twenty separate
 * round trips for that would be the obvious thing to regret later.
 */
export async function readingsByFridge(from: Date, to: Date): Promise<Map<number, Reading[]>> {
  const result = await pool.query<ReadingRow>(
    `select fridge_id, recorded_at, temp_c, raw_value, status
       from readings
      where recorded_at >= $1 and recorded_at <= $2
      order by fridge_id, recorded_at`,
    [from, to],
  );

  const grouped = new Map<number, Reading[]>();
  for (const row of result.rows) {
    const list = grouped.get(row.fridge_id);
    if (list) list.push(toReading(row));
    else grouped.set(row.fridge_id, [toReading(row)]);
  }
  return grouped;
}

export async function readingsForFridge(
  fridgeId: number,
  from: Date,
  to: Date,
): Promise<Reading[]> {
  const result = await pool.query<ReadingRow>(
    `select fridge_id, recorded_at, temp_c, raw_value, status
       from readings
      where fridge_id = $1 and recorded_at >= $2 and recorded_at <= $3
      order by recorded_at`,
    [fridgeId, from, to],
  );
  return result.rows.map(toReading);
}

/**
 * Works out which logger is in which fridge now, and - for a fridge that has
 * been left without one - where its logger went.
 *
 * This is what lets the Tel Aviv walk-in say "the logger was moved to Display
 * 2" rather than just going quiet, which would look like a broken fridge.
 */
export function buildAssignmentContext(
  assignments: AssignmentRow[],
  timeZone: string,
): AssignmentContext {
  const loggerCodeByFridge = new Map<number, string>();
  const noDataHintByFridge = new Map<number, string>();

  const open = assignments.filter((assignment) => assignment.validTo === null);
  for (const assignment of open) {
    loggerCodeByFridge.set(assignment.fridgeId, assignment.loggerCode);
  }

  const currentFridgeByLogger = new Map<number, string>();
  for (const assignment of open) {
    currentFridgeByLogger.set(assignment.loggerId, assignment.fridgeLabel);
  }

  for (const assignment of assignments) {
    if (assignment.validTo === null) continue;
    if (loggerCodeByFridge.has(assignment.fridgeId)) continue;

    const destination = currentFridgeByLogger.get(assignment.loggerId);
    const when = formatDate(assignment.validTo, timeZone);
    noDataHintByFridge.set(
      assignment.fridgeId,
      destination
        ? `Logger ${assignment.loggerCode} was moved to ${destination} on ${when}, so this ` +
            `fridge has not been monitored since.`
        : `Logger ${assignment.loggerCode} was removed on ${when}.`,
    );
  }

  return { loggerCodeByFridge, noDataHintByFridge };
}

/** Newest uploads only — enough for Summer to see what she already sent. */
export async function listRecentUploads(limit = 20): Promise<UploadHistoryEntry[]> {
  const result = await pool.query<UploadHistoryQueryRow>(
    `select id, filename, uploaded_at, rows_total, rows_accepted,
            rows_rejected, rows_duplicate, report
       from uploads
      order by uploaded_at desc
      limit $1`,
    [limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    uploadedAt: row.uploaded_at.toISOString(),
    rowsTotal: row.rows_total,
    rowsAccepted: row.rows_accepted,
    rowsRejected: row.rows_rejected,
    rowsDuplicate: row.rows_duplicate,
    warnings: row.report?.warnings ?? [],
  }));
}
