import { describe, expect, it } from 'vitest';

import { applyConversion, pickRule } from '../src/ingest/conversion';
import type { ConversionRule } from '../src/types';

const telAviv = {
  branchCanonical: 'tel aviv',
  fridgeCanonical: 'dairy',
  loggerCode: 'TL-0777',
};

describe('picking which rule applies', () => {
  const branchRule: ConversionRule = {
    id: 1,
    matchBranch: 'Tel Aviv',
    matchLogger: null,
    matchFridge: null,
    unit: 'as_written',
    multiplyBy: 1.5,
    add: 0,
  };
  const fridgeRule: ConversionRule = {
    id: 2,
    matchBranch: 'Tel Aviv',
    matchLogger: null,
    matchFridge: 'Dairy',
    unit: 'as_written',
    multiplyBy: 2,
    add: 0,
  };
  const otherBranch: ConversionRule = {
    id: 3,
    matchBranch: 'Haifa',
    matchLogger: null,
    matchFridge: null,
    unit: 'F',
    multiplyBy: 1,
    add: 0,
  };

  it('matches a branch regardless of how it was capitalised', () => {
    expect(pickRule([branchRule], telAviv)?.id).toBe(1);
  });

  it('does not apply a Haifa rule to Tel Aviv', () => {
    expect(pickRule([otherBranch], telAviv)).toBeNull();
  });

  it('prefers a fridge rule over a branch-wide one', () => {
    expect(pickRule([branchRule, fridgeRule], telAviv)?.id).toBe(2);
  });
});

describe('turning the file number into a stored temperature', () => {
  it('leaves a reading alone when no rule matches', () => {
    expect(applyConversion(38.3, null)).toBe(38.3);
  });

  it('scales the number in the file, without converting it first', () => {
    const rule: ConversionRule = {
      id: 1,
      matchBranch: 'Haifa',
      matchLogger: null,
      matchFridge: null,
      unit: 'as_written',
      multiplyBy: 10,
      add: 0,
    };
    expect(applyConversion(38.3, rule)).toBe(383);
  });

  it('converts Fahrenheit only when the rule says to, then applies the scale', () => {
    // 38.3 F is 3.5 C; then × 1.5 is 5.25.
    const rule: ConversionRule = {
      id: 1,
      matchBranch: 'Haifa',
      matchLogger: null,
      matchFridge: null,
      unit: 'F',
      multiplyBy: 1.5,
      add: 0,
    };
    expect(applyConversion(38.3, rule)).toBe(5.25);
  });

  it('can add a calibration offset after the scale', () => {
    const rule: ConversionRule = {
      id: 1,
      matchBranch: 'Tel Aviv',
      matchLogger: null,
      matchFridge: null,
      unit: 'as_written',
      multiplyBy: 1,
      add: -0.3,
    };
    expect(applyConversion(4.0, rule)).toBe(3.7);
  });
});
