/**
 * Loads the sample files in `data/` through the real upload pipeline - the
 * same code path the app's upload screen uses, not a shortcut that writes
 * straight to the tables. If seeding works, uploading works.
 *
 * Run with: npm run seed        (safe to repeat; duplicates are skipped)
 *           npm run seed -- --reset   (empty the tables first)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrateUp } from '../src/db/migrate';
import { pool } from '../src/db/pool';
import { waitForDb } from '../src/db/waitForDb';
import { ingestFile } from '../src/ingest/ingest';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../data');

/**
 * Order matters for one of these. Tel Aviv's walk-in file has to land before
 * the display-fridge file, otherwise the logger looks like it moved backwards.
 * Real uploads arrive in whatever order Summer sends them, which is why
 * `syncAssignments` also handles the out-of-order case.
 */
const FILES = [
  'jerusalem-dairy.csv',
  'haifa-dairy.csv',
  'telaviv-walkin.csv',
  'telaviv-display2.csv',
  'rishon-creamcakes.csv',
  'other-branches.csv',
];

async function main() {
  await waitForDb();
  await migrateUp();

  if (process.argv.includes('--reset')) {
    // analysis_settings stays. It is her configuration, not the sample files.
    await pool.query(
      'truncate readings, logger_assignments, uploads, loggers, fridges, branches, ingest_rules restart identity cascade',
    );
    console.log('[seed] cleared existing data');
  }

  for (const filename of FILES) {
    const content = readFileSync(resolve(dataDir, filename), 'utf8');
    const report = await ingestFile(filename, content);

    console.log(
      `\n${filename}\n` +
        `  accepted ${report.rowsAccepted}, rejected ${report.rowsRejected}, ` +
        `duplicate ${report.rowsDuplicate} (of ${report.rowsTotal} rows)`,
    );
    for (const warning of report.warnings) {
      console.log(`  note: ${warning}`);
    }
    for (const move of report.loggerMoves) {
      console.log(
        `  move: ${move.loggerCode} ${move.fromFridge ?? '(new)'} -> ${move.toFridge} at ${move.at}`,
      );
    }
    if (report.convertedFromFahrenheit.length > 0) {
      console.log(`  converted from Fahrenheit: ${report.convertedFromFahrenheit.join(', ')}`);
    }
  }

  const summary = await pool.query<{ branches: string; fridges: string; readings: string }>(
    `select (select count(*) from branches)::text as branches,
            (select count(*) from fridges)::text  as fridges,
            (select count(*) from readings)::text as readings`,
  );
  const row = summary.rows[0]!;
  console.log(
    `\n[seed] done: ${row.branches} branches, ${row.fridges} fridges, ${row.readings} readings`,
  );
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
