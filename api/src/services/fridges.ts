import { analyseReadings, STATUS_ORDER } from '../analysis';
import { config } from '../config';
import {
  buildAssignmentContext,
  getAsOf,
  getFridge,
  listAssignments,
  listFridges,
  readingsByFridge,
  readingsForFridge,
} from '../repository';
import type { FridgeDetail, FridgeListResponse, FridgeSummary, Reading } from '../types';

const DAY_MS = 86_400_000;

function daysBefore(reference: Date, days: number): Date {
  return new Date(reference.getTime() - days * DAY_MS);
}

/**
 * Load readings, run analysis, shape the dashboard/detail payload.
 *
 * Routes stay HTTP (parse query, status codes). ingest/ and analysis/ stay
 * the domain. This layer is the bit that would otherwise live in the handler
 * and get copied between /fridges and /search.
 */
export function summarise(
  fridge: { id: number; name: string; branchName: string; thresholdC: number },
  readings: Reading[],
  asOfMs: number,
  loggerCode: string | null,
  noDataHint: string | null,
): { summary: FridgeSummary; analysis: ReturnType<typeof analyseReadings> } {
  const analysis = analyseReadings({
    readings,
    thresholdC: fridge.thresholdC,
    asOfMs,
    timeZone: config.timezone,
    noDataHint,
  });

  return {
    analysis,
    summary: {
      id: fridge.id,
      name: fridge.name,
      branchName: fridge.branchName,
      loggerCode,
      thresholdC: fridge.thresholdC,
      status: analysis.status,
      statusReason: analysis.statusReason,
      // The most recent row of any kind, so an ERR is visible rather than
      // hidden behind the last reading that happened to work.
      lastReading: readings[readings.length - 1] ?? null,
      peakC: peakTemperature(readings),
      openExcursion: analysis.excursions.find((excursion) => excursion.ongoing) ?? null,
      excursionCount: analysis.excursions.length,
      doorEventCount: analysis.doorEvents.length,
      drift: analysis.drift,
    },
  };
}

function peakTemperature(readings: Reading[]): number | null {
  let peak: number | null = null;
  for (const reading of readings) {
    if (reading.tempC === null) continue;
    if (peak === null || reading.tempC > peak) peak = reading.tempC;
  }
  return peak;
}

const EMPTY_LIST: FridgeListResponse = { asOf: null, from: null, to: null, fridges: [] };

export async function listFridgeSummaries(days: number): Promise<FridgeListResponse> {
  const asOf = await getAsOf();
  if (asOf === null) return EMPTY_LIST;

  const from = daysBefore(asOf, days);
  const [fridges, assignments, readings] = await Promise.all([
    listFridges(),
    listAssignments(),
    readingsByFridge(from, asOf),
  ]);
  const context = buildAssignmentContext(assignments, config.timezone);

  const summaries = fridges.map(
    (fridge) =>
      summarise(
        fridge,
        readings.get(fridge.id) ?? [],
        asOf.getTime(),
        context.loggerCodeByFridge.get(fridge.id) ?? null,
        context.noDataHintByFridge.get(fridge.id) ?? null,
      ).summary,
  );

  summaries.sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return `${a.branchName} ${a.name}`.localeCompare(`${b.branchName} ${b.name}`);
  });

  return {
    asOf: asOf.toISOString(),
    from: from.toISOString(),
    to: asOf.toISOString(),
    fridges: summaries,
  };
}

export async function getFridgeDetail(
  id: number,
  from: Date,
  to: Date,
): Promise<FridgeDetail | null> {
  const fridge = await getFridge(id);
  if (fridge === null) return null;

  const asOf = (await getAsOf()) ?? new Date();
  const [assignments, readings] = await Promise.all([
    listAssignments(),
    readingsForFridge(id, from, to),
  ]);
  const context = buildAssignmentContext(assignments, config.timezone);

  const { summary, analysis } = summarise(
    fridge,
    readings,
    Math.min(asOf.getTime(), to.getTime()),
    context.loggerCodeByFridge.get(id) ?? null,
    context.noDataHintByFridge.get(id) ?? null,
  );

  return {
    fridge: summary,
    from: from.toISOString(),
    to: to.toISOString(),
    readings,
    excursions: analysis.excursions,
    doorEvents: analysis.doorEvents,
    gaps: analysis.gaps,
    drift: analysis.drift,
  };
}
