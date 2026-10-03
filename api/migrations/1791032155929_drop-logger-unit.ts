import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // A logger no longer has a unit. The number in a file is stored as written,
  // and Fahrenheit conversion lives on ingest_rules, not on the logger.
  pgm.dropConstraint('loggers', 'loggers_unit_check');
  pgm.dropColumn('loggers', 'unit');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('loggers', {
    unit: { type: 'text', notNull: true, default: 'C' },
  });
  pgm.addConstraint('loggers', 'loggers_unit_check', {
    check: "unit in ('C', 'F')",
  });
}
