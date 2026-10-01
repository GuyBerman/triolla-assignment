/**
 * Thin CLI around the programmatic runner, so `npm run migrate:up` and the
 * automatic migration on server boot go through exactly the same code path.
 */
import { migrateDown, migrateUp } from '../src/db/migrate';
import { pool } from '../src/db/pool';
import { waitForDb } from '../src/db/waitForDb';

const direction = process.argv[2];

if (direction !== 'up' && direction !== 'down') {
  console.error('usage: tsx scripts/migrate.ts <up|down>');
  process.exit(1);
}

try {
  await waitForDb();
  if (direction === 'up') {
    await migrateUp();
  } else {
    await migrateDown();
  }
  console.log(`[db] migrate ${direction} complete`);
} catch (err) {
  console.error(`[db] migrate ${direction} failed:`, err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
