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
export { findExcursions } from './excursions';
export { findGaps, gapThresholdMs, inferCadenceMinutes, robustTrend } from './series';
export { STATUS_ORDER } from './status';

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

  const { excursions: openExcursions, doorEvents } = findExcursions(samples, {
    thresholdC,
    minDurationMinutes: ANALYSIS.excursionMinDurationMinutes,
    maxGapMs,
  });
  // A series that ends above the limit is "ongoing" only while we are still
  // hearing from the fridge. Once it has gone quiet, the last warm reading is
  // the end of what we can report — calling it "still too warm" would claim
  // the hours we cannot see.
  const excursions = closeExcursionsWeStoppedHearing(openExcursions, samples, asOfMs);
  const gaps = findGaps(samples, maxGapMs);
  const drift = findDrift(samples, asOfMs);

  const { status, reason: statusReason } = determineStatus({
    samples,
    asOfMs,
    thresholdC,
    excursions,
    gaps,
    drift,
    timeZone,
    noDataHint,
  });

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

function closeExcursionsWeStoppedHearing(
  excursions: Excursion[],
  samples: Sample[],
  asOfMs: number,
): Excursion[] {
  const last = samples[samples.length - 1];
  if (last === undefined) return excursions;
  const silentForMs = asOfMs - last.at;
  if (silentForMs <= ANALYSIS.staleAfterHours * 3_600_000) return excursions;

  return excursions.map((excursion) => {
    if (!excursion.ongoing) return excursion;
    return { ...excursion, ongoing: false, endedAt: new Date(last.at).toISOString() };
  });
}
