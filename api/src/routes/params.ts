import { config } from '../config';
import { parseTimestamp } from '../ingest/timestamp';

const DAY_MS = 86_400_000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** `2026-09-14` and nothing else: a whole calendar day rather than an instant. */
const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Query parameters arrive as untrusted strings. A bad date silently becoming
 * `Invalid Date` would produce an empty report that looks like a clean record,
 * so anything unparseable falls back to the default rather than through.
 *
 * Dates are read in the logger time zone, not UTC. Summer asks for "the 14th",
 * and the 14th in Jerusalem starts three hours before the 14th in UTC - so a
 * UTC reading of the same string quietly moves the boundary and takes the first
 * three hours of a day out of an inspector's report.
 *
 * `endOfDay` exists for the end of a range for the same reason: `to=2026-09-14`
 * means "up to the end of the 14th". Treating it as midnight would exclude the
 * whole day she just asked about.
 */
export function parseDateParam(
  value: unknown,
  fallback: Date,
  options: { endOfDay?: boolean } = {},
): Date {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const text = value.trim();

  const bare = text.match(BARE_DATE);
  if (bare) {
    const [, year, month, day] = bare;
    const startOfDay = startOfLocalDay(Number(year), Number(month), Number(day));
    if (startOfDay === null) return fallback;
    if (!options.endOfDay) return startOfDay;

    // The instant before the next day begins. Derived from the next day rather
    // than by adding 24 hours, so a clock change inside the range cannot make
    // the end of the day land an hour early or late.
    const next = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));
    const startOfNext = startOfLocalDay(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
    );
    return startOfNext === null ? startOfDay : new Date(startOfNext.getTime() - 1);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function startOfLocalDay(year: number, month: number, day: number): Date | null {
  const pad = (value: number) => String(value).padStart(2, '0');
  const result = parseTimestamp(`${year}-${pad(month)}-${pad(day)}`, config.timezone);
  return result.ok ? result.at : null;
}

export function parseIntParam(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function parseNumberParam(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function daysBefore(reference: Date, days: number): Date {
  return new Date(reference.getTime() - days * DAY_MS);
}
