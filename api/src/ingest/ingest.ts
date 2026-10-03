import type { PoolClient } from 'pg';

import { config } from '../config';
import { pool } from '../db/pool';
import { listKnownLoggers } from '../repository';
import { listConversionRules } from '../ruleStore';
import type { LoggerMove, TemperatureUnit, UploadReport, UploadRejection } from '../types';
import { applyConversion, describeRule, pickRule } from './conversion';
import type { SuppliedLabels } from './headers';
import { preferredDisplayName } from './names';
import { parseUploadedFile, type ParsedRow } from './parseFile';
import { assessDeclaredUnit } from './temperature';

const READING_INSERT_CHUNK = 500;

interface NamedRecord {
  id: number;
  name: string;
}

async function resolveBranch(
  client: PoolClient,
  canonical: string,
  displayName: string,
): Promise<number> {
  const inserted = await client.query<NamedRecord>(
    `insert into branches (name, canonical_name) values ($1, $2)
     on conflict (canonical_name) do nothing
     returning id, name`,
    [displayName, canonical],
  );
  if (inserted.rows[0]) return inserted.rows[0].id;

  const existing = await client.query<NamedRecord>(
    `select id, name from branches where canonical_name = $1`,
    [canonical],
  );
  const row = existing.rows[0]!;

  // "tel aviv" and "Tel Aviv" are the same branch; show the tidier spelling.
  const preferred = preferredDisplayName(row.name, displayName);
  if (preferred !== row.name) {
    await client.query(`update branches set name = $1 where id = $2`, [preferred, row.id]);
  }
  return row.id;
}

async function resolveFridge(
  client: PoolClient,
  branchId: number,
  canonical: string,
  displayName: string,
): Promise<number> {
  const inserted = await client.query<NamedRecord>(
    `insert into fridges (branch_id, name, canonical_name) values ($1, $2, $3)
     on conflict (branch_id, canonical_name) do nothing
     returning id, name`,
    [branchId, displayName, canonical],
  );
  if (inserted.rows[0]) return inserted.rows[0].id;

  const existing = await client.query<NamedRecord>(
    `select id, name from fridges where branch_id = $1 and canonical_name = $2`,
    [branchId, canonical],
  );
  const row = existing.rows[0]!;
  const preferred = preferredDisplayName(row.name, displayName);
  if (preferred !== row.name) {
    await client.query(`update fridges set name = $1 where id = $2`, [preferred, row.id]);
  }
  return row.id;
}

interface LoggerRecord {
  id: number;
  unit: TemperatureUnit;
}

async function resolveLogger(client: PoolClient, code: string): Promise<LoggerRecord> {
  const inserted = await client.query<LoggerRecord>(
    `insert into loggers (code) values ($1)
     on conflict (code) do nothing
     returning id, unit`,
    [code],
  );
  if (inserted.rows[0]) return inserted.rows[0];

  const existing = await client.query<LoggerRecord>(
    `select id, unit from loggers where code = $1`,
    [code],
  );
  return existing.rows[0]!;
}

interface Assignment {
  id: number;
  fridge_id: number;
  valid_from: Date;
  valid_to: Date | null;
}

/**
 * Keeps `logger_assignments` in step with what the files say, and reports any
 * move it had to make.
 *
 * Summer moved a Tel Aviv logger into the new display fridge, and the only
 * record of that is the fridge name she typed when pasting. So the file is
 * treated as authoritative: if it disagrees with the open assignment, the
 * assignment is closed and a new one opened from that moment.
 */
