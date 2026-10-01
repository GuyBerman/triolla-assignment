import { describe, expect, it } from 'vitest';

import {
  ANALYSIS,
  analyseReadings,
  findExcursions,
  findGaps,
  gapThresholdMs,
  inferCadenceMinutes,
  robustTrend,
} from '../src/analysis';
import type { Reading, Sample } from '../src/types';

const TZ = 'Asia/Jerusalem';
const MINUTE = 60_000;

/** Builds a reading series. `null` is a reading the logger failed to take. */
function series(startIso: string, stepMinutes: number, temps: (number | null)[]): Reading[] {
  const start = new Date(startIso).getTime();
  return temps.map((tempC, index) => ({
    recordedAt: new Date(start + index * stepMinutes * MINUTE).toISOString(),
    tempC,
    rawValue: tempC === null ? 'ERR' : String(tempC),
    status: tempC === null ? 'error' : 'ok',
  }));
}

function samples(startIso: string, stepMinutes: number, temps: number[]): Sample[] {
  const start = new Date(startIso).getTime();
  return temps.map((tempC, index) => ({ at: start + index * stepMinutes * MINUTE, tempC }));
}

const lastAt = (readings: Reading[]) =>
  new Date(readings[readings.length - 1]!.recordedAt).getTime();

/** The default gap allowance for a fifteen-minute logger: one hour. */
const FIFTEEN_MIN_GAP = gapThresholdMs(15);

// ---------------------------------------------------------------------------

describe('"a jump for one reading, and that is fine"', () => {
  // Tel Aviv's walk-in, exactly as in the brief: 4.0, 4.1, 9.4, 4.3.
  const telAviv = series('2026-09-14T05:45:00Z', 15, [4.0, 4.1, 9.4, 4.3]);

  it('does not treat a door opening as a violation', () => {
    const result = analyseReadings({
      readings: telAviv,
      thresholdC: 5,
      asOfMs: lastAt(telAviv),
      timeZone: TZ,
    });

    expect(result.excursions).toEqual([]);
    expect(result.status).toBe('ok');
  });

  it('still records it, as a door opening', () => {
    // It must not be swallowed either - Summer should be able to see that the
    // door was opened, just not be alarmed by it.
    const result = analyseReadings({
      readings: telAviv,
      thresholdC: 5,
      asOfMs: lastAt(telAviv),
      timeZone: TZ,
    });

    expect(result.doorEvents).toHaveLength(1);
    expect(result.doorEvents[0]!.peakC).toBe(9.4);
  });

  it('ignores two consecutive warm readings but not three', () => {
    // At a fifteen-minute cadence the thirty-minute rule means three readings
    // in a row above the limit. This pins that boundary down.
    const two = findExcursions(samples('2026-09-14T06:00:00Z', 15, [4.1, 6.0, 6.1, 4.2]), {
      thresholdC: 5,
      maxGapMs: FIFTEEN_MIN_GAP,
    });
    expect(two.excursions).toEqual([]);
    expect(two.doorEvents).toHaveLength(1);

    const three = findExcursions(samples('2026-09-14T06:00:00Z', 15, [4.1, 6.0, 6.1, 6.2, 4.2]), {
      thresholdC: 5,
      maxGapMs: FIFTEEN_MIN_GAP,
    });
    expect(three.excursions).toHaveLength(1);
    expect(three.excursions[0]!.durationMinutes).toBe(30);
  });
});

