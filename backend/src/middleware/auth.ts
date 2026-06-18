import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessClaims } from '../utils/jwt';
import { Errors } from '../utils/httpError';
import { computeEffectiveLimits, maybePersistExpiry, type EffectiveLimits } from './subscription';
import { redis, RedisKeys } from '../config/redis';
import { prisma } from '../config/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessClaims;
      effectiveLimits?: EffectiveLimits;
    }
  }
}

/**
 * Requires a valid Bearer access token. Populates req.user and req.effectiveLimits.
 * - Plan lazily evaluated from JWT claims (no DB hit on expiry).
 * - isBanned checked via Redis cache (set at ban time, no DB hit on normal requests).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(Errors.unauthorized('Missing Bearer token'));
  }
  try {
    const claims = verifyAccessToken(header.slice(7));

    // Banned check via Redis — O(1), no DB hit on normal requests
    const bannedFlag = await redis.get(RedisKeys.banned(claims.sub));
    if (bannedFlag === '1') {
      return next(Errors.forbidden('Account suspended'));
    }

    req.user = claims;
    req.effectiveLimits = computeEffectiveLimits(claims.plan ?? 'free', claims.planExpiresAt);
    // Fire-and-forget: persist downgrade to DB if plan expired
    maybePersistExpiry(claims.sub, claims.plan ?? 'free', claims.planExpiresAt ?? null);
    // Debounced lastActiveAt update — max once per 60s per user (no DB hit when cached)
    refreshLastActive(claims.sub);
    next();
  } catch {
    next(Errors.unauthorized('Invalid or expired token'));
  }
}

function refreshLastActive(userId: string): void {
  redis.set(RedisKeys.lastActive(userId), '1', 'EX', 60, 'NX').then((result) => {
    // NX means only set if NOT exists — result is null when key already exists (skip DB write)
    if (result === 'OK') {
      prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }).catch(() => {});
    }
  }).catch(() => {});
}

/** Requires the authenticated user to be verified (email via Firebase, or phone via legacy OTP). */
export function requireVerifiedPhone(req: Request, _res: Response, next: NextFunction): void {
  const verified = req.user?.emailVerified || req.user?.phoneVerified;
  if (!verified) {
    return next(Errors.forbidden('Account verification required'));
  }
  next();
}
