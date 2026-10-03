import { describe, expect, it } from 'vitest';

import { mapHeaders, normalizeHeader, validateHeaders } from '../src/ingest/headers';

/** field -> source header, for readable assertions. */
function fields(headers: string[]): Record<string, string> {
  return Object.fromEntries(
    mapHeaders(headers).mapped.map((entry) => [entry.field, entry.sourceHeader]),
  );
}

describe('normalising a header', () => {
  it.each([
    ['Temp (°C)', 'temp c'],
    ['Logger #', 'logger'],
    ['Date/Time', 'date time'],
    ['  BRANCH  ', 'branch'],
    ['Logger_No', 'logger no'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeHeader(input)).toBe(expected);
  });
});

describe('"the columns move around"', () => {
  it("reads Summer's own column order", () => {
    expect(fields(['Logger', 'Branch', 'Fridge', 'Time', 'Temp'])).toEqual({
      logger: 'Logger',
      branch: 'Branch',
      fridge: 'Fridge',
      time: 'Time',
      temperature: 'Temp',
    });
  });

  it('reads the same data with the columns in a completely different order', () => {
    expect(fields(['Recorded At', 'Temperature', 'Fridge', 'Site', 'Device ID'])).toEqual({
      timestamp: 'Recorded At',
      temperature: 'Temperature',
      fridge: 'Fridge',
      branch: 'Site',
      logger: 'Device ID',
    });
  });

  it('reads the old Haifa logger, which splits date and time and writes Fahrenheit', () => {
    const mapping = mapHeaders(['Branch', 'Fridge', 'Logger No', 'Date', 'Time', 'Temp (F)']);
    expect(mapping.unitHint).toBe('F');
    expect(validateHeaders(mapping).splitDateTime).toBe(true);
  });

  it('does not mistake a lone Time column for a split file', () => {
    // Summer's sheet has one column called "Time" holding a full timestamp.
    const mapping = mapHeaders(['Logger', 'Branch', 'Fridge', 'Time', 'Temp']);
    expect(validateHeaders(mapping).splitDateTime).toBe(false);
    expect(validateHeaders(mapping).ok).toBe(true);
  });

  it('picks up a unit column when one exists', () => {
    const mapping = mapHeaders(['Logger', 'Branch', 'Fridge', 'Time', 'Reading', 'Unit']);
    expect(mapping.columns.unit).toBe(5);
    expect(mapping.columns.temperature).toBe(4);
  });
});

describe('columns we do not understand', () => {
  it('reports them instead of dropping them quietly', () => {
    const mapping = mapHeaders([
      'Logger',
      'Branch',
      'Fridge',
      'Time',
      'Temp',
      'Battery %',
      'Firmware',
    ]);
    expect(mapping.unmapped).toEqual(['Battery %', 'Firmware']);
    expect(validateHeaders(mapping).ok).toBe(true);
  });

  it('keeps the first of two columns claiming the same thing, and reports the second', () => {
    const mapping = mapHeaders(['Logger', 'Branch', 'Fridge', 'Time', 'Temp', 'Temperature']);
    expect(mapping.columns.temperature).toBe(4);
    expect(mapping.unmapped).toEqual(['Temperature']);
  });
});

describe('files that cannot be used', () => {
  it('names exactly what is missing', () => {
    // A raw logger export: "the logger files themselves only have the time and
    // the temperature". Readable, but nothing says which fridge it is.
    const validation = validateHeaders(mapHeaders(['Time', 'Temp']));
    expect(validation.ok).toBe(false);
    expect(validation.missing).toEqual(['logger', 'branch', 'fridge']);
  });

  it('notices when there is no time column at all', () => {
    const validation = validateHeaders(mapHeaders(['Logger', 'Branch', 'Fridge', 'Temp']));
    expect(validation.missing).toContain('time');
  });
});

describe('asks who a file belongs to instead of turning it away', () => {
  it('offers to label a raw logger file rather than refusing it', () => {
    // Summer already does this by hand: "I type in the logger number, the
    // branch and the fridge myself when I paste". Refusing the file sends her
    // back to Excel, which is the work this is meant to remove.
    const validation = validateHeaders(mapHeaders(['Time', 'Temp']));
    expect(validation.needsLabels).toBe(true);
  });

  it('accepts the same file once she says which fridge it is', () => {
    const validation = validateHeaders(mapHeaders(['Time', 'Temp']), {
      loggerCode: 'TL-0512',
      branchName: 'Jerusalem',
      fridgeName: 'Dairy',
    });
    expect(validation.ok).toBe(true);
    expect(validation.missing).toEqual([]);
  });

  it('takes a partly labelled file: the file supplies what it can', () => {
    const validation = validateHeaders(mapHeaders(['Logger', 'Time', 'Temp']), {
      branchName: 'Jerusalem',
      fridgeName: 'Dairy',
    });
    expect(validation.ok).toBe(true);
  });

  it('does not offer labelling when the temperature is what is missing', () => {
    // Nothing she can type fixes a file with no readings in it, so promising a
    // labelling form would be a dead end.
    const validation = validateHeaders(mapHeaders(['Time', 'Notes']));
    expect(validation.needsLabels).toBe(false);
    expect(validation.missing).toContain('temperature');
  });

  it('ignores blank labels, which are not answers', () => {
    const validation = validateHeaders(mapHeaders(['Time', 'Temp']), {
      loggerCode: '  ',
      branchName: '',
      fridgeName: null,
    });
    expect(validation.ok).toBe(false);
    expect(validation.needsLabels).toBe(true);
  });
});