describe('"a fridge that is slowly warming up is not fine"', () => {
  // Rishon's cream cakes, starting with the four readings from the brief.
  const rishon = series('2026-09-14T06:00:00Z', 15, [4.6, 5.4, 6.3, 7.1, 7.9, 7.6, 4.2]);

  it('reports the warm period as a real violation', () => {
    const result = analyseReadings({
      readings: rishon,
      thresholdC: 5,
      asOfMs: lastAt(rishon),
      timeZone: TZ,
    });

    expect(result.excursions).toHaveLength(1);
    const excursion = result.excursions[0]!;
    expect(excursion.startedAt).toBe('2026-09-14T06:15:00.000Z');
    expect(excursion.endedAt).toBe('2026-09-14T07:15:00.000Z');
    expect(excursion.durationMinutes).toBe(60);
    expect(excursion.peakC).toBe(7.9);
    expect(excursion.readingCount).toBe(5);
    expect(excursion.ongoing).toBe(false);
  });

  it('raises an alarm while it is still happening', () => {
    const stillWarm = series('2026-09-14T06:00:00Z', 15, [4.6, 5.4, 6.3, 7.1, 7.9]);
    const result = analyseReadings({
      readings: stillWarm,
      thresholdC: 5,
      asOfMs: lastAt(stillWarm),
      timeZone: TZ,
    });

    expect(result.status).toBe('alarm');
    expect(result.excursions[0]!.ongoing).toBe(true);
    expect(result.excursions[0]!.endedAt).toBeNull();
    expect(result.statusReason).toContain('Above 5.0°C');
  });

  it('warns about a fridge creeping up while still inside the limit', () => {
    // The Rishon case caught two days earlier: 2.4 to 4.6 over twelve hours,
    // never above five, so a threshold alarm would say nothing at all.
    const creeping = series(
      '2026-09-14T06:00:00Z',
      60,
      Array.from({ length: 13 }, (_, index) => Number((2.4 + index * 0.18).toFixed(2))),
    );
    const result = analyseReadings({
      readings: creeping,
      thresholdC: 5,
      asOfMs: lastAt(creeping),
      timeZone: TZ,
    });

    expect(result.excursions).toEqual([]);
    expect(result.drift).not.toBeNull();
    expect(result.status).toBe('warning');
    expect(result.statusReason).toContain('heading the wrong way');
  });

  it('says nothing about a fridge that is merely noisy', () => {
    const steady = series('2026-09-14T06:00:00Z', 60, [3.8, 4.0, 3.7, 3.9, 4.1, 3.8, 3.9, 4.0, 3.8, 3.9, 4.0, 3.7, 3.9]);
    const result = analyseReadings({
      readings: steady,
      thresholdC: 5,
      asOfMs: lastAt(steady),
      timeZone: TZ,
    });

    expect(result.drift).toBeNull();
    expect(result.status).toBe('ok');
  });

  it('says nothing about a fridge that is cooling down', () => {
    const cooling = series(
      '2026-09-14T06:00:00Z',
      60,
      Array.from({ length: 13 }, (_, index) => Number((6 - index * 0.2).toFixed(2))),
    );
    const result = analyseReadings({
      readings: cooling,
      thresholdC: 5,
      asOfMs: lastAt(cooling),
      timeZone: TZ,
    });

    expect(result.drift).toBeNull();
  });
});

