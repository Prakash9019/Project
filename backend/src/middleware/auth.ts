import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessClaims } from '../utils/jwt';
import { Errors } from '../utils/httpError';
import { computeEffectiveLimits, maybePersistExpiry, type EffectiveLimits } from './subscription';
import { redis, RedisKeys } from '../config/redis';
import { prisma } from '../config/prisma';
import { withTimeout } from '../utils/withTimeout';

/** Max time to wait on the Redis banned-check before failing open. */
const REDIS_CHECK_TIMEOUT_MS = 1000;
/** Sentinel returned by withTimeout when the Redis command hangs past the timeout. */
const REDIS_TIMEOUT = Symbol('redis_timeout');

/** Structured, non-throwing log of a Redis failure inside auth (never blocks the request). */
function logRedisFailure(event: string, userId: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      event,
      userId,
      err: err instanceof Error ? err.message : String(err),
    }),
  );
}

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

  // Token verification is the ONLY thing that may reject with 401. A malformed
  // or expired token is an auth failure; a Redis/infrastructure failure is not.
  let claims: AccessClaims;
  try {
    claims = verifyAccessToken(header.slice(7));
  } catch {
    return next(Errors.unauthorized('Invalid or expired token'));
  }

  // Banned check via Redis — O(1), no DB hit on normal requests.
  // FAIL OPEN: if Redis is unreachable, rejects, or hangs, log and let the
  // request through. A Redis outage must degrade gracefully, not 401 every user.
  // withTimeout guards against a hung command (ioredis can queue on a dead
  // connection); the try/catch guards against a rejected command.
  try {
    const bannedFlag = await withTimeout<string | null | typeof REDIS_TIMEOUT>(
      redis.get(RedisKeys.banned(claims.sub)),
      REDIS_CHECK_TIMEOUT_MS,
      REDIS_TIMEOUT,
    );
    if (bannedFlag === REDIS_TIMEOUT) {
      logRedisFailure('redis_banned_check_timeout', claims.sub, `>${REDIS_CHECK_TIMEOUT_MS}ms`);
    } else if (bannedFlag === '1') {
      return next(Errors.forbidden('Account suspended'));
    }
  } catch (err) {
    logRedisFailure('redis_banned_check_failed', claims.sub, err);
    // fall through — do not block the request
  }

  req.user = claims;
  req.effectiveLimits = computeEffectiveLimits(claims.plan ?? 'free', claims.planExpiresAt);
  // Fire-and-forget: persist downgrade to DB if plan expired
  maybePersistExpiry(claims.sub, claims.plan ?? 'free', claims.planExpiresAt ?? null);
  // Debounced lastActiveAt update — max once per 60s per user (no DB hit when cached)
  refreshLastActive(claims.sub);
  next();
}

/**
 * Debounced lastActiveAt refresh. Fully fire-and-forget: any Redis failure is
 * logged but never blocks the request (this runs after next() has been called).
 */
function refreshLastActive(userId: string): void {
  redis
    .set(RedisKeys.lastActive(userId), '1', 'EX', 60, 'NX')
    .then((result) => {
      // NX means only set if NOT exists — result is null when key already exists (skip DB write)
      if (result === 'OK') {
        prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }).catch(() => {});
      }
    })
    .catch((err) => logRedisFailure('redis_last_active_failed', userId, err));
}

/**
 * Verification gate — DISABLED.
 *
 * Photo/face/email verification is no longer required to use the app. Firebase
 * Auth already establishes a verified identity at sign-in, so this guard is now
 * a pass-through: a valid Bearer token (enforced by `requireAuth`) is sufficient
 * to access discovery, messaging, calls, Right Now, the store, etc.
 *
 * Kept as a named export (rather than removed from every route) so route
 * registration stays unchanged and the gate can be re-enabled in one place.
 */
export function requireVerifiedPhone(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
