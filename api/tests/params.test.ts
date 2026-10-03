import { describe, expect, it } from 'vitest';

import { parseDateParam } from '../src/routes/params';

const FALLBACK = new Date('2026-09-20T00:00:00.000Z');

describe('a date on an inspector report means a day in Israel, not a day in UTC', () => {
  it('starts the day when the day starts here', () => {
    // Midnight on 14 September in Jerusalem is 21:00 UTC on the 13th. Reading
    // the string as UTC would silently drop the first three hours of the day
    // the inspector asked about.
    const from = parseDateParam('2026-09-14', FALLBACK);
    expect(from.toISOString()).toBe('2026-09-13T21:00:00.000Z');
  });

  it('includes the whole of the end day', () => {
    // "to 14 September" has to mean the end of the 14th. Midnight would hand an
    // inspector a report that stops just as the day begins.
    const to = parseDateParam('2026-09-14', FALLBACK, { endOfDay: true });
    expect(to.toISOString()).toBe('2026-09-14T20:59:59.999Z');
  });

  it('covers one single day as a usable range', () => {
    const from = parseDateParam('2026-09-14', FALLBACK);
    const to = parseDateParam('2026-09-14', FALLBACK, { endOfDay: true });
    expect(to.getTime() - from.getTime()).toBe(86_400_000 - 1);
  });

  it('crosses a month end without wrapping to the start of the month', () => {
    const to = parseDateParam('2026-09-30', FALLBACK, { endOfDay: true });
    expect(to.toISOString()).toBe('2026-09-30T20:59:59.999Z');
  });

  it('falls back rather than producing an empty report that looks clean', () => {
    // An unparseable date must never become Invalid Date: every comparison
    // against it is false, so the report comes back empty and reads as a
    // perfect compliance record.
    expect(parseDateParam('last March', FALLBACK)).toEqual(FALLBACK);
    expect(parseDateParam('2026-13-45', FALLBACK)).toEqual(FALLBACK);
    expect(parseDateParam('', FALLBACK)).toEqual(FALLBACK);
    expect(parseDateParam(undefined, FALLBACK)).toEqual(FALLBACK);
  });

  it('still accepts a full timestamp with its own offset', () => {
    expect(parseDateParam('2026-09-14T06:00:00Z', FALLBACK).toISOString()).toBe(
      '2026-09-14T06:00:00.000Z',
    );
  });
});