describe('holes in the readings', () => {
  it('finds the two-hour hole from the brief', () => {
    // Jerusalem: 06:00, 06:15, then nothing until 08:30.
    const jerusalem = [
      ...series('2026-09-14T06:00:00Z', 15, [3.8, 3.9]),
      ...series('2026-09-14T08:30:00Z', 15, [4.0, 4.1]),
    ];
    const result = analyseReadings({
      readings: jerusalem,
      thresholdC: 5,
      asOfMs: lastAt(jerusalem),
      timeZone: TZ,
    });

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]!.durationMinutes).toBe(135);
    // A hole is not a clean bill of health.
    expect(result.status).toBe('warning');
    expect(result.statusReason).toContain('hole in the readings');
  });

  it('does not call a single missed reading a hole', () => {
    const withOneErr = series('2026-09-14T06:00:00Z', 15, [3.8, null, 3.9, 4.0]);
    const result = analyseReadings({
      readings: withOneErr,
      thresholdC: 5,
      asOfMs: lastAt(withOneErr),
      timeZone: TZ,
    });

    expect(result.gaps).toEqual([]);
    expect(result.status).toBe('ok');
  });

  it('scales what counts as a hole to how often the logger reports', () => {
    // The same two-hour silence means different things: alarming from a logger
    // that reports every fifteen minutes, unremarkable from an hourly one.
    const twoHourSilence = samples('2026-09-14T06:00:00Z', 120, [3.8, 3.9]);

    expect(findGaps(twoHourSilence, gapThresholdMs(15))).toHaveLength(1);
    expect(findGaps(twoHourSilence, gapThresholdMs(60))).toEqual([]);
  });

  it('will not claim a fridge was warm across a hole it cannot see into', () => {
    // Above the limit on either side of a six-hour blackout. Reporting that as
    // one six-hour violation would be inventing evidence for an inspector.
    const split = [
      ...samples('2026-09-14T06:00:00Z', 15, [6.1, 6.2, 6.3]),
      ...samples('2026-09-14T12:00:00Z', 15, [6.4, 6.5, 6.6]),
    ];
    const result = findExcursions(split, { thresholdC: 5, maxGapMs: FIFTEEN_MIN_GAP });

    expect(result.excursions).toHaveLength(2);
    expect(result.excursions[0]!.durationMinutes).toBe(30);
    expect(result.excursions[1]!.durationMinutes).toBe(30);
  });

  it('does not let a failed reading split a genuine violation in two', () => {
    // An ERR in the middle of a warm period is not the fridge recovering.
    const withErr = series('2026-09-14T06:00:00Z', 15, [6.1, 6.2, null, 6.4, 6.5]);
    const result = analyseReadings({
      readings: withErr,
      thresholdC: 5,
      asOfMs: lastAt(withErr),
      timeZone: TZ,
    });

    expect(result.excursions).toHaveLength(1);
    expect(result.excursions[0]!.durationMinutes).toBe(60);
  });
});

describe('a fridge we have stopped hearing from', () => {
  it('is reported as unknown, never as fine', () => {
    const stopped = series('2026-09-14T06:00:00Z', 15, [3.8, 3.9, 4.0]);
    const result = analyseReadings({
      readings: stopped,
      thresholdC: 5,
      // Half a day later in the dataset, and this fridge has said nothing.
      asOfMs: lastAt(stopped) + 12 * 3_600_000,
      timeZone: TZ,
    });

    expect(result.status).toBe('no_data');
    expect(result.statusReason).toContain('No readings for');
  });

  it('does not guess why it went quiet', () => {
    const stopped = series('2026-09-14T06:00:00Z', 15, [3.8, 3.9, 4.0]);
    const result = analyseReadings({
      readings: stopped,
      thresholdC: 5,
      asOfMs: lastAt(stopped) + 12 * 3_600_000,
      timeZone: TZ,
    });

    // Summer said she can never tell a dead logger from a flat battery from a
    // failed save, so the app does not pretend to either.
    expect(result.statusReason).not.toMatch(/battery|died|broken/i);
  });

  it('passes on a reason when there is a real one', () => {
    const stopped = series('2026-09-14T06:00:00Z', 15, [3.8, 3.9, 4.0]);
    const result = analyseReadings({
      readings: stopped,
      thresholdC: 5,
      asOfMs: lastAt(stopped) + 12 * 3_600_000,
      timeZone: TZ,
      noDataHint: 'Logger TL-0417 was moved to Display 2.',
    });

    expect(result.statusReason).toContain('moved to Display 2');
  });

  it('handles a fridge with no readings at all', () => {
    const result = analyseReadings({
      readings: [],
      thresholdC: 5,
      asOfMs: Date.now(),
      timeZone: TZ,
    });

    expect(result.status).toBe('no_data');
    expect(result.excursions).toEqual([]);
    expect(result.gaps).toEqual([]);
  });

  it('treats a fridge whose every reading failed as having no data', () => {
    const allErr = series('2026-09-14T06:00:00Z', 15, [null, null, null, null]);
    const result = analyseReadings({
      readings: allErr,
      thresholdC: 5,
      asOfMs: lastAt(allErr),
      timeZone: TZ,
    });

    expect(result.status).toBe('no_data');
  });
});

