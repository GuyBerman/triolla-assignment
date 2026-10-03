import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  /**
   * The judgements Summer can change from the Settings tab. One row, because
   * these apply to every fridge. A fridge's own degree limit stays on
   * `fridges.threshold_c`. No row yet means the defaults in code still apply.
   *
   * The checks match `parseAnalysisSettings`. A duration of 0 would turn a
   * single reading into Too warm, which is the door-opening rule.
   */
  pgm.createTable('analysis_settings', {
    id: { type: 'boolean', primaryKey: true, default: true },
    excursion_min_duration_minutes: { type: 'integer', notNull: true },
    stale_after_hours: { type: 'integer', notNull: true },
    recent_gap_hours: { type: 'integer', notNull: true },
    drift_window_hours: { type: 'integer', notNull: true },
    drift_min_window_hours: { type: 'integer', notNull: true },
    drift_min_rise_c: { type: 'double precision', notNull: true },
    drift_min_slope_c_per_hour: { type: 'double precision', notNull: true },
    gap_min_minutes: { type: 'integer', notNull: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('analysis_settings', 'analysis_settings_one_row', {
    check: 'id',
  });
  pgm.addConstraint('analysis_settings', 'analysis_settings_duration', {
    check: 'excursion_min_duration_minutes between 1 and 1440',
  });
  pgm.addConstraint('analysis_settings', 'analysis_settings_stale', {
    check: 'stale_after_hours between 1 and 168',
  });
  pgm.addConstraint('analysis_settings', 'analysis_settings_recent_gap', {
    check: 'recent_gap_hours between 1 and 720',
  });
  pgm.addConstraint('analysis_settings', 'analysis_settings_drift_window', {
    check: 'drift_window_hours between 1 and 168 and drift_min_window_hours between 1 and 168 and drift_min_window_hours <= drift_window_hours',
  });
  pgm.addConstraint('analysis_settings', 'analysis_settings_drift_rise', {
    check: 'drift_min_rise_c between 0.1 and 20 and drift_min_slope_c_per_hour between 0.01 and 5',
  });
  pgm.addConstraint('analysis_settings', 'analysis_settings_gap_floor', {
    check: 'gap_min_minutes between 15 and 1440',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('analysis_settings');
}
