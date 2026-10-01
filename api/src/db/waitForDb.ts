import { pool } from './pool';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `docker compose up -d` returns as soon as the container is created, which is
 * several seconds before Postgres accepts connections. Without this, running
 * the two README commands back to back dies on ECONNREFUSED and looks like a
 * broken project rather than a cold database.
 */
export async function waitForDb(attempts = 15, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('select 1');
      return;
    } catch (err) {
      if (attempt === attempts) {
        throw new Error(
          `Could not reach Postgres after ${attempts} attempts. ` +
            `Is Docker running? Try: docker compose up -d\n` +
            `Underlying error: ${(err as Error).message}`,
        );
      }
      console.log(`[db] waiting for postgres... (${attempt}/${attempts})`);
      await sleep(delayMs);
    }
  }
}
