import type {
  DoorEvent,
  Drift,
  Excursion,
  FridgeStatus,
  Gap,
  Reading,
  Sample,
} from '../types';
import { ANALYSIS } from './config';
import { findDrift } from './drift';
import { findExcursions } from './excursions';
import { findGaps, gapThresholdMs, inferCadenceMinutes } from './series';
import { determineStatus } from './status';

export { ANALYSIS } from './config';
export { findDrift } from './drift';
export { findExcursions } from './excursions';
export { findGaps, gapThresholdMs, inferCadenceMinutes, median, robustTrend } from './series';
export { determineStatus, STATUS_ORDER } from './status';

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

export function analyseReadings(input: AnalyseInput): AnalysisResult {
  const { readings, thresholdC, asOfMs, timeZone, noDataHint } = input;

  // Cadence comes from every timestamp the logger wrote, including the ones
  // where it failed to read, because that is its true reporting interval.
  const cadenceMinutes = inferCadenceMinutes(
    readings.map((reading) => new Date(reading.recordedAt).getTime()),
  );
  const maxGapMs = gapThresholdMs(cadenceMinutes);

  // Everything else works on readings that produced an actual number. An ERR
  // is not a temperature, and treating it as one is how a missing reading
  // turns into a reassuring one.
  const samples: Sample[] = readings
    .filter((reading): reading is Reading & { tempC: number } => reading.tempC !== null)
    .map((reading) => ({ at: new Date(reading.recordedAt).getTime(), tempC: reading.tempC }))
    .sort((a, b) => a.at - b.at);

  const { excursions, doorEvents } = findExcursions(samples, {
    thresholdC,
    minDurationMinutes: ANALYSIS.excursionMinDurationMinutes,
    maxGapMs,
  });
  const gaps = findGaps(samples, maxGapMs);
  const drift = findDrift(samples, asOfMs);

  const { status, statusReason } = (() => {
    const result = determineStatus({
      samples,
      asOfMs,
      thresholdC,
      excursions,
      gaps,
      drift,
      timeZone,
      noDataHint,
    });
    return { status: result.status, statusReason: result.reason };
  })();

  return {
    samples,
    cadenceMinutes,
    excursions,
    doorEvents,
    gaps,
    drift,
    status,
    statusReason,
  };
}
