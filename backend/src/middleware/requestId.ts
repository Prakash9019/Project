import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Attaches a requestId to every incoming request.
 * Reads X-Request-ID from the client if present; otherwise generates a UUID.
 * Echoes the value back via X-Request-ID response header.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  req.requestId = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}
