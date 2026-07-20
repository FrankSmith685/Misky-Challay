import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Envuelve controladores async para que sus errores lleguen al error handler. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
