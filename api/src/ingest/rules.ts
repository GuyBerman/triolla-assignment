/**
 * Tunable ingestion rules, in one place so they are easy to review and argue
 * about. Analysis thresholds live separately in `src/analysis/config.ts`.
 */
export const INGEST_RULES = {
  /**
   * Anything outside this is a logger fault code rather than a temperature
   * (loggers write things like -999 or 1348). Wide enough to accept both
   * Celsius and Fahrenheit values, since the unit is resolved afterwards.
   */
  plausibleMinAnyUnit: -100,
  plausibleMaxAnyUnit: 200,

  /** Below this many readings, a median is not worth drawing conclusions from. */
  unitCheckMinReadings: 5,

  /** Median above this is flagged but still imported - a dead fridge gets warm. */
  unitWarnMedianC: 20,

  /** Median above this is refused: no working fridge sits here, so the unit is wrong. */
  unitRejectMedianC: 30,

  /** Upload size ceiling. Summer's real sheet is ~3000 rows, so this is generous. */
  maxUploadBytes: 10 * 1024 * 1024,
} as const;
