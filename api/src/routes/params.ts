const DAY_MS = 86_400_000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Query parameters arrive as untrusted strings. A bad date silently becoming
 * `Invalid Date` would produce an empty report that looks like a clean record,
 * so anything unparseable falls back to the default rather than through.
 */
export function parseDateParam(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function parseIntParam(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function daysBefore(reference: Date, days: number): Date {
  return new Date(reference.getTime() - days * DAY_MS);
}
