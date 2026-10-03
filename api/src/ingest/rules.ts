/**
 * Tunable ingestion rules, in one place so they are easy to review and argue
 * about. Analysis thresholds live separately in `src/analysis/config.ts`.
 */
export const INGEST_RULES = {
  /**
   * Anything outside this is a logger fault code rather than a temperature
   * (loggers write things like -999 or 1348). Wide enough for a Celsius or
   * Fahrenheit number, because the file's number is stored as written.
   */
  plausibleMinAnyUnit: -100,
  plausibleMaxAnyUnit: 200,

  /** Upload size ceiling. Summer's real sheet is ~3000 rows, so this is generous. */
  maxUploadBytes: 10 * 1024 * 1024,
} as const;
