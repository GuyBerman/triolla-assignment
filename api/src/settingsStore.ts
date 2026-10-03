import { defaultAnalysisSettings } from './analysis/settings';
import { pool } from './db/pool';
import type { AnalysisSettings, SettingsRow } from './types';

/**
 * One row. An empty table means she has not saved anything yet, so the
 * defaults in code still apply. Seed --reset leaves this table alone: it is
 * her configuration, not sample data.
 */
export async function getAnalysisSettings(): Promise<AnalysisSettings> {
  const result = await pool.query<SettingsRow>(
    `select excursion_min_duration_minutes, stale_after_hours, recent_gap_hours,
            drift_window_hours, drift_min_window_hours, drift_min_rise_c,
            drift_min_slope_c_per_hour, gap_min_minutes
       from analysis_settings
      where id = true`,
  );
  const row = result.rows[0];
  if (row === undefined) return defaultAnalysisSettings();
  return toSettings(row);
}

export async function saveAnalysisSettings(settings: AnalysisSettings): Promise<AnalysisSettings> {
  const result = await pool.query<SettingsRow>(
    `insert into analysis_settings (
       id, excursion_min_duration_minutes, stale_after_hours, recent_gap_hours,
       drift_window_hours, drift_min_window_hours, drift_min_rise_c,
       drift_min_slope_c_per_hour, gap_min_minutes
     ) values (true, $1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (id) do update set
       excursion_min_duration_minutes = excluded.excursion_min_duration_minutes,
       stale_after_hours = excluded.stale_after_hours,
       recent_gap_hours = excluded.recent_gap_hours,
       drift_window_hours = excluded.drift_window_hours,
       drift_min_window_hours = excluded.drift_min_window_hours,
       drift_min_rise_c = excluded.drift_min_rise_c,
       drift_min_slope_c_per_hour = excluded.drift_min_slope_c_per_hour,
       gap_min_minutes = excluded.gap_min_minutes,
       updated_at = now()
     returning excursion_min_duration_minutes, stale_after_hours, recent_gap_hours,
               drift_window_hours, drift_min_window_hours, drift_min_rise_c,
               drift_min_slope_c_per_hour, gap_min_minutes`,
    [
      settings.excursionMinDurationMinutes,
      settings.staleAfterHours,
      settings.recentGapHours,
      settings.driftWindowHours,
      settings.driftMinWindowHours,
      settings.driftMinRiseC,
      settings.driftMinSlopeCPerHour,
      settings.gapMinMinutes,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) return settings;
  return toSettings(row);
}

function toSettings(row: SettingsRow): AnalysisSettings {
  return {
    excursionMinDurationMinutes: Number(row.excursion_min_duration_minutes),
    staleAfterHours: Number(row.stale_after_hours),
    recentGapHours: Number(row.recent_gap_hours),
    driftWindowHours: Number(row.drift_window_hours),
    driftMinWindowHours: Number(row.drift_min_window_hours),
    driftMinRiseC: Number(row.drift_min_rise_c),
    driftMinSlopeCPerHour: Number(row.drift_min_slope_c_per_hour),
    gapMinMinutes: Number(row.gap_min_minutes),
  };
}
