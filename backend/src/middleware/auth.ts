import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessClaims } from '../utils/jwt';
import { Errors } from '../utils/httpError';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessClaims;
    }
  }
}

/** Requires a valid Bearer access token. Populates req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(Errors.unauthorized('Missing Bearer token'));
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch {
    next(Errors.unauthorized('Invalid or expired token'));
  }
}

/** Requires the authenticated user to have completed phone verification. */
export function requireVerifiedPhone(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.phoneVerified) {
    return next(Errors.forbidden('Phone verification required'));
  }
  next();
}