async function syncAssignments(
  client: PoolClient,
  loggerId: number,
  loggerCode: string,
  rows: ParsedRow[],
  fridgeIdByKey: Map<string, number>,
): Promise<LoggerMove[]> {
  const moves: LoggerMove[] = [];

  // Looked up from the database, not from the file: when a logger moves, the
  // fridge it came from is by definition not in the file being uploaded.
  const fridgeLabel = async (fridgeId: number): Promise<string | null> => {
    const result = await client.query<{ label: string }>(
      `select b.name || ' ' || f.name as label
         from fridges f join branches b on b.id = f.branch_id
        where f.id = $1`,
      [fridgeId],
    );
    return result.rows[0]?.label ?? null;
  };

  // Collapse the logger's rows into runs of consecutive readings in the same
  // fridge. Rows are already chronological.
  const segments: { fridgeId: number; start: Date }[] = [];
  for (const row of rows) {
    const fridgeId = fridgeIdByKey.get(`${row.branchCanonical}|${row.fridgeCanonical}`)!;
    const last = segments[segments.length - 1];
    if (last === undefined || last.fridgeId !== fridgeId) {
      segments.push({ fridgeId, start: row.recordedAt });
    }
  }

  for (const segment of segments) {
    const openResult = await client.query<Assignment>(
      `select id, fridge_id, valid_from, valid_to
         from logger_assignments
        where logger_id = $1 and valid_to is null
        order by valid_from desc
        limit 1`,
      [loggerId],
    );
    const open = openResult.rows[0];

    if (open === undefined) {
      await client.query(
        `insert into logger_assignments (logger_id, fridge_id, valid_from) values ($1, $2, $3)`,
        [loggerId, segment.fridgeId, segment.start],
      );
      continue;
    }

    if (open.fridge_id === segment.fridgeId) {
      // Same fridge. If this file reaches further back than we knew about,
      // widen the window rather than creating a second overlapping one.
      if (segment.start < open.valid_from) {
        await client.query(`update logger_assignments set valid_from = $1 where id = $2`, [
          segment.start,
          open.id,
        ]);
      }
      continue;
    }

    if (segment.start > open.valid_from) {
      await client.query(`update logger_assignments set valid_to = $1 where id = $2`, [
        segment.start,
        open.id,
      ]);
      await client.query(
        `insert into logger_assignments (logger_id, fridge_id, valid_from) values ($1, $2, $3)`,
        [loggerId, segment.fridgeId, segment.start],
      );
      moves.push({
        loggerCode,
        fromFridge: await fridgeLabel(open.fridge_id),
        toFridge: (await fridgeLabel(segment.fridgeId)) ?? 'unknown',
        at: segment.start.toISOString(),
      });
      continue;
    }

    // The segment predates the open assignment: this is a backfill of an older
    // file, not a move. Record it as a closed window and leave the present be.
    await client.query(
      `insert into logger_assignments (logger_id, fridge_id, valid_from, valid_to)
       values ($1, $2, $3, $4)`,
      [loggerId, segment.fridgeId, segment.start, open.valid_from],
    );
  }

  return moves;
}

interface PreparedReading {
  loggerId: number;
  fridgeId: number;
  recordedAt: Date;
  tempC: number | null;
  rawValue: string;
  status: 'ok' | 'error';
}

