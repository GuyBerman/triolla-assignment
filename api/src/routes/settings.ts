import { Router } from 'express';

import { parseAnalysisSettings } from '../analysis/settings';
import { getAnalysisSettings, saveAnalysisSettings } from '../settingsStore';
import { asyncHandler } from './asyncHandler';

export const settingsRouter = Router();

settingsRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const settings = await getAnalysisSettings();
    res.json({ settings });
  }),
);

settingsRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const parsed = parseAnalysisSettings(req.body);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const settings = await saveAnalysisSettings(parsed.settings);
    res.json({ settings });
  }),
);
