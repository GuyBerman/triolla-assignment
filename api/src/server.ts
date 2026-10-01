import { createApp } from './app';
import { config } from './config';
import { migrateUp } from './db/migrate';
import { waitForDb } from './db/waitForDb';

async function main() {
  // Order matters: a cold Postgres, then schema, then accept traffic. Nobody
  // should have to run a migration command by hand to get this running.
  await waitForDb();
  await migrateUp();

  createApp().listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('[api] failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
