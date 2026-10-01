import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { runner, type RunnerOption } from 'node-pg-migrate';

import { config } from '../config';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../../migrations');

function options(direction: 'up' | 'down'): RunnerOption {
  return {
    databaseUrl: config.databaseUrl,
    dir: migrationsDir,
    migrationsTable: 'pgmigrations',
    direction,
    // A migration that fails halfway should leave no trace, otherwise the next
    // boot tries to re-apply it on top of a half-built schema.
    singleTransaction: true,
    // node-pg-migrate takes a Postgres advisory lock by default, so `tsx watch`
    // restarting mid-migration cannot race another copy of itself.
    count: direction === 'down' ? 1 : undefined,
    verbose: false,
  };
}

export async function migrateUp(): Promise<void> {
  const applied = await runner(options('up'));
  if (applied.length > 0) {
    console.log(`[db] applied ${applied.length} migration(s): ${applied.map((m) => m.name).join(', ')}`);
  }
}

export async function migrateDown(): Promise<void> {
  const reverted = await runner(options('down'));
  console.log(`[db] reverted ${reverted.length} migration(s)`);
}
