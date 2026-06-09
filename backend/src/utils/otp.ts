import crypto from 'crypto';
import { redis, RedisKeys } from '../config/redis';
import { env } from '../config/env';
import { Errors } from './httpError';

const MAX_VERIFY_ATTEMPTS = 5;

/** Generate a 6-digit numeric OTP, store its hash in Redis with TTL, return the code. */
export async function issueOtp(phone: string): Promise<string> {
  const code = (crypto.randomInt(0, 1_000_000)).toString().padStart(6, '0');
  const hash = hashOtp(phone, code);
  await redis.set(RedisKeys.otp(phone), hash, 'EX', env.otp.ttlSeconds);
  await redis.del(RedisKeys.otpAttempts(phone));
  return code;
}

/** Verify the supplied code. Throws on mismatch / expiry / too-many-attempts. */
export async function verifyOtp(phone: string, code: string): Promise<void> {
  const stored = await redis.get(RedisKeys.otp(phone));
  if (!stored) throw Errors.badRequest('OTP expired or not requested');

  const attempts = await redis.incr(RedisKeys.otpAttempts(phone));
  if (attempts === 1) await redis.expire(RedisKeys.otpAttempts(phone), env.otp.ttlSeconds);
  if (attempts > MAX_VERIFY_ATTEMPTS) {
    await redis.del(RedisKeys.otp(phone));
    throw Errors.rateLimited('Too many OTP attempts, request a new code');
  }

  if (hashOtp(phone, code) !== stored) throw Errors.badRequest('Invalid OTP code');

  // success — burn the challenge
  await redis.del(RedisKeys.otp(phone));
  await redis.del(RedisKeys.otpAttempts(phone));
}

function hashOtp(phone: string, code: string): string {
  return crypto.createHmac('sha256', env.jwt.accessSecret).update(`${phone}:${code}`).digest('hex');
}
