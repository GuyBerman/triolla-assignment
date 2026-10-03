import { describe, expect, it } from 'vitest';

import { defaultAnalysisSettings, parseAnalysisSettings } from '../src/analysis/settings';

describe('settings she can save', () => {
  it('keeps the defaults when every box is filled with them', () => {
    const parsed = parseAnalysisSettings(defaultAnalysisSettings());
    expect(parsed).toEqual({ settings: defaultAnalysisSettings() });
  });

  it('refuses a duration of zero, which would turn one reading into too warm', () => {
    const parsed = parseAnalysisSettings({
      ...defaultAnalysisSettings(),
      excursionMinDurationMinutes: 0,
    });
    expect(parsed).toEqual({
      error: 'Minutes above the limit needs to be between 1 and 1440.',
    });
  });

  it('refuses a warming check that needs more hours than it looks at', () => {
    const parsed = parseAnalysisSettings({
      ...defaultAnalysisSettings(),
      driftWindowHours: 4,
      driftMinWindowHours: 12,
    });
    expect(parsed).toEqual({
      error: 'Warming up cannot need more hours of readings than the period it looks at.',
    });
  });

  it('refuses a blank box rather than saving a gap as zero', () => {
    const parsed = parseAnalysisSettings({
      ...defaultAnalysisSettings(),
      staleAfterHours: '',
    });
    expect('error' in parsed).toBe(true);
  });
});
