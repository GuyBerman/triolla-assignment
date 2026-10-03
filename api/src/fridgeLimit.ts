/**
 * The degree limit belongs to one fridge. "Minutes above the limit" is a
 * different setting: how long a reading has to stay warmer than this number.
 *
 * Rounded to one decimal because that is the precision the sentences show.
 * A limit of 5.0 means a reading of 5.0 does not count; it has to be warmer.
 */
const MIN_C = -30;
const MAX_C = 80;

export function parseThresholdC(value: unknown): { thresholdC: number } | { error: string } {
  const parsed = readNumber(value);
  if (parsed === null) return { error: 'Type the limit in degrees.' };

  const thresholdC = Math.round(parsed * 10) / 10;
  if (thresholdC < MIN_C || thresholdC > MAX_C) {
    return { error: `A fridge limit needs to be between ${MIN_C} and ${MAX_C}.` };
  }
  return { thresholdC };
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
