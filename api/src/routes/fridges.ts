import { Router } from 'express';

import { getAsOf } from '../repository';
import { getFridgeDetail, listFridgeSummaries } from '../services/fridges';
import { asyncHandler } from './asyncHandler';
import { clamp, daysBefore, parseDateParam, parseIntParam } from './params';

export const fridgesRouter = Router();

/** Default windows, in days. */
const LIST_WINDOW_DAYS = 7;
const DETAIL_WINDOW_DAYS = 3;

/**
 * The dashboard. Every fridge in the chain with its current state, worst
 * first, because Summer is between branches on a phone and the first question
 * is always "is anything wrong".
 */
fridgesRouter.get(
  '/fridges',
  asyncHandler(async (req, res) => {
    const days = clamp(Number(req.query.days ?? LIST_WINDOW_DAYS) || LIST_WINDOW_DAYS, 1, 90);
    res.json(await listFridgeSummaries(days));
  }),
);

/** One fridge in detail: the series for the chart, plus everything found in it. */
fridgesRouter.get(
  '/fridges/:id',
  asyncHandler(async (req, res) => {
    const id = parseIntParam(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Fridge id must be a number.' });
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

    const detail = await getFridgeDetail(id, from, to);
    if (detail === null) {
      res.status(404).json({ error: `No fridge with id ${id}.` });
      return;
    }

    res.json(detail);
  }),
);
