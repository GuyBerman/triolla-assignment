import type { TemperatureUnit } from '../types';
import { INGEST_RULES } from './rules';

type TemperatureResult =
  | {
      ok: true;
      value: number;
      /** A unit written into the cell itself, e.g. "38.3 F". */
      unitFromCell: TemperatureUnit | null;
    }
  | { ok: false; reason: string };

/**
 * Values a logger writes when it could not take a reading. The Haifa file has
 * "ERR" in it. These are real information - the fridge was unmonitored at that
 * moment - so they are stored with status 'error' rather than dropped, and
 * they never become 0, which would read as a perfectly cold fridge.
 */
const NON_READINGS = new Set([
  'err',
  'error',
  'errs',
  'e',
  'na',
  'n a',
  'nan',
  'null',
  'nil',
  'none',
  'no data',
  'nodata',
  'fail',
  'failed',
  'open',
  'short',
  'ovf',
  'overflow',
  '-',
  '--',
  '---',
  '#n a',
  '#value',
  '#div 0',
]);

export function fahrenheitToCelsius(fahrenheit: number): number {
  // Rounded to two places: (38.3 - 32) * 5/9 is 3.5000000000000004 in binary
  // floating point, and an inspector-facing number should not look like that.
  return Math.round(((fahrenheit - 32) * 5) / 9 * 100) / 100;
}

export function parseTemperature(raw: string): TemperatureResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, reason: 'no temperature recorded' };
  }

  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9.,+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (NON_READINGS.has(normalized)) {
    return { ok: false, reason: `logger reported "${trimmed}" instead of a temperature` };
  }

  // Pull a unit off the end if the cell carries one: "38.3F", "3.8 °C".
  let unitFromCell: TemperatureUnit | null = null;
  let numberText = normalized;
  const unitMatch = numberText.match(/\s*([cf])$/);
  if (unitMatch) {
    unitFromCell = unitMatch[1] === 'f' ? 'F' : 'C';
    numberText = numberText.slice(0, unitMatch.index).trim();
  }

  // Some European exports use a decimal comma.
  if (/^-?\d+,\d+$/.test(numberText)) {
    numberText = numberText.replace(',', '.');
  }
  numberText = numberText.replace(/\s/g, '');

  if (!/^[+-]?\d+(\.\d+)?$/.test(numberText)) {
    return { ok: false, reason: `could not read "${trimmed}" as a temperature` };
  }

  const value = Number(numberText);
  if (!Number.isFinite(value)) {
    return { ok: false, reason: `could not read "${trimmed}" as a temperature` };
  }

  // A logger that writes 1348 or -999 is reporting a fault in its own way.
  if (value < INGEST_RULES.plausibleMinAnyUnit || value > INGEST_RULES.plausibleMaxAnyUnit) {
    return {
      ok: false,
      reason: `${trimmed} is outside any plausible temperature range`,
    };
  }

  return { ok: true, value, unitFromCell };
}

function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

type UnitSuspicion =
  | { level: 'none' }
  | { level: 'warn'; medianC: number; message: string }
  | { level: 'reject'; medianC: number; message: string };

/**
 * Guards the Haifa failure mode in the other direction.
 *
 * Converting Fahrenheit is only safe if we know which loggers report it. If a
 * logger is registered as Celsius but its readings sit around 38, either the
 * registration is wrong or the device was swapped - and storing that as 38°C
 * would quietly poison every report that fridge appears in.
 *
 * Two tiers on purpose. A dead fridge really can sit at 22°C, so that only
 * warns. Nothing that is plugged in sits at a median above 30, so that is
 * refused with an instruction instead of imported.
 */
export function assessDeclaredUnit(
  loggerCode: string,
  declaredUnit: TemperatureUnit,
  celsiusValues: number[],
): UnitSuspicion {
  if (declaredUnit === 'F' || celsiusValues.length < INGEST_RULES.unitCheckMinReadings) {
    return { level: 'none' };
  }

  const medianC = median(celsiusValues);
  if (!Number.isFinite(medianC)) return { level: 'none' };

  if (medianC > INGEST_RULES.unitRejectMedianC) {
    const asCelsius = fahrenheitToCelsius(medianC);
    return {
      level: 'reject',
      medianC,
      message:
        `${loggerCode} is registered as Celsius but its readings average ` +
        `${medianC.toFixed(1)}°. If this logger reports Fahrenheit, that would be ` +
        `${asCelsius.toFixed(1)}°C. Nothing was imported for this logger - change the ` +
        `logger's unit to Fahrenheit and upload the file again.`,
    };
  }

  if (medianC > INGEST_RULES.unitWarnMedianC) {
    return {
      level: 'warn',
      medianC,
      message:
        `${loggerCode} averaged ${medianC.toFixed(1)}°C across this file, which is very ` +
        `warm for a fridge. Imported as-is, but worth checking whether the fridge is ` +
        `broken or the logger is reporting Fahrenheit.`,
    };
  }

  return { level: 'none' };
}
