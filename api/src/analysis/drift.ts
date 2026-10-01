import type { Drift, Sample } from '../types';
import { ANALYSIS } from './config';
import { robustTrend } from './series';

/**
 * Catches a fridge that is warming up steadily while still inside the limit.
 *
 * This is the only check that would have helped in Rishon. Summer said the
 * fridge "had been slowly dying for two days" before anyone noticed, and a
 * threshold alarm by definition cannot fire until the stock is already warm.
 * A rising trend fires while there is still time to do something about it.
 *
 * The window is the most recent `driftWindowHours`, because the question being
 * answered is "is this fridge in trouble right now", not "was it ever".
 */
export function findDrift(samples: Sample[], asOfMs: number): Drift | null {
  const windowStartMs = asOfMs - ANALYSIS.driftWindowHours * 3_600_000;
  const window = samples.filter((sample) => sample.at >= windowStartMs && sample.at <= asOfMs);

  if (window.length < ANALYSIS.driftMinReadings) return null;

  const trend = robustTrend(window);
  if (trend === null || trend.slopeCPerHour < ANALYSIS.driftMinSlopeCPerHour) return null;

  return {
    slopeCPerHour: Math.round(trend.slopeCPerHour * 1000) / 1000,
    windowStart: new Date(window[0]!.at).toISOString(),
    windowEnd: new Date(window[window.length - 1]!.at).toISOString(),
    // The representative temperature of each half of the window, not the first
    // and last individual readings - those are noisy enough to contradict the
    // direction they are describing.
    startC: Math.round(trend.firstHalfC * 100) / 100,
    endC: Math.round(trend.secondHalfC * 100) / 100,
  };
}
