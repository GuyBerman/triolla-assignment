import { describe, expect, it } from 'vitest';

import { parseThresholdC } from '../src/fridgeLimit';

describe('a fridge limit is the number of degrees, not the number of minutes', () => {
  it('keeps one decimal, which is what the sentences show', () => {
    expect(parseThresholdC(6)).toEqual({ thresholdC: 6 });
    expect(parseThresholdC('5.04')).toEqual({ thresholdC: 5 });
    expect(parseThresholdC('6.16')).toEqual({ thresholdC: 6.2 });
  });

  it('refuses a blank box rather than storing the limit as zero', () => {
    expect(parseThresholdC('')).toEqual({ error: 'Type the limit in degrees.' });
  });

  it('refuses a temperature outside the range search already allows', () => {
    expect(parseThresholdC(81)).toEqual({
      error: 'A fridge limit needs to be between -30 and 80.',
    });
  });
});