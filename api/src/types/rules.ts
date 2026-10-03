export type RuleUnit = 'as_written' | 'C' | 'F';

export interface ConversionRule {
  id: number;
  matchBranch: string | null;
  matchLogger: string | null;
  matchFridge: string | null;
  unit: RuleUnit;
  multiplyBy: number;
  add: number;
}

/** A rule before it has an id. What the Rules screen sends. */
export interface NewConversionRule {
  matchBranch: string | null;
  matchLogger: string | null;
  matchFridge: string | null;
  unit: RuleUnit;
  multiplyBy: number;
  add: number;
}

/** `ingest_rules` as Postgres returns it. */
export interface RuleRow {
  id: number;
  match_branch: string | null;
  match_logger: string | null;
  match_fridge: string | null;
  unit: RuleUnit;
  multiply_by: number;
  add_c: number;
  created_at: Date;
}