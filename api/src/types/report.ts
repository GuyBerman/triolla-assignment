import type { Excursion } from './fridge';

export interface ExcursionReportRow {
  fridgeId: number;
  fridgeName: string;
  branchName: string;
  thresholdC: number;
  excursions: Excursion[];
}

export interface ExcursionReport {
  from: string;
  to: string;
  generatedAt: string;
  rows: ExcursionReportRow[];
  totalExcursions: number;
  /** The duration she had set when this report was built, so the sentences match the rows. */
  excursionMinDurationMinutes: number;
}