async function insertReadings(
  client: PoolClient,
  uploadId: number,
  readings: PreparedReading[],
): Promise<number> {
  let insertedCount = 0;

  for (let offset = 0; offset < readings.length; offset += READING_INSERT_CHUNK) {
    const chunk = readings.slice(offset, offset + READING_INSERT_CHUNK);
    const values: unknown[] = [];
    const placeholders = chunk.map((reading, index) => {
      const base = index * 7;
      values.push(
        reading.loggerId,
        reading.fridgeId,
        reading.recordedAt,
        reading.tempC,
        reading.rawValue,
        reading.status,
        uploadId,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
    });

    // The unique index on (logger_id, recorded_at) does the deduplication, so
    // re-uploading last week's file is harmless and the count tells Summer how
    // much of it she had already sent.
    const result = await client.query(
      `insert into readings
         (logger_id, fridge_id, recorded_at, temp_c, raw_value, status, upload_id)
       values ${placeholders.join(', ')}
       on conflict (logger_id, recorded_at) do nothing
       returning id`,
      values,
    );
    insertedCount += result.rowCount ?? 0;
  }

  return insertedCount;
}

/**
 * "a temperature column" reads better than "these column(s): temperature", and
 * a file that failed for some other reason still has to say what it was.
 */
function describeMissing(blockers: string[], all: string[]): string {
  const named = blockers.length > 0 ? blockers : all;
  if (named.length === 0) return 'the columns this file needs';
  const columns = named.map((field) => `a ${field} column`);
  if (columns.length === 1) return columns[0]!;
  return `${columns.slice(0, -1).join(', ')} or ${columns[columns.length - 1]!}`;
}

export async function ingestFile(
  filename: string,
  content: string | Buffer,
  labels: SuppliedLabels = {},
): Promise<UploadReport> {
  const parsed = await parseUploadedFile(content, config.timezone, labels, filename);
  const warnings = [...parsed.warnings];
  const rejections: UploadRejection[] = [...parsed.rejections];
  const moves: LoggerMove[] = [];
  const convertedFromFahrenheit: string[] = [];
  const appliedRuleCounts = new Map<number, { summary: string; rows: number }>();

  const client = await pool.connect();
  try {
    await client.query('begin');

    const uploadResult = await client.query<{ id: number }>(
      `insert into uploads (filename) values ($1) returning id`,
      [filename],
    );
    const uploadId = uploadResult.rows[0]!.id;
    const rules = await listConversionRules();

    // A file whose columns we cannot identify is recorded as a failed upload
    // rather than thrown away, so there is a trail of what was attempted.
    if (!parsed.validation.ok) {
      // Two different situations, and conflating them is what used to send
      // Summer back to Excel. A file that only lacks labels is perfectly
      // readable - it just needs her to say which fridge it came from, which
      // she can do on the upload screen. A file with no readable temperature
      // or time is a genuine dead end.
      const needsLabels = parsed.validation.needsLabels
        ? { missing: parsed.validation.missing, knownLoggers: await listKnownLoggers() }
        : null;

      const message = needsLabels
        ? `This looks like a logger file straight off the device: it has readings but ` +
          `nothing saying which fridge they came from. Tell me which fridge, and I will ` +
          `import it.`
        : // Name only what she cannot fix by labelling. Listing "logger, branch,
          // fridge" alongside the real problem buries it.
          `Could not find ${describeMissing(
            parsed.validation.missing.filter(
              (field) => field === 'temperature' || field === 'time',
            ),
            parsed.validation.missing,
          )}. The columns found were: ${
            parsed.mapping.mapped.map((entry) => entry.sourceHeader).join(', ') || '(none)'
          }. A file has to contain at least a time and a temperature.`;
      warnings.push(message);

      const report: UploadReport = {
        uploadId,
        filename,
        rowsTotal: 0,
        rowsAccepted: 0,
        rowsRejected: 0,
        rowsDuplicate: 0,
        columnMapping: parsed.mapping.mapped,
        unmappedColumns: parsed.mapping.unmapped,
        warnings,
        rejections,
        loggerMoves: [],
        convertedFromFahrenheit: [],
        appliedRules: [],
        needsLabels,
      };
      await client.query(`update uploads set report = $1 where id = $2`, [report, uploadId]);
      await client.query('commit');
      return report;
    }

    const rowsByLogger = new Map<string, ParsedRow[]>();
    for (const row of parsed.rows) {
      const list = rowsByLogger.get(row.loggerCode);
      if (list) list.push(row);
      else rowsByLogger.set(row.loggerCode, [row]);
    }

    // --- work out each logger's unit, and drop any file we cannot trust ----
    //
    // Deliberately before branches and fridges are created. A file rejected
    // for a bad unit should leave no trace: creating the branch and fridge
    // first left a phantom fridge on the dashboard, permanently "no data",
    // for an upload that was never accepted.
    const loggerByCode = new Map<string, LoggerRecord>();
    const unitByLogger = new Map<string, TemperatureUnit>();

    for (const [loggerCode, loggerRows] of rowsByLogger) {
      const logger = await resolveLogger(client, loggerCode);
      loggerByCode.set(loggerCode, logger);

      const declaredInFile = new Set(
        loggerRows
          .map((row) => row.unitOverride)
          .filter((unit): unit is TemperatureUnit => unit !== null),
      );

      let unit: TemperatureUnit = logger.unit;
      if (declaredInFile.size === 1) {
        const fromFile = [...declaredInFile][0]!;
        if (fromFile !== logger.unit) {
          // The file came off the device, so it outranks our registration.
          await client.query(`update loggers set unit = $1 where id = $2`, [fromFile, logger.id]);
          warnings.push(
            `${loggerCode} was registered as ${logger.unit === 'F' ? 'Fahrenheit' : 'Celsius'} ` +
              `but this file says ${fromFile === 'F' ? 'Fahrenheit' : 'Celsius'}. ` +
              `Updated the logger to match the file.`,
          );
        }
        unit = fromFile;
      } else if (declaredInFile.size > 1) {
        warnings.push(
          `${loggerCode} has rows claiming different units in the same file. ` +
            `Used its registered unit (${logger.unit}) for all of them.`,
        );
      }

      if (unit === 'C') {
        const unitForcedByRule = loggerRows.every((row) => {
          const rule = pickRule(rules, {
            branchCanonical: row.branchCanonical,
            fridgeCanonical: row.fridgeCanonical,
            loggerCode: row.loggerCode,
          });
          return rule?.unit === 'C' || rule?.unit === 'F';
        });

        // A rule that names the unit is the user telling us how to read the
        // file, so the median-38 guard must not refuse it.
        if (!unitForcedByRule) {
          const numericValues = loggerRows
            .map((row) => row.rawNumber)
            .filter((value): value is number => value !== null);
          const suspicion = assessDeclaredUnit(loggerCode, 'C', numericValues);

          if (suspicion.level === 'reject') {
            warnings.push(suspicion.message);
            for (const row of loggerRows) {
              rejections.push({
                row: row.rowNumber,
                reason: `${loggerCode} unit looks wrong; not imported`,
                raw: `${row.rawValue} at ${row.recordedAt.toISOString()}`,
              });
            }
            rowsByLogger.delete(loggerCode);
            continue;
          }
          if (suspicion.level === 'warn') {
            warnings.push(suspicion.message);
          }
        }
      } else {
        convertedFromFahrenheit.push(loggerCode);
      }

      unitByLogger.set(loggerCode, unit);
    }

    // --- resolve branches and fridges, for surviving rows only -------------
    const branchIdByCanonical = new Map<string, number>();
    const fridgeIdByKey = new Map<string, number>();

    for (const loggerRows of rowsByLogger.values()) {
      for (const row of loggerRows) {
        if (!branchIdByCanonical.has(row.branchCanonical)) {
          branchIdByCanonical.set(
            row.branchCanonical,
            await resolveBranch(client, row.branchCanonical, row.branchName),
          );
        }
        const fridgeKey = `${row.branchCanonical}|${row.fridgeCanonical}`;
        if (!fridgeIdByKey.has(fridgeKey)) {
          fridgeIdByKey.set(
            fridgeKey,
            await resolveFridge(
              client,
              branchIdByCanonical.get(row.branchCanonical)!,
              row.fridgeCanonical,
              row.fridgeName,
            ),
          );
        }
      }
    }

    // --- convert and stage the readings ------------------------------------
    const readings: PreparedReading[] = [];

    for (const [loggerCode, loggerRows] of rowsByLogger) {
      const logger = loggerByCode.get(loggerCode)!;
      const unit = unitByLogger.get(loggerCode)!;

      moves.push(
        ...(await syncAssignments(client, logger.id, loggerCode, loggerRows, fridgeIdByKey)),
      );

      for (const row of loggerRows) {
        const fridgeId = fridgeIdByKey.get(`${row.branchCanonical}|${row.fridgeCanonical}`)!;
        const rule = pickRule(rules, {
          branchCanonical: row.branchCanonical,
          fridgeCanonical: row.fridgeCanonical,
          loggerCode: row.loggerCode,
        });
        const tempC =
          row.rawNumber === null ? null : applyConversion(row.rawNumber, unit, rule);

        if (rule && row.rawNumber !== null) {
          const current = appliedRuleCounts.get(rule.id);
          if (current) current.rows += 1;
          else appliedRuleCounts.set(rule.id, { summary: describeRule(rule), rows: 1 });
        }

        if (rule?.unit === 'F' || (rule?.unit !== 'C' && unit === 'F')) {
          if (!convertedFromFahrenheit.includes(loggerCode)) {
            convertedFromFahrenheit.push(loggerCode);
          }
        }

        readings.push({
          loggerId: logger.id,
          fridgeId,
          recordedAt: row.recordedAt,
          tempC,
          rawValue: row.rawValue,
          status: row.status,
        });
      }
    }

    readings.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    const inserted = await insertReadings(client, uploadId, readings);
    const alreadyHad = readings.length - inserted;
    const duplicates = parsed.duplicateCount + alreadyHad;

    if (alreadyHad > 0) {
      warnings.push(
        `${alreadyHad} reading(s) in this file were already recorded, so they were skipped. ` +
          `Re-uploading the same file is safe.`,
      );
    }

    const errorCount = readings.filter((reading) => reading.status === 'error').length;
    if (errorCount > 0) {
      warnings.push(
        `${errorCount} reading(s) had no usable temperature (for example "ERR"). They are ` +
          `kept as gaps in the record rather than treated as normal readings.`,
      );
    }

    if (appliedRuleCounts.size > 0) {
      for (const applied of appliedRuleCounts.values()) {
        warnings.push(
          `Applied a conversion rule to ${applied.rows} reading${applied.rows === 1 ? '' : 's'}: ${applied.summary}.`,
        );
      }
    }

    const report: UploadReport = {
      uploadId,
      filename,
      rowsTotal: parsed.rows.length + parsed.rejections.length + parsed.duplicateCount,
      rowsAccepted: inserted,
      rowsRejected: rejections.length,
      rowsDuplicate: duplicates,
      columnMapping: parsed.mapping.mapped,
      unmappedColumns: parsed.mapping.unmapped,
      warnings,
      rejections: rejections.slice(0, 50),
      loggerMoves: moves,
      convertedFromFahrenheit: [...new Set(convertedFromFahrenheit)],
      appliedRules: [...appliedRuleCounts.entries()].map(([ruleId, applied]) => ({
        ruleId,
        summary: applied.summary,
        rows: applied.rows,
      })),
      needsLabels: null,
    };

    await client.query(
      `update uploads
          set rows_total = $1, rows_accepted = $2, rows_rejected = $3,
              rows_duplicate = $4, report = $5
        where id = $6`,
      [
        report.rowsTotal,
        report.rowsAccepted,
        report.rowsRejected,
        report.rowsDuplicate,
        report,
        uploadId,
      ],
    );

    await client.query('commit');
    return report;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
