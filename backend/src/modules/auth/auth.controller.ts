import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { redis, RedisKeys } from '../../config/redis';
import { Errors } from '../../utils/httpError';
import { serializeSelf } from '../profile/profile.serializer';
import * as authService from './auth.service';
import { logEvent, maskPhone } from '../../middleware/logger';

// E.164 phone format (strict: + followed by 1–15 digits, leading digit 1-9)
const phoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone must be E.164, e.g. +14155550123');

export const requestOtpSchema = z.object({ phone: phoneSchema });
export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(10) });
export const logoutSchema = z.object({ refreshToken: z.string().min(10) });

// ── Rate limit helpers ────────────────────────────────────

/** Increment a Redis counter and set TTL on first write. Returns new count. */
async function incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, ttlSeconds);
  }
  return count;
}

// ── Handlers ─────────────────────────────────────────────

export async function requestOtp(req: Request, res: Response): Promise<void> {
  const { phone } = req.body as z.infer<typeof requestOtpSchema>;

  // Rate limit: 3 requests per 10 minutes per phone number
  const rateLimitKey = RedisKeys.otpReqRate(phone);
  const count = await incrWithTtl(rateLimitKey, 10 * 60);
  if (count > 3) {
    res.status(429).json({
      error: 'rate_limited',
      message: 'Too many OTP requests. Try again in 10 minutes.',
    });
    return;
  }

  const { devCode } = await authService.requestOtp(phone);
  logEvent({ event: 'otp_requested', phone: maskPhone(phone) });
  res.status(200).json({
    message: 'OTP sent',
    expiresInSeconds: env.otp.ttlSeconds,
    ...(env.otp.devReturn ? { devCode } : {}),
  });
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const { phone, code } = req.body as z.infer<typeof verifyOtpSchema>;

  // Account lockout check — hard block for 30 minutes after 5 failures
  const lockKey = RedisKeys.otpLocked(phone);
  const isLocked = await redis.exists(lockKey);
  if (isLocked) {
    res.status(429).json({
      error: 'account_locked',
      message: 'Too many failed attempts. Try again in 30 minutes.',
    });
    return;
  }

  try {
    const { user, tokens, profileComplete, isNewUser } = await authService.verifyOtpAndIssueTokens(phone, code);

    // On success: clear failure counters
    await redis.del(RedisKeys.otpFailRate(phone), RedisKeys.otpLocked(phone));

    logEvent({ event: 'login_success', userId: user.id, plan: user.plan });
    res.status(200).json({ ...tokens, profileComplete, isNewUser, user: serializeSelf(user) });
  } catch (err: unknown) {
    // Count failed attempts
    const failKey = RedisKeys.otpFailRate(phone);
    const failCount = await incrWithTtl(failKey, 10 * 60);

    if (failCount >= 5) {
      // Lock account for 30 minutes
      await redis.set(lockKey, '1', 'EX', 30 * 60);
      logEvent({ event: 'login_failed', phone: maskPhone(phone), reason: 'account_locked' });
      res.status(429).json({
        error: 'account_locked',
        message: 'Too many failed attempts. Try again in 30 minutes.',
      });
      return;
    }

    logEvent({ event: 'login_failed', phone: maskPhone(phone), failCount });
    // Re-throw so the global error handler handles it
    throw err;
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  // Rate limit: 10 requests per minute per IP
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
    ?? req.socket.remoteAddress
    ?? 'unknown';
  const rateLimitKey = RedisKeys.refreshRate(ip);
  const count = await incrWithTtl(rateLimitKey, 60);
  if (count > 10) {
    res.status(429).json({
      error: 'rate_limited',
      message: 'Too many token refresh requests. Try again later.',
    });
    return;
  }

  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const tokens = await authService.refreshTokens(refreshToken);
  // userId is embedded in the new access token — decode without verify just to get it for logging
  try {
    const payload = JSON.parse(Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString());
    logEvent({ event: 'token_refreshed', userId: payload.sub as string });
  } catch { /* skip if decode fails */ }
  res.status(200).json(tokens);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as z.infer<typeof logoutSchema>;
  if (refreshToken) {
    await authService.logoutSession(refreshToken);
  }
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { photos: { orderBy: { order: 'asc' } }, settings: true },
  });
  if (!user) throw Errors.notFound('User not found');
  res.status(200).json(serializeSelf(user));
}
