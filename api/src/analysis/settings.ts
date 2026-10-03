import type { AnalysisSettings } from '../types';
import { ANALYSIS } from './config';

/** What applies until she saves something else. Same numbers as `ANALYSIS`. */
export function defaultAnalysisSettings(): AnalysisSettings {
  return {
    excursionMinDurationMinutes: ANALYSIS.excursionMinDurationMinutes,
    staleAfterHours: ANALYSIS.staleAfterHours,
    recentGapHours: ANALYSIS.recentGapHours,
    driftWindowHours: ANALYSIS.driftWindowHours,
    driftMinWindowHours: ANALYSIS.driftMinWindowHours,
    driftMinRiseC: ANALYSIS.driftMinRiseC,
    driftMinSlopeCPerHour: ANALYSIS.driftMinSlopeCPerHour,
    gapMinMinutes: ANALYSIS.gapMinMinutes,
  };
}

interface FieldSpec {
  key: keyof AnalysisSettings;
  label: string;
  kind: 'int' | 'decimal';
  min: number;
  max: number;
  /** Decimal places kept on save, so 0.4 does not become 0.4000000001. */
  places?: number;
}

/**
 * Bounds are wide enough that she can disagree with the guesses, and tight
 * enough that a typo cannot turn every door opening into Too warm or call a
 * tenth of a degree a trend. The floor of 1 minute is the product rule: one
 * reading has a duration of zero, so it stays a door opening.
 */
const FIELDS: FieldSpec[] = [
  {
    key: 'excursionMinDurationMinutes',
    label: 'Minutes above the limit',
    kind: 'int',
    min: 1,
    max: 24 * 60,
  },
  { key: 'staleAfterHours', label: 'Hours without a reading', kind: 'int', min: 1, max: 7 * 24 },
  { key: 'recentGapHours', label: 'A gap counts for this many hours', kind: 'int', min: 1, max: 30 * 24 },
  { key: 'driftWindowHours', label: 'Hours to look back for warming', kind: 'int', min: 1, max: 7 * 24 },
  {
    key: 'driftMinWindowHours',
    label: 'Hours of readings needed',
    kind: 'int',
    min: 1,
    max: 7 * 24,
  },
  {
    key: 'driftMinRiseC',
    label: 'Rise that counts as warming',
    kind: 'decimal',
    min: 0.1,
    max: 20,
    places: 2,
  },
  {
    key: 'driftMinSlopeCPerHour',
    label: 'Climb per hour',
    kind: 'decimal',
    min: 0.01,
    max: 5,
    places: 3,
  },
  { key: 'gapMinMinutes', label: 'Shortest hole that counts', kind: 'int', min: 15, max: 24 * 60 },
];

export function parseAnalysisSettings(
  body: unknown,
): { settings: AnalysisSettings } | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Send the settings as numbers.' };
  }

  const raw = body as Record<string, unknown>;
  const settings = {} as AnalysisSettings;

  for (const field of FIELDS) {
    const parsed = readNumber(raw[field.key]);
    if (parsed === null) {
      return { error: `Fill in ${field.label.toLowerCase()}.` };
    }

    const value = field.kind === 'decimal' ? roundTo(parsed, field.places ?? 2) : parsed;
    if (field.kind === 'int' && !Number.isInteger(value)) {
      return { error: `${field.label} needs a whole number.` };
    }
    if (value < field.min || value > field.max) {
      return {
        error: `${field.label} needs to be between ${field.min} and ${field.max}.`,
      };
    }
    settings[field.key] = value;
  }

  if (settings.driftMinWindowHours > settings.driftWindowHours) {
    return {
      error:
        'Warming up cannot need more hours of readings than the period it looks at.',
    };
  }

  return { settings };
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
