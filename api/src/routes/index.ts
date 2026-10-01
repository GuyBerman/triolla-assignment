import type { Express } from 'express';

import { healthRouter } from './health';

export function registerRoutes(app: Express): void {
  app.use('/api', healthRouter);
}
