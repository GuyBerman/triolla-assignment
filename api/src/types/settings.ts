/** `analysis_settings` as Postgres returns it. */
export interface SettingsRow {
  excursion_min_duration_minutes: number;
  stale_after_hours: number;
  recent_gap_hours: number;
  drift_window_hours: number;
  drift_min_window_hours: number;
  drift_min_rise_c: number;
  drift_min_slope_c_per_hour: number;
  gap_min_minutes: number;
}

/**
 * The judgements she can change. Cadence clamps and "at least this many
 * readings" stay in code: those stop a broken calculation, they are not a
 * decision about whether a fridge is in trouble.
 */
export interface AnalysisSettings {
  excursionMinDurationMinutes: number;
  staleAfterHours: number;
  recentGapHours: number;
  driftWindowHours: number;
  driftMinWindowHours: number;
  driftMinRiseC: number;
  driftMinSlopeCPerHour: number;
  gapMinMinutes: number;
}
