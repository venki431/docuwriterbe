import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[error]', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message, code: 'INTERNAL_ERROR' });
}
