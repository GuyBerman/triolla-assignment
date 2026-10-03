import type { AnalysisSettings } from './settings';
import type { DoorEvent, Drift, Excursion, FridgeStatus, Gap, Reading, Sample } from './fridge';

export interface AnalyseInput {
  /** Every reading for one fridge, in time order, including failed ones. */
  readings: Reading[];
  thresholdC: number;
  /**
   * The moment to treat as "now".
   *
   * This is the newest reading in the dataset, not the wall clock. Summer
   * uploads a batch of files once a week, so the last thing she sent is her
   * present; judging freshness against the real clock would mark every fridge
   * "no data" the day after an upload and make the dashboard useless.
   */
  asOfMs: number;
  timeZone: string;
  noDataHint?: string | null;
  /** Saved judgements. Omitted in tests, which then use the defaults. */
  settings?: AnalysisSettings;
}

export interface AnalysisResult {
  samples: Sample[];
  cadenceMinutes: number;
  excursions: Excursion[];
  doorEvents: DoorEvent[];
  gaps: Gap[];
  drift: Drift | null;
  status: FridgeStatus;
  statusReason: string;
}