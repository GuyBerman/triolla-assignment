import type { ConversionRule } from './ingest/conversion';
import { describeRule, type RuleUnit } from './ingest/conversion';
import { pool } from './db/pool';

interface RuleRow {
  id: number;
  match_branch: string | null;
  match_logger: string | null;
  match_fridge: string | null;
  unit: RuleUnit;
  multiply_by: number;
  add_c: number;
  created_at: Date;
}

function toRule(row: RuleRow): ConversionRule & { createdAt: string; summary: string } {
  const rule: ConversionRule = {
    id: row.id,
    matchBranch: row.match_branch,
    matchLogger: row.match_logger,
    matchFridge: row.match_fridge,
    unit: row.unit,
    multiplyBy: row.multiply_by,
    add: row.add_c,
  };
  return {
    ...rule,
    createdAt: row.created_at.toISOString(),
    summary: describeRule(rule),
  };
}

const SELECT = `select id, match_branch, match_logger, match_fridge, unit,
                        multiply_by, add_c, created_at
                   from ingest_rules
                  order by id`;

export async function listConversionRules() {
  const result = await pool.query<RuleRow>(SELECT);
  return result.rows.map(toRule);
}

interface NewConversionRule {
  matchBranch: string | null;
  matchLogger: string | null;
  matchFridge: string | null;
  unit: RuleUnit;
  multiplyBy: number;
  add: number;
}

export async function insertConversionRule(input: NewConversionRule) {
  const result = await pool.query<RuleRow>(
    `insert into ingest_rules
       (match_branch, match_logger, match_fridge, unit, multiply_by, add_c)
     values ($1, $2, $3, $4, $5, $6)
     returning id, match_branch, match_logger, match_fridge, unit,
               multiply_by, add_c, created_at`,
    [
      input.matchBranch,
      input.matchLogger,
      input.matchFridge,
      input.unit,
      input.multiplyBy,
      input.add,
    ],
  );
  return toRule(result.rows[0]!);
}

export async function deleteConversionRule(id: number): Promise<boolean> {
  const result = await pool.query(`delete from ingest_rules where id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
