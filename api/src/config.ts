/**
 * All runtime configuration in one place. Defaults are chosen so that
 * `docker compose up -d && npm run dev` works with no .env file at all.
 */
export const config = {
  port: Number(process.env.PORT ?? 4000),

  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5433/squanchy',

  /**
   * Logger files carry a wall-clock time with no offset ("2026-09-14 06:00").
   * Squanchy Bakery is an Israeli chain, so we read those as local Israeli
   * time and store UTC. See NOTES.md - this is an assumption, not a given.
   */
  timezone: process.env.LOGGER_TIMEZONE ?? 'Asia/Jerusalem',
} as const;
