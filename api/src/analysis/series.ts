import type { Gap, Sample } from '../types';
import { ANALYSIS } from './config';

const MINUTE = 60_000;

/**
 * Works out how often this logger actually reports, rather than assuming.
 *
 * Summer's files come from different devices at different intervals, and the
 * difference matters: a one-hour hole is nothing for an hourly logger and a
 * clear fault for a fifteen-minute one. The median is used rather than the
 * mean so that one large hole does not drag the estimate out.
 */
export function inferCadenceMinutes(timestampsMs: number[]): number {
  if (timestampsMs.length < 3) return ANALYSIS.fallbackCadenceMinutes;

  const deltas: number[] = [];
  for (let index = 1; index < timestampsMs.length; index += 1) {
    const delta = timestampsMs[index]! - timestampsMs[index - 1]!;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return ANALYSIS.fallbackCadenceMinutes;

  deltas.sort((a, b) => a - b);
  const middle = Math.floor(deltas.length / 2);
  const medianMs =
    deltas.length % 2 === 1
      ? deltas[middle]!
      : (deltas[middle - 1]! + deltas[middle]!) / 2;

  const minutes = medianMs / MINUTE;
  return Math.min(
    ANALYSIS.cadenceMaxMinutes,
    Math.max(ANALYSIS.cadenceMinMinutes, Math.round(minutes * 10) / 10),
  );
}

/**
 * How long a hole has to be, for this logger, before it counts as missing data.
 * `gapMinMinutes` is her floor; the multiple of the logger's own cadence stays
 * in code so an hourly logger is not full of holes next to a fifteen-minute one.
 */
export function gapThresholdMs(
  cadenceMinutes: number,
  gapMinMinutes: number = ANALYSIS.gapMinMinutes,
): number {
  return Math.max(cadenceMinutes * ANALYSIS.gapCadenceMultiple, gapMinMinutes) * MINUTE;
}

/**
 * Holes in the record.
 *
 * Summer said she never knows whether the logger died, the battery ran out, or
 * it just didn't save - so the app does not pretend to know either. It reports
 * the hole and leaves the cause blank. What it must never do is draw a line
 * straight across the hole, because that reads as a fridge that was fine.
 */
export function findGaps(samples: Sample[], thresholdMs: number): Gap[] {
  const gaps: Gap[] = [];

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    const delta = current.at - previous.at;

    if (delta > thresholdMs) {
      gaps.push({
        startedAt: new Date(previous.at).toISOString(),
        endedAt: new Date(current.at).toISOString(),
        durationMinutes: Math.round(delta / MINUTE),
      });
    }
  }

  return gaps;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

interface Trend {
  /** Degrees per hour. Positive means warming. */
  slopeCPerHour: number;
  /** Typical temperature in the earlier half of the window. */
  firstHalfC: number;
  /** Typical temperature in the later half. */
  secondHalfC: number;
}

/**
 * The rate a fridge is warming or cooling, measured by comparing the typical
 * temperature in the first half of the window with the second half.
 *
 * A least-squares line was the obvious choice here and it was wrong: a single
 * door-opening spike near one end of the window tilts the whole line, so
 * healthy fridges with busy doors were reported as drifting upward. Summer
 * explicitly told us door openings are fine, so a trend estimate that they can
 * trigger is not fit for purpose.
 *
 * Comparing medians fixes that - one reading five degrees out barely moves a
 * median - and it has the side benefit of giving two numbers that are safe to
 * show her, because they cannot disagree with the direction they describe.
 */
export function robustTrend(samples: Sample[]): Trend | null {
  if (samples.length < 4) return null;

  const midpoint = Math.floor(samples.length / 2);
  const firstHalf = samples.slice(0, midpoint);
  const secondHalf = samples.slice(midpoint);

  const firstHalfC = median(firstHalf.map((sample) => sample.tempC));
  const secondHalfC = median(secondHalf.map((sample) => sample.tempC));
  const firstAt = median(firstHalf.map((sample) => sample.at));
  const secondAt = median(secondHalf.map((sample) => sample.at));

  if (firstHalfC === null || secondHalfC === null || firstAt === null || secondAt === null) {
    return null;
  }

  const hours = (secondAt - firstAt) / 3_600_000;
  if (hours <= 0) return null;

  return {
    slopeCPerHour: (secondHalfC - firstHalfC) / hours,
    firstHalfC,
    secondHalfC,
  };
}
