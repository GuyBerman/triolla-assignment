import { describeDuration, formatDateTime, formatTemperature } from '../format';
import type { AnalysisSettings, Drift, Excursion, FridgeStatus, Gap, Sample } from '../types';
import { defaultAnalysisSettings } from './settings';

interface StatusInput {
  /** Readings with a usable temperature, in time order. */
  samples: Sample[];
  /** The newest reading in the whole dataset - see index.ts for why. */
  asOfMs: number;
  thresholdC: number;
  excursions: Excursion[];
  gaps: Gap[];
  drift: Drift | null;
  timeZone: string;
  /** Extra context for an unmonitored fridge, e.g. its logger was moved out. */
  noDataHint?: string | null;
  settings?: AnalysisSettings;
}

interface StatusResult {
  status: FridgeStatus;
  /** Written to be read by someone who is not technical and is in a hurry. */
  reason: string;
}

/**
 * Collapses everything known about a fridge into one of four states.
 *
 * The ordering is the important part. "No data" outranks "fine", because a
 * fridge we have stopped hearing from is not a fridge that is behaving - that
 * conflation is how the Rishon dairy was lost. And an alarm outranks a
 * warning, so the worst thing is always the thing on the card.
 */
export function determineStatus(input: StatusInput): StatusResult {
  const { samples, asOfMs, thresholdC, excursions, gaps, drift, timeZone } = input;
  const settings = input.settings ?? defaultAnalysisSettings();

  if (samples.length === 0) {
    return {
      status: 'no_data',
      reason: input.noDataHint ?? 'No readings have been uploaded for this fridge.',
    };
  }

  const last = samples[samples.length - 1]!;
  const staleMs = settings.staleAfterHours * 3_600_000;
  const silentForMs = asOfMs - last.at;

  if (silentForMs > staleMs) {
    const since = describeDuration(silentForMs / 60_000);
    const base =
      `No readings for ${since}. The last one was ${formatTemperature(last.tempC)} on ` +
      `${formatDateTime(last.at, timeZone)}.`;
    return {
      status: 'no_data',
      // Deliberately does not guess the cause: Summer said she can never tell
      // whether the logger died, the battery ran out, or it just didn't save.
      reason: input.noDataHint ? `${base} ${input.noDataHint}` : base,
    };
  }

  const ongoing = excursions.find((excursion) => excursion.ongoing);
  if (ongoing) {
    return {
      status: 'alarm',
      reason:
        `Above ${formatTemperature(thresholdC)} since ` +
        `${formatDateTime(ongoing.startedAt, timeZone)} - that is ` +
        `${describeDuration(ongoing.durationMinutes)} so far, peaking at ` +
        `${formatTemperature(ongoing.peakC)}.`,
    };
  }

  if (drift) {
    // Derived from the values as displayed, so the figures in the sentence add
    // up. Taking the difference before rounding produced "4.0°C to 4.4°C
    // (+0.5°)", which invites exactly the distrust this tool cannot afford.
    const startC = Number(drift.startC.toFixed(1));
    const endC = Number(drift.endC.toFixed(1));
    const rise = Number((endC - startC).toFixed(1));

    return {
      status: 'warning',
      reason:
        `Warming up: ${formatTemperature(startC)} to ${formatTemperature(endC)} ` +
        `over the last ${describeDuration(
          (new Date(drift.windowEnd).getTime() - new Date(drift.windowStart).getTime()) / 60_000,
        )} ` +
        `(${rise >= 0 ? '+' : ''}${rise.toFixed(1)}°). Still under ` +
        `${formatTemperature(thresholdC)}, but heading the wrong way.`,
    };
  }

  // A recovered breach stays a warning for the whole period on screen.
  // A 24-hour cutoff turned Rishon green days after it sat at 8°C.
  const latest = excursions.at(-1);
  if (latest) {
    const earlier = excursions.length - 1;
    return {
      status: 'warning',
      reason:
        `${formatTemperature(last.tempC)} now, but it was above ` +
        `${formatTemperature(thresholdC)} for ${describeDuration(latest.durationMinutes)} on ` +
        `${formatDateTime(latest.startedAt, timeZone)}` +
        (earlier > 0 ? `, and ${earlier} other ${earlier === 1 ? 'time' : 'times'}.` : '.'),
    };
  }

  const recentGap = gaps.find(
    (gap) => new Date(gap.endedAt).getTime() >= asOfMs - settings.recentGapHours * 3_600_000,
  );
  if (recentGap) {
    return {
      status: 'warning',
      reason:
        `Currently ${formatTemperature(last.tempC)}, but there is a ` +
        `${describeDuration(recentGap.durationMinutes)} hole in the readings around ` +
        `${formatDateTime(recentGap.startedAt, timeZone)}.`,
    };
  }

  return {
    status: 'ok',
    reason:
      `${formatTemperature(last.tempC)} at ${formatDateTime(last.at, timeZone)}, ` +
      `and nothing above ${formatTemperature(thresholdC)} for long enough to matter.`,
  };
}

export const STATUS_ORDER: Record<FridgeStatus, number> = {
  alarm: 0,
  no_data: 1,
  warning: 2,
  ok: 3,
};
