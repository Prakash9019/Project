import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/httpError';
import { env } from '../config/env';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId: string = req.requestId ?? 'unknown';

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      requestId,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // Prisma unique-constraint violation surfaces as a conflict
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (err as any)?.code;
  if (code === 'P2002') {
    res.status(409).json({ error: 'conflict', message: 'Resource already exists', requestId });
    return;
  }
  if (code === 'P2025') {
    res.status(404).json({ error: 'not_found', message: 'Resource not found', requestId });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[unhandled]', err);
  // In production, never leak internal error messages or stack traces to clients
  const message = env.isProd ? 'An unexpected error occurred' : 'Something went wrong';
  res.status(500).json({
    error: 'internal_error',
    message,
    requestId,
    ...(env.isProd ? {} : { detail: (err as Error)?.message }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  const requestId: string = req.requestId ?? 'unknown';
  res.status(404).json({ error: 'not_found', message: 'Route not found', requestId });
}
