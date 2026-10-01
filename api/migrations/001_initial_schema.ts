import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('branches', {
    id: 'id',
    // What Summer typed, preserved for display: "Tel Aviv".
    name: { type: 'text', notNull: true },
    // Case- and whitespace-folded key, so "tel aviv" and "Tel Aviv" collapse
    // into one branch instead of showing up as two.
    canonical_name: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('fridges', {
    id: 'id',
    branch_id: {
      type: 'integer',
      notNull: true,
      references: 'branches',
      onDelete: 'CASCADE',
    },
    name: { type: 'text', notNull: true },
    canonical_name: { type: 'text', notNull: true },
    // Summer only ever mentioned five degrees. Per-fridge so a walk-in or a
    // freezer can differ later without a migration. See NOTES.md.
    threshold_c: { type: 'double precision', notNull: true, default: 5 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('fridges', 'fridges_branch_name_unique', {
    unique: ['branch_id', 'canonical_name'],
  });

  pgm.createTable('loggers', {
    id: 'id',
    // "TL-0231"
    code: { type: 'text', notNull: true, unique: true },
    // The Haifa fix lives here: TL-0231 reports Fahrenheit, everything else
    // reports Celsius. Per-logger rather than per-branch, because the logger
    // is the thing that was replaced, not the branch.
    unit: { type: 'text', notNull: true, default: 'C' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('loggers', 'loggers_unit_check', {
    check: "unit in ('C', 'F')",
  });

  /**
   * A logger is not permanently part of a fridge - Summer moved a Tel Aviv
   * logger into the new display fridge. Modelling the link as a time window
   * means readings from before the move stay attributed to the walk-in, which
   * is what an inspector asking about a specific fridge needs.
   */
  pgm.createTable('logger_assignments', {
    id: 'id',
    logger_id: {
      type: 'integer',
      notNull: true,
      references: 'loggers',
      onDelete: 'CASCADE',
    },
    fridge_id: {
      type: 'integer',
      notNull: true,
      references: 'fridges',
      onDelete: 'CASCADE',
    },
    valid_from: { type: 'timestamptz', notNull: true },
    // null means "still there"
    valid_to: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('logger_assignments', ['logger_id', 'valid_from']);

  pgm.createTable('uploads', {
    id: 'id',
    filename: { type: 'text', notNull: true },
    uploaded_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    rows_total: { type: 'integer', notNull: true, default: 0 },
    rows_accepted: { type: 'integer', notNull: true, default: 0 },
    rows_rejected: { type: 'integer', notNull: true, default: 0 },
    rows_duplicate: { type: 'integer', notNull: true, default: 0 },
    // Full ingest report: column mapping, warnings, per-row rejections.
    report: { type: 'jsonb', notNull: true, default: '{}' },
  });

  pgm.createTable('readings', {
    id: { type: 'bigserial', primaryKey: true },
    logger_id: {
      type: 'integer',
      notNull: true,
      references: 'loggers',
      onDelete: 'CASCADE',
    },
    // Denormalised from logger_assignments at ingest time so that queries for
    // "this fridge between these dates" stay a single indexed scan.
    fridge_id: {
      type: 'integer',
      notNull: true,
      references: 'fridges',
      onDelete: 'CASCADE',
    },
    recorded_at: { type: 'timestamptz', notNull: true },
    // double precision, not numeric: node-postgres hands numeric back as a
    // string, and a silently stringified temperature breaks every comparison
    // downstream. null when the logger wrote something unparseable.
    temp_c: { type: 'double precision' },
    // Exactly what was in the file ("38.3", "ERR"). An inspector-facing tool
    // has to be able to show the original alongside the converted value.
    raw_value: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true },
    upload_id: { type: 'integer', references: 'uploads', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('readings', 'readings_status_check', {
    check: "status in ('ok', 'error')",
  });
  /**
   * The deduplication mechanism. Summer re-pastes files and the sample sheet
   * already contains TL-0512 at 06:15 twice. Enforcing it here rather than in
   * application code means it holds no matter which path writes a reading.
   */
  pgm.addConstraint('readings', 'readings_logger_time_unique', {
    unique: ['logger_id', 'recorded_at'],
  });
  pgm.createIndex('readings', ['fridge_id', 'recorded_at']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('readings');
  pgm.dropTable('uploads');
  pgm.dropTable('logger_assignments');
  pgm.dropTable('loggers');
  pgm.dropTable('fridges');
  pgm.dropTable('branches');
}