describe('which state wins', () => {
  const base = {
    thresholdC: 5,
    timeZone: TZ,
  };

  it('puts an ongoing alarm ahead of a warming trend', () => {
    const rising = series(
      '2026-09-14T06:00:00Z',
      60,
      Array.from({ length: 13 }, (_, index) => Number((3 + index * 0.3).toFixed(2))),
    );
    const result = analyseReadings({ ...base, readings: rising, asOfMs: lastAt(rising) });

    expect(result.drift).not.toBeNull();
    // Both apply; the worse one is what Summer needs to see.
    expect(result.status).toBe('alarm');
  });

  it('puts missing data ahead of everything else', () => {
    const warmThenSilent = series('2026-09-14T06:00:00Z', 15, [6.1, 6.2, 6.3, 6.4]);
    const result = analyseReadings({
      ...base,
      readings: warmThenSilent,
      asOfMs: lastAt(warmThenSilent) + 24 * 3_600_000,
    });

    expect(result.excursions).toHaveLength(1);
    expect(result.status).toBe('no_data');
  });
});

describe('a fridge that recovered on its own', () => {
  const base = { thresholdC: 5, timeZone: TZ };

  /**
   * The Rishon cream cakes fridge from the brief: four hours at 8 degrees, then
   * back to normal for the rest of the week. An earlier version turned it green
   * after 24 hours and captioned it "nothing above 5.0°C for long enough to
   * matter", which is the kind of thing Summer means when she says she still
   * misses things.
   */
  const spikedThenFine = [
    ...series('2026-09-14T06:00:00Z', 15, [4.6, 5.4, 6.3, 7.1, 7.7, 7.9, 7.5, 8.0, 7.8, 7.6, 8.0, 7.5, 7.6, 4.8, 4.2]),
    ...series('2026-09-17T06:00:00Z', 15, [4.1, 4.2, 4.0, 4.1, 4.3, 4.2, 4.1, 4.0]),
  ];

  it('is still flagged days later, not quietly turned green', () => {
    const result = analyseReadings({
      ...base,
      readings: spikedThenFine,
      asOfMs: lastAt(spikedThenFine),
    });

    expect(result.excursions).toHaveLength(1);
    expect(result.status).toBe('warning');
  });

  it('never says nothing happened when something did', () => {
    const result = analyseReadings({
      ...base,
      readings: spikedThenFine,
      asOfMs: lastAt(spikedThenFine),
    });

    expect(result.statusReason).toContain('it was above');
    expect(result.statusReason).not.toContain('nothing above');
  });

  it('does not call a tenth of a degree of noise a warming trend', () => {
    // Enough readings to qualify, but only a short stretch of them and barely
    // any movement. Reporting this as "warming up" trains Summer to ignore the
    // one warning that would have saved the Rishon stock.
    const jittery = series('2026-09-14T06:00:00Z', 15, [4.1, 4.2, 4.0, 4.1, 4.3, 4.2, 4.1, 4.0]);
    const result = analyseReadings({ ...base, readings: jittery, asOfMs: lastAt(jittery) });

    expect(result.drift).toBeNull();
    expect(result.status).toBe('ok');
  });

  it('still says nothing happened when genuinely nothing did', () => {
    const calm = series('2026-09-14T06:00:00Z', 15, Array.from({ length: 40 }, () => 4));
    const result = analyseReadings({ ...base, readings: calm, asOfMs: lastAt(calm) });

    expect(result.status).toBe('ok');
    expect(result.statusReason).toContain('nothing above');
  });
});

describe('working out how often a logger reports', () => {
  it('reads the interval off the data rather than assuming', () => {
    expect(inferCadenceMinutes(samples('2026-09-14T06:00:00Z', 15, [1, 2, 3, 4]).map((s) => s.at))).toBe(15);
    expect(inferCadenceMinutes(samples('2026-09-14T06:00:00Z', 60, [1, 2, 3, 4]).map((s) => s.at))).toBe(60);
  });

  it('is not thrown off by one large hole', () => {
    // Nine readings at fifteen minutes with a six-hour hole in the middle. The
    // median ignores the outlier; a mean would report about an hour.
    const times = [
      ...samples('2026-09-14T06:00:00Z', 15, [1, 2, 3, 4, 5]).map((s) => s.at),
      ...samples('2026-09-14T12:00:00Z', 15, [1, 2, 3, 4]).map((s) => s.at),
    ];
    expect(inferCadenceMinutes(times)).toBe(15);
  });

  it('falls back when there is almost nothing to go on', () => {
    expect(inferCadenceMinutes([])).toBe(ANALYSIS.fallbackCadenceMinutes);
    expect(inferCadenceMinutes([Date.now()])).toBe(ANALYSIS.fallbackCadenceMinutes);
  });
});

