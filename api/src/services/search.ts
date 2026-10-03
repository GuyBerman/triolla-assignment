import { STATUS_ORDER } from '../analysis';
import { config } from '../config';
import {
  buildAssignmentContext,
  getAsOf,
  listAssignments,
  listFridges,
  readingsByFridge,
} from '../repository';
import { getAnalysisSettings } from '../settingsStore';
import type { FridgeListResponse, FridgeSummary } from '../types';
import { summarise } from './fridges';

const DAY_MS = 86_400_000;

function daysBefore(reference: Date, days: number): Date {
  return new Date(reference.getTime() - days * DAY_MS);
}

const EMPTY_LIST: FridgeListResponse = { asOf: null, from: null, to: null, fridges: [] };

/**
 * Name lookup and/or "which fridges reached X degrees".
 *
 * Status is recomputed against `aboveC` when it is set, but the stored limit
 * on the fridge is not rewritten. Opening the fridge still uses 5°C.
 */
export async function searchFridges(input: {
  query: string;
  aboveC: number | null;
  days: number;
}): Promise<FridgeListResponse> {
  const asOf = await getAsOf();
  if (asOf === null) return EMPTY_LIST;

  const from = daysBefore(asOf, input.days);
  const [fridges, assignments, readings, settings] = await Promise.all([
    listFridges(),
    listAssignments(),
    readingsByFridge(from, asOf),
    getAnalysisSettings(),
  ]);
  const context = buildAssignmentContext(assignments, config.timezone);
  const needle = input.query.toLowerCase();

  const matches: FridgeSummary[] = [];

  for (const fridge of fridges) {
    if (needle) {
      const label = `${fridge.branchName} ${fridge.name}`.toLowerCase();
      if (!label.includes(needle)) continue;
    }

    const fridgeReadings = readings.get(fridge.id) ?? [];
    const thresholdC = input.aboveC ?? fridge.thresholdC;
    const { summary } = summarise(
      { ...fridge, thresholdC },
      fridgeReadings,
      asOf.getTime(),
      context.loggerCodeByFridge.get(fridge.id) ?? null,
      context.noDataHintByFridge.get(fridge.id) ?? null,
      settings,
    );

    if (input.aboveC !== null && (summary.peakC === null || summary.peakC < input.aboveC)) {
      continue;
    }

    matches.push(summary);
  }

  matches.sort((a, b) => {
    if (input.aboveC !== null) {
      const byPeak = (b.peakC ?? -Infinity) - (a.peakC ?? -Infinity);
      if (byPeak !== 0) return byPeak;
    }
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return `${a.branchName} ${a.name}`.localeCompare(`${b.branchName} ${b.name}`);
  });

  return {
    asOf: asOf.toISOString(),
    from: from.toISOString(),
    to: asOf.toISOString(),
    fridges: matches,
  };
}
