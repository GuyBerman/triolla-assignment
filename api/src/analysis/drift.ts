import type { AnalysisSettings, Drift, Sample } from '../types';
import { ANALYSIS } from './config';
import { defaultAnalysisSettings } from './settings';
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
export function findDrift(
  samples: Sample[],
  asOfMs: number,
  settings: AnalysisSettings = defaultAnalysisSettings(),
): Drift | null {
  const windowStartMs = asOfMs - settings.driftWindowHours * 3_600_000;
  const window = samples.filter((sample) => sample.at >= windowStartMs && sample.at <= asOfMs);

  // How many points are enough to trust a median stays a code clamp. It
  // depends on the logger, and a box for it would not mean anything to her.
  if (window.length < ANALYSIS.driftMinReadings) return null;

  // A slope on its own is not enough evidence.
  //
  // 0.05 C/hour across the full twelve hours is a real 0.6 degree climb, but
  // the same slope across the hour and a half of data a fridge might have just
  // after an upload is a tenth of a degree - noise, reported as "warming up".
  // Both a long enough window and a large enough actual rise are required.
  const spanHours = (window[window.length - 1]!.at - window[0]!.at) / 3_600_000;
  if (spanHours < settings.driftMinWindowHours) return null;

  const trend = robustTrend(window);
  if (trend === null || trend.slopeCPerHour < settings.driftMinSlopeCPerHour) return null;
  if (trend.secondHalfC - trend.firstHalfC < settings.driftMinRiseC) return null;

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