describe('the trend calculation itself', () => {
  it('measures degrees per hour', () => {
    const rising = samples('2026-09-14T06:00:00Z', 60, [3, 4, 5, 6]);
    expect(robustTrend(rising)!.slopeCPerHour).toBeCloseTo(1, 6);
  });

  it('is zero for a flat line and negative for a falling one', () => {
    expect(robustTrend(samples('2026-09-14T06:00:00Z', 60, [4, 4, 4, 4]))!.slopeCPerHour)
      .toBeCloseTo(0, 6);
    expect(robustTrend(samples('2026-09-14T06:00:00Z', 60, [6, 5, 4, 3]))!.slopeCPerHour)
      .toBeCloseTo(-1, 6);
  });

  it('is not fooled by a single door opening', () => {
    // This is a regression test for a real bug. The first version fitted a
    // least-squares line, and one +5 spike near the end of the window tilted
    // it enough to report a perfectly healthy fridge as warming up - while
    // Summer had told us in plain words that door openings are fine.
    const flatWithSpike = samples(
      '2026-09-14T06:00:00Z',
      30,
      [3.8, 3.9, 3.7, 4.0, 3.8, 3.9, 3.8, 4.0, 3.7, 3.9, 9.2, 3.8],
    );

    const trend = robustTrend(flatWithSpike)!;
    expect(Math.abs(trend.slopeCPerHour)).toBeLessThan(ANALYSIS.driftMinSlopeCPerHour);
  });

  it('never reports a direction its own numbers contradict', () => {
    // The same bug showed up as "Warming up: 4.0°C to 3.6°C", which is not a
    // sentence anyone should be shown. Comparing halves makes it impossible.
    const trend = robustTrend(samples('2026-09-14T06:00:00Z', 30, [3.8, 4.2, 3.6, 4.1, 9.4, 3.7, 4.0, 3.8]))!;
    expect(Math.sign(trend.slopeCPerHour)).toBe(
      Math.sign(trend.secondHalfC - trend.firstHalfC),
    );
  });

  it('still sees a real climb that a door opening is sitting on top of', () => {
    const climbingWithSpike = samples(
      '2026-09-14T06:00:00Z',
      30,
      [2.5, 2.7, 2.6, 2.9, 3.1, 9.5, 3.6, 3.8, 4.0, 4.2, 4.4, 4.6],
    );
    expect(robustTrend(climbingWithSpike)!.slopeCPerHour).toBeGreaterThan(
      ANALYSIS.driftMinSlopeCPerHour,
    );
  });

  it('returns nothing when there is too little to measure', () => {
    expect(robustTrend([])).toBeNull();
    expect(robustTrend(samples('2026-09-14T06:00:00Z', 60, [4, 5]))).toBeNull();
    expect(
      robustTrend([
        { at: 0, tempC: 4 },
        { at: 0, tempC: 9 },
        { at: 0, tempC: 5 },
        { at: 0, tempC: 6 },
      ]),
    ).toBeNull();
  });
});

describe('thresholds are per fridge', () => {
  it('uses the fridge´s own limit, not a global five', () => {
    // A freezer at -15 is fine; the same reading in a dairy fridge is not.
    const freezer = series('2026-09-14T06:00:00Z', 15, [-15.2, -15.0, -14.8, -15.1]);
    const result = analyseReadings({
      readings: freezer,
      thresholdC: -12,
      asOfMs: lastAt(freezer),
      timeZone: TZ,
    });

    expect(result.status).toBe('ok');
    expect(result.excursions).toEqual([]);
  });
});
