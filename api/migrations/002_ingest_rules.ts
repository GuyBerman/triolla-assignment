import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  /**
   * How to turn a file's number into Celsius for a given branch, fridge or
   * logger. Fahrenheit vs Celsius is one case; a scale factor (temp × 1.5)
   * or a calibration offset is another. Without this, the only lever is
   * guessing the unit from the numbers, which is the thing we cannot afford
   * to get wrong.
   */
  pgm.createTable('ingest_rules', {
    id: 'id',
    match_branch: { type: 'text' },
    match_logger: { type: 'text' },
    match_fridge: { type: 'text' },
    // as_written: keep whatever unit the file/logger already resolved to.
    unit: { type: 'text', notNull: true, default: 'as_written' },
    multiply_by: { type: 'double precision', notNull: true, default: 1 },
    add_c: { type: 'double precision', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('ingest_rules', 'ingest_rules_unit_check', {
    check: "unit in ('as_written', 'C', 'F')",
  });

  // A rule that matches nothing would silently apply to every row.
  pgm.addConstraint('ingest_rules', 'ingest_rules_has_target', {
    check:
      'match_branch is not null or match_logger is not null or match_fridge is not null',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('ingest_rules');
}
