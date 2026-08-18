/**
 * Redis-backed HTTP rate limiting.
 *
 * Uses the same fixed-window INCR/EXPIRE pattern the auth controller already
 * used for its per-IP login and refresh caps, generalised into a middleware so
 * the expensive/abusable routes can each get their own bucket.
 *
 * Design notes:
 *  - Authenticated routes are keyed by USER id, not IP. Mobile carriers put
 *    thousands of subscribers behind one CGNAT address, so an IP-keyed limit on
 *    a normal in-app route would throttle whole carriers. IP keying is reserved
 *    for pre-auth endpoints, where there is no user to key on.
 *  - Fail-open: if Redis is unreachable the request is allowed. A Redis blip
 *    must not take down login for everyone.
 *  - Set RATE_LIMIT_DISABLED=true to switch every bucket off (used by the test
 *    suite, which fires hundreds of requests per second from one "IP").
 */
import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { Errors } from '../utils/httpError';

export interface RateLimitOptions {
  /** Bucket name — becomes part of the Redis key, so keep it unique per limiter. */
  name: string;
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
  /**
   * 'user' keys by authenticated user id (falling back to IP if somehow absent),
   * 'ip' always keys by client IP. Default 'user'.
   */
  by?: 'user' | 'ip';
  /** Optional message shown to the client on 429. */
  message?: string;
}

/** Client IP behind a proxy (Render/Cloudflare terminate TLS in front of us). */
export function clientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/** Read at request time so test setup can toggle it regardless of import order. */
function disabled(): boolean {
  return process.env.RATE_LIMIT_DISABLED === 'true';
}

/**
 * Increment `key` and return the new count, setting the TTL on first write.
 * Returns null when Redis is unavailable (caller then fails open).
 */
async function hit(key: string, windowSec: number): Promise<number | null> {
  try {
    const [[, count]] = (await redis
      .multi()
      .incr(key)
      .expire(key, windowSec, 'NX')
      .exec()) as [[Error | null, number], [Error | null, number]];
    return count;
  } catch {
    return null;
  }
}

export function rateLimit(opts: RateLimitOptions) {
  const { name, limit, windowSec, by = 'user', message } = opts;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (disabled()) return next();

    const subject = by === 'ip' ? `ip:${clientIp(req)}` : (req.user?.sub ? `u:${req.user.sub}` : `ip:${clientIp(req)}`);
    const key = `ratelimit:${name}:${subject}`;

    const count = await hit(key, windowSec);
    if (count === null) return next(); // Redis down — fail open

    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)));

    if (count > limit) {
      const ttl = await redis.ttl(key).catch(() => windowSec);
      const retryAfter = ttl > 0 ? ttl : windowSec;
      res.setHeader('Retry-After', String(retryAfter));
      return next(Errors.rateLimited(message ?? 'Too many requests. Please slow down and try again shortly.'));
    }

    next();
  };
}

// ── Shared buckets ─────────────────────────────────────────
// Tuned to be invisible to normal app usage and only bite on abuse.

/** Pre-auth credential endpoints (login, refresh, dev-login). Keyed by IP. */
export const authLimiter = rateLimit({
  name: 'auth',
  limit: 30,
  windowSec: 60,
  by: 'ip',
  message: 'Too many authentication attempts. Please wait a minute and try again.',
});

/**
 * OTP issuance — the costliest abuse target (each request sends a real SMS or
 * email). Deliberately generous per IP because of carrier NAT; the tight
 * per-phone / per-email caps in utils/otp.ts remain the primary defence.
 */
export const otpLimiter = rateLimit({
  name: 'otp',
  limit: 20,
  windowSec: 600,
  by: 'ip',
  message: 'Too many verification codes requested. Please wait a few minutes.',
});

/** Gemini-backed endpoints — real per-call cost. Keyed by user. */
export const aiLimiter = rateLimit({
  name: 'ai',
  limit: 20,
  windowSec: 60,
  message: 'You are using AI features too quickly. Please wait a moment.',
});

/** Signed-upload-URL issuance. Keyed by user. */
export const uploadLimiter = rateLimit({
  name: 'upload',
  limit: 60,
  windowSec: 60,
  message: 'Too many uploads at once. Please wait a moment.',
});

/** Endpoints that call a paid third-party API (translation, geocoding). Keyed by user. */
export const externalApiLimiter = rateLimit({
  name: 'external',
  limit: 60,
  windowSec: 60,
  message: 'Too many requests. Please wait a moment.',
});
