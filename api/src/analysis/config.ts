/**
 * Every judgement the app makes is tuned from here, so there is one place to
 * review and one place to argue about. None of these numbers came from Summer:
 * she gave us "above five degrees", "a jump for one reading is fine" and "a
 * fridge that's slowly warming up is not fine". The rest is inference, and
 * each one is listed in NOTES.md as something to confirm with her.
 */
export const ANALYSIS = {
  /**
   * The Ministry of Health limit Summer quoted. Stored per fridge, so a
   * freezer or a walk-in can differ; this is only the default.
   */
  defaultThresholdC: 5,

  /**
   * The line between "someone opened the door for a delivery" and "this fridge
   * is in trouble". Below this, time above the limit is reported as a door
   * opening and never raises an alarm.
   *
   * Thirty minutes is a guess. It is the single number most worth checking
   * against the actual regulation before this goes live.
   */
  excursionMinDurationMinutes: 30,

  /** Used when there are too few readings to work out the logger's interval. */
  fallbackCadenceMinutes: 15,
  cadenceMinMinutes: 1,
  cadenceMaxMinutes: 240,

  /**
   * A hole counts as missing data past this many sampling intervals, but never
   * sooner than `gapMinMinutes` - otherwise an hourly logger would look full
   * of holes next to a fifteen-minute one.
   */
  gapCadenceMultiple: 4,
  gapMinMinutes: 60,

  /**
   * The trend check. A long window and a low slope on purpose: the point is to
   * notice a fridge dying over two days while it is still inside the limit,
   * which is the case that cost Summer a fridge of dairy in Rishon.
   */
  driftWindowHours: 12,
  driftMinSlopeCPerHour: 0.05,
  driftMinReadings: 8,

  /**
   * How long after its last reading a fridge becomes "no data" rather than
   * "fine". Measured against the newest reading in the data, not against the
   * clock - see `asOf` in src/analysis/index.ts.
   */
  staleAfterHours: 6,

  /** A finished excursion still shows as a warning for this long afterwards. */
  recentExcursionHours: 24,
} as const;
