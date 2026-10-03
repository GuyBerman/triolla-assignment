import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';

import { registerRoutes } from './routes';

export function createApp() {
  const app = express();

  // The Expo app is served from a different origin (localhost:8081 on web,
  // or an exp:// URL on a device), so the API has to be openly CORS-friendly.
  // Safe here because there is no auth and no cookies - see NOTES.md.
  app.use(cors());
  app.use(express.json());

  registerRoutes(app);

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  });

  // The detail goes to the terminal, not to Summer. A raw Postgres message
  // ("relation \"readings\" does not exist") tells her nothing she can act on,
  // and the app shows whatever is in `error` verbatim.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] unhandled error:', err);
    res.status(500).json({
      error: 'Something went wrong at our end. The details are in the API terminal window.',
    });
  });

  return app;
}
