import type { Express } from 'express';

import { fridgesRouter } from './fridges';
import { healthRouter } from './health';
import { reportsRouter } from './reports';
import { rulesRouter } from './rules';
import { searchRouter } from './search';
import { uploadsRouter } from './uploads';

export function registerRoutes(app: Express): void {
  app.use('/api', healthRouter);
  app.use('/api', fridgesRouter);
  app.use('/api', uploadsRouter);
  app.use('/api', reportsRouter);
  app.use('/api', rulesRouter);
  app.use('/api', searchRouter);
}
