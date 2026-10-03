import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 does not catch rejected promises from a handler. Without this the
 * request simply never gets a response - Postgres going down mid-request left
 * the app spinning on a loading screen forever instead of saying something was
 * wrong. Wrapping sends the failure to the error middleware, which answers.
 *
 * Express 5 does this itself; this wrapper is the thing to delete on upgrade.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
