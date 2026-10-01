import { Router } from 'express';

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
import type { FridgeDetail, FridgeSummary, Reading } from '../types';
import { clamp, daysBefore, parseDateParam, parseIntParam } from './params';

export const fridgesRouter = Router();

/** Default windows, in days. */
const LIST_WINDOW_DAYS = 7;
const DETAIL_WINDOW_DAYS = 3;

function summarise(
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
      openExcursion: analysis.excursions.find((excursion) => excursion.ongoing) ?? null,
      excursionCount: analysis.excursions.length,
      doorEventCount: analysis.doorEvents.length,
      drift: analysis.drift,
    },
  };
}

/**
 * The dashboard. Every fridge in the chain with its current state, worst
 * first, because Summer is between branches on a phone and the first question
 * is always "is anything wrong".
 */
fridgesRouter.get('/fridges', async (req, res) => {
  const asOf = await getAsOf();
  const days = clamp(Number(req.query.days ?? LIST_WINDOW_DAYS) || LIST_WINDOW_DAYS, 1, 90);

  if (asOf === null) {
    res.json({ asOf: null, from: null, to: null, fridges: [] });
    return;
  }

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

  res.json({
    asOf: asOf.toISOString(),
    from: from.toISOString(),
    to: asOf.toISOString(),
    fridges: summaries,
  });
});

/** One fridge in detail: the series for the chart, plus everything found in it. */
fridgesRouter.get('/fridges/:id', async (req, res) => {
  const id = parseIntParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Fridge id must be a number.' });
    return;
  }

  const fridge = await getFridge(id);
  if (fridge === null) {
    res.status(404).json({ error: `No fridge with id ${id}.` });
    return;
  }

  const asOf = (await getAsOf()) ?? new Date();
  const days = clamp(Number(req.query.days ?? DETAIL_WINDOW_DAYS) || DETAIL_WINDOW_DAYS, 1, 90);
  const to = parseDateParam(req.query.to, asOf);
  const from = parseDateParam(req.query.from, daysBefore(to, days));

  if (from.getTime() > to.getTime()) {
    res.status(400).json({ error: 'The start of the range is after the end of it.' });
    return;
  }

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

  const detail: FridgeDetail = {
    fridge: summary,
    from: from.toISOString(),
    to: to.toISOString(),
    readings,
    excursions: analysis.excursions,
    doorEvents: analysis.doorEvents,
    gaps: analysis.gaps,
    drift: analysis.drift,
  };

  res.json(detail);
});
