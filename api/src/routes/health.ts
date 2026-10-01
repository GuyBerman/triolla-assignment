import { Router } from 'express';

import { pool } from '../db/pool';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  try {
    const { rows } = await pool.query<{ now: Date }>('select now() as now');
    res.json({ status: 'ok', database: 'connected', time: rows[0]?.now });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      database: 'unreachable',
      error: (err as Error).message,
    });
  }
});
