import pg from 'pg';

import { config } from '../config';

/**
 * node-postgres returns `numeric` columns as strings to avoid precision loss.
 * Temperatures are stored as `double precision` precisely so we get real
 * numbers back, but `count(*)` still arrives as a bigint string, so callers
 * that aggregate should coerce explicitly rather than trusting the type.
 */
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});
