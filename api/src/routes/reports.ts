import { Router } from 'express';

import { analyseReadings } from '../analysis';
import { config } from '../config';
import { getAsOf, listFridges, readingsByFridge } from '../repository';
import type { ExcursionReport, ExcursionReportRow } from '../types';
import { daysBefore, parseDateParam, parseIntParam } from './params';

export const reportsRouter = Router();

const REPORT_WINDOW_DAYS = 30;

/**
 * The inspector question, answered directly: "when did this fridge go above
 * five degrees, and for how long?"
 *
 * Fridges with no excursions are included on purpose. "This fridge was never
 * above the limit in this period" is the answer an inspector most often wants,
 * and leaving those rows out would make the report look like it had only found
 * the bad news.
 */
reportsRouter.get('/reports/excursions', async (req, res) => {
  const asOf = (await getAsOf()) ?? new Date();
  const to = parseDateParam(req.query.to, asOf);
  const from = parseDateParam(req.query.from, daysBefore(to, REPORT_WINDOW_DAYS));
  const fridgeId = parseIntParam(req.query.fridgeId);

  if (from.getTime() > to.getTime()) {
    res.status(400).json({ error: 'The start of the range is after the end of it.' });
    return;
  }

  const [allFridges, readings] = await Promise.all([
    listFridges(),
    readingsByFridge(from, to),
  ]);

  const fridges =
    fridgeId === null ? allFridges : allFridges.filter((fridge) => fridge.id === fridgeId);

  if (fridgeId !== null && fridges.length === 0) {
    res.status(404).json({ error: `No fridge with id ${fridgeId}.` });
    return;
  }

  const rows: ExcursionReportRow[] = fridges.map((fridge) => {
    const analysis = analyseReadings({
      readings: readings.get(fridge.id) ?? [],
      thresholdC: fridge.thresholdC,
      asOfMs: Math.min(asOf.getTime(), to.getTime()),
      timeZone: config.timezone,
    });

    return {
      fridgeId: fridge.id,
      fridgeName: fridge.name,
      branchName: fridge.branchName,
      thresholdC: fridge.thresholdC,
      excursions: analysis.excursions,
    };
  });

  // Worst first within the report too, so the page does not open on a wall of
  // fridges that were fine.
  rows.sort((a, b) => {
    const byCount = b.excursions.length - a.excursions.length;
    if (byCount !== 0) return byCount;
    return `${a.branchName} ${a.fridgeName}`.localeCompare(`${b.branchName} ${b.fridgeName}`);
  });

  const report: ExcursionReport = {
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: new Date().toISOString(),
    rows,
    totalExcursions: rows.reduce((total, row) => total + row.excursions.length, 0),
  };

  res.json(report);
});
