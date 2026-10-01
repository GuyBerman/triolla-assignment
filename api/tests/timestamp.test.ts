import { describe, expect, it } from 'vitest';

import { parseSplitDateTime, parseTimeOfDay, parseTimestamp } from '../src/ingest/timestamp';

const TZ = 'Asia/Jerusalem';

/** Shorthand for "this parsed, and the instant is X". */
function instant(raw: string): string {
  const result = parseTimestamp(raw, TZ);
  if (!result.ok) throw new Error(`expected "${raw}" to parse, got: ${result.reason}`);
  return result.at.toISOString();
}

describe('ISO timestamps', () => {
  it('reads the format most branches use', () => {
    // Israel is UTC+3 in September, so 06:00 local is 03:00 UTC.
    expect(instant('2026-09-14 06:00')).toBe('2026-09-14T03:00:00.000Z');
  });

  it('accepts a T separator and seconds', () => {
    expect(instant('2026-09-14T06:00:30')).toBe('2026-09-14T03:00:30.000Z');
  });

  it('applies the right offset in winter, not a hardcoded one', () => {
    // Israel is UTC+2 in January. A fixed +3 would put this an hour out, which
    // is the kind of error that only shows up months after it is introduced.
    expect(instant('2026-01-15 06:00')).toBe('2026-01-15T04:00:00.000Z');
  });

  it('trusts an offset the logger supplied rather than assuming a zone', () => {
    expect(instant('2026-09-14T06:00:00Z')).toBe('2026-09-14T06:00:00.000Z');
    expect(instant('2026-09-14T06:00:00+02:00')).toBe('2026-09-14T04:00:00.000Z');
  });

  it('treats a bare date as midnight local', () => {
    expect(instant('2026-09-14')).toBe('2026-09-13T21:00:00.000Z');
  });
});

describe('the old Haifa logger, which writes dates day-first', () => {
  it('reads 14/09/2026 as 14 September', () => {
    expect(instant('14/09/2026 06:00')).toBe('2026-09-14T03:00:00.000Z');
  });

  it('accepts dots and dashes as separators too', () => {
    expect(instant('14.09.2026 06:15')).toBe('2026-09-14T03:15:00.000Z');
    expect(instant('14-09-2026 06:15')).toBe('2026-09-14T03:15:00.000Z');
  });

  it('expands a two-digit year', () => {
    expect(instant('14/09/26 06:00')).toBe('2026-09-14T03:00:00.000Z');
  });

  it('does not flag a date that can only be day-first', () => {
    const result = parseTimestamp('14/09/2026 06:00', TZ);
    expect(result.ok && result.dayFirstAssumed).toBe(false);
  });
});

describe('ambiguous dates', () => {
  it('assumes day-first and says so, rather than guessing silently', () => {
    const result = parseTimestamp('03/04/2026 06:00', TZ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 3 April, not 4 March.
    expect(result.at.toISOString()).toBe('2026-04-03T03:00:00.000Z');
    expect(result.dayFirstAssumed).toBe(true);
  });

  it('reads a date month-first when day-first is impossible', () => {
    // 09/14 cannot be a 14th month, so this one is not ambiguous at all.
    expect(instant('09/14/2026 06:00')).toBe('2026-09-14T03:00:00.000Z');
  });
});

describe('rejecting rather than coercing', () => {
  it.each([
    ['31/02/2026 06:00', 'a day that does not exist'],
    ['2026-13-01 06:00', 'a thirteenth month'],
    ['2026-09-14 25:00', 'an impossible hour'],
    ['not a date', 'free text'],
    ['', 'an empty cell'],
  ])('refuses %s (%s)', (raw) => {
    expect(parseTimestamp(raw, TZ).ok).toBe(false);
  });
});

describe('clock times', () => {
  it('reads 24-hour and 12-hour clocks', () => {
    expect(parseTimeOfDay('06:15')).toEqual({ hour: 6, minute: 15, second: 0 });
    expect(parseTimeOfDay('6:15')).toEqual({ hour: 6, minute: 15, second: 0 });
    expect(parseTimeOfDay('6:15 PM')).toEqual({ hour: 18, minute: 15, second: 0 });
    expect(parseTimeOfDay('12:30 AM')).toEqual({ hour: 0, minute: 30, second: 0 });
    expect(parseTimeOfDay('12:30 PM')).toEqual({ hour: 12, minute: 30, second: 0 });
  });

  it('rejects nonsense', () => {
    expect(parseTimeOfDay('99:99')).toBeNull();
    expect(parseTimeOfDay('13:00 PM')).toBeNull();
  });
});

describe('files that split the date and the time into two columns', () => {
  it('joins them back together in the right zone', () => {
    const result = parseSplitDateTime('14/09/2026', '06:30', TZ);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.at.toISOString()).toBe('2026-09-14T03:30:00.000Z');
    }
  });

  it('reports a bad time without blaming the date', () => {
    const result = parseSplitDateTime('14/09/2026', 'ERR', TZ);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('time');
  });
});
