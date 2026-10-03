/**
 * Defaults for every judgement, and the clamps that are not a judgement.
 *
 * She can change the judgements (how long is too warm, when a logger is
 * silent, what counts as warming up or a gap) from Settings → Limits. Those
 * saved values are passed into the analysis; this object is what applies
 * until she saves something else. The cadence clamps and the minimum number
 * of readings stay here on purpose: they stop a broken calculation, and
 * putting them on a form would let a typo call noise a trend.
 *
 * None of these numbers came from Summer. She gave us "above five degrees",
 * "a jump for one reading is fine" and "a fridge that's slowly warming up is
 * not fine". The rest is inference, listed in NOTES.md.
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
   * Guards against calling noise a trend. Both must be met as well as the
   * slope: at least this many hours of readings to judge from, and at least
   * this much genuine rise across them.
   */
  driftMinWindowHours: 4,
  driftMinRiseC: 0.4,

  /**
   * How long after its last reading a fridge becomes "no data" rather than
   * "fine". Measured against the newest reading in the data, not against the
   * clock - see `asOf` in src/analysis/index.ts.
   */
  staleAfterHours: 6,

  /**
   * How recent a hole in the readings has to be to show as a warning on a
   * fridge that is otherwise behaving.
   *
   * A finished excursion has no equivalent setting on purpose: it stays a
   * warning for the whole period on screen. See the comment in status.ts.
   */
  recentGapHours: 24,
} as const;
