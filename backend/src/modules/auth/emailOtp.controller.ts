import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { env } from '../../config/env';
import { sendOtpEmail } from '../../adapters/resend';
import { serializeSelf, signUserPhotos } from '../profile/profile.serializer';
import { issueTokenPair } from './auth.service';
import { logEvent } from '../../middleware/logger';

// ── Schemas ───────────────────────────────────────────────

export const sendEmailOtpSchema = z.object({
  email: z.string().email(),
});

export const verifyEmailOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

// ── Helpers ───────────────────────────────────────────────

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Increment a Redis counter and set TTL on first write. Returns new count. */
async function incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ttlSeconds);
  return count;
}

// ── POST /api/auth/email/send-otp ─────────────────────────

export async function sendEmailOtp(req: Request, res: Response): Promise<void> {
  const email = normalizeEmail((req.body as z.infer<typeof sendEmailOtpSchema>).email);

  // Rate limit: max N sends per email per window.
  const rateKey = RedisKeys.emailOtpRate(email);
  const count = await incrWithTtl(rateKey, env.emailOtp.rateWindowSeconds);
  if (count > env.emailOtp.rateMax) {
    const retryAfterSeconds = (await redis.ttl(rateKey)) || env.emailOtp.rateWindowSeconds;
    res.status(429).json({ error: 'rate_limit_exceeded', retryAfterSeconds });
    return;
  }

  const code = generateCode();
  await redis.set(RedisKeys.emailOtp(email), code, 'EX', env.emailOtp.ttlSeconds);
  // New code invalidates any prior attempt counter.
  await redis.del(RedisKeys.emailOtpAttempts(email));

  if (!env.resend.apiKey && !env.isProd) {
    // Dev convenience: no Resend key configured — log the code instead of sending.
    // eslint-disable-next-line no-console
    console.log(`[email-otp stub] ${email} -> ${code}`);
  } else {
    await sendOtpEmail(email, code);
  }

  logEvent({ event: 'email_otp_sent', email });
  res.status(200).json({ message: 'Code sent', expiresInSeconds: env.emailOtp.ttlSeconds });
}

// ── POST /api/auth/email/verify-otp ───────────────────────

export async function verifyEmailOtp(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof verifyEmailOtpSchema>;
  const email = normalizeEmail(body.email);
  const { code } = body;

  const stored = await redis.get(RedisKeys.emailOtp(email));
  if (!stored) {
    res.status(400).json({ error: 'code_expired_or_invalid' });
    return;
  }

  if (stored !== code) {
    const attempts = await incrWithTtl(RedisKeys.emailOtpAttempts(email), env.emailOtp.ttlSeconds);
    if (attempts >= env.emailOtp.maxAttempts) {
      // Too many wrong guesses — burn the code, force a fresh request.
      await redis.del(RedisKeys.emailOtp(email), RedisKeys.emailOtpAttempts(email));
    }
    res.status(400).json({ error: 'invalid_code' });
    return;
  }

  // Correct — one-time use.
  await redis.del(RedisKeys.emailOtp(email), RedisKeys.emailOtpAttempts(email));

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const isNewUser = !existing;

  const user = await prisma.user.upsert({
    where: { email },
    update: { emailVerified: true, lastActiveAt: new Date() },
    create: {
      email,
      emailVerified: true,
      settings: { create: {} },
      wallet: { create: {} },
    },
    include: { photos: { orderBy: { order: 'asc' } }, settings: true },
  });

  // isVerified = phoneVerified OR emailVerified (face verification removed).
  const isVerified = user.phoneVerified || user.emailVerified;
  if (isVerified !== user.isVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { isVerified } });
    user.isVerified = isVerified;
  }

  const tokens = await issueTokenPair(user.id, user.phoneVerified, user.emailVerified, user.tier, user.plan, user.planExpiresAt);
  const profileComplete = Boolean(user.name || user.firstName);

  logEvent({ event: 'email_otp_verified', userId: user.id, plan: user.plan });
  res.status(200).json({
    ...tokens,
    isNewUser,
    profileComplete,
    user: serializeSelf(await signUserPhotos(user)),
  });
}
