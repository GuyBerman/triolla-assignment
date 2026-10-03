import { Router } from 'express';

import { getAsOf } from '../repository';
import { buildExcursionReport } from '../services/reports';
import { asyncHandler } from './asyncHandler';
import { clamp, daysBefore, parseDateParam, parseIntParam } from './params';

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
reportsRouter.get(
  '/reports/excursions',
  asyncHandler(async (req, res) => {
    const asOf = (await getAsOf()) ?? new Date();
    const days = clamp(Number(req.query.days ?? REPORT_WINDOW_DAYS) || REPORT_WINDOW_DAYS, 1, 365);
    const to = parseDateParam(req.query.to, asOf, { endOfDay: true });
    const from = parseDateParam(req.query.from, daysBefore(to, days));
    const fridgeId = parseIntParam(req.query.fridgeId);

    if (from.getTime() > to.getTime()) {
      res.status(400).json({ error: 'The start of the range is after the end of it.' });
      return;
    }

    const report = await buildExcursionReport(from, to, fridgeId);
    if (report === null) {
      res.status(404).json({ error: `No fridge with id ${fridgeId}.` });
      return;
    }

    res.json(report);
  }),
);
