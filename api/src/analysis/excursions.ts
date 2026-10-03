import type { DoorEvent, Excursion, Sample } from '../types';
import { ANALYSIS } from './config';

const MINUTE = 60_000;

interface ExcursionOptions {
  thresholdC: number;
  /** Runs shorter than this are door openings, not violations. */
  minDurationMinutes?: number;
  /**
   * A warm period is not allowed to span a hole in the data. Without this, a
   * reading above five on Monday and another on Thursday with nothing in
   * between would be reported as a single three-day violation we cannot prove.
   */
  maxGapMs: number;
}

interface ExcursionResult {
  excursions: Excursion[];
  doorEvents: DoorEvent[];
}

/**
 * Splits the series into maximal runs of consecutive readings above the limit.
 *
 * Readings the logger failed to take are already absent from `samples`, so an
 * ERR in the middle of a warm period does not artificially end it - but a hole
 * longer than `maxGapMs` does, because beyond that we genuinely do not know
 * what the fridge was doing.
 */
function runsAboveThreshold(samples: Sample[], options: ExcursionOptions): Sample[][] {
  const runs: Sample[][] = [];
  let current: Sample[] = [];

  samples.forEach((sample, index) => {
    const previous = index > 0 ? samples[index - 1] : undefined;

    if (sample.tempC > options.thresholdC) {
      const brokenByGap =
        current.length > 0 && previous !== undefined && sample.at - previous.at > options.maxGapMs;

      if (brokenByGap) {
        runs.push(current);
        current = [];
      }
      current.push(sample);
      return;
    }

    if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  });

  if (current.length > 0) runs.push(current);
  return runs;
}

/**
 * The rule Summer actually described: "someone opens the door for a delivery
 * and you see a jump for one reading, and that is fine. A fridge that's slowly
 * warming up is not fine."
 *
 * So time above the limit is only a violation once it has lasted. A single
 * spike - Tel Aviv's 9.4 at 06:15, back to 4.3 by 06:30 - is reported as a
 * door opening and never raises an alarm.
 *
 * Duration is measured between the first and last readings actually observed
 * above the limit. The fridge really crossed the line at some point in the
 * interval before the first of them, so this slightly understates it; the
 * alternative is claiming time we cannot evidence to an inspector.
 */
export function findExcursions(samples: Sample[], options: ExcursionOptions): ExcursionResult {
  const minDurationMs =
    (options.minDurationMinutes ?? ANALYSIS.excursionMinDurationMinutes) * MINUTE;

  const excursions: Excursion[] = [];
  const doorEvents: DoorEvent[] = [];
  const lastSample = samples[samples.length - 1];

  for (const run of runsAboveThreshold(samples, options)) {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    const durationMs = last.at - first.at;

    if (durationMs < minDurationMs) {
      doorEvents.push({
        at: new Date(first.at).toISOString(),
        durationMinutes: Math.round(durationMs / MINUTE),
        peakC: Math.max(...run.map((sample) => sample.tempC)),
      });
      continue;
    }

    // Still above the limit at the most recent reading we have: this is not
    // history, it is happening now.
    const ongoing = lastSample !== undefined && last.at === lastSample.at;
    const sum = run.reduce((total, sample) => total + sample.tempC, 0);

    excursions.push({
      startedAt: new Date(first.at).toISOString(),
      endedAt: ongoing ? null : new Date(last.at).toISOString(),
      durationMinutes: Math.round(durationMs / MINUTE),
      peakC: Math.round(Math.max(...run.map((sample) => sample.tempC)) * 100) / 100,
      meanC: Math.round((sum / run.length) * 100) / 100,
      readingCount: run.length,
      ongoing,
    });
  }

  return { excursions, doorEvents };
}
