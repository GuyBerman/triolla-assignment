import { Router } from 'express';

import { searchFridges } from '../services/search';
import { asyncHandler } from './asyncHandler';
import { clamp, parseNumberParam } from './params';

export const searchRouter = Router();

const SEARCH_WINDOW_DAYS = 30;

/**
 * Quick lookup: by name, and/or "which fridges reached X degrees".
 *
 * The dashboard always judges against each fridge's stored limit (5°C unless
 * changed). This endpoint is for the other question: "what if I care about
 * ten degrees, not five?" Status and reasons are recomputed against that
 * number for the results, but the stored limit is left alone.
 */
searchRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const aboveC = parseNumberParam(req.query.aboveC);
    const days = clamp(Number(req.query.days ?? SEARCH_WINDOW_DAYS) || SEARCH_WINDOW_DAYS, 1, 90);

    if (aboveC !== null && (aboveC < -30 || aboveC > 80)) {
      res.status(400).json({ error: 'That temperature is outside a plausible range.' });
      return;
    }

    res.json(await searchFridges({ query, aboveC, days }));
  }),
);
