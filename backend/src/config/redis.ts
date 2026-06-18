import Redis from 'ioredis';
import { env } from './env';

/**
 * A single shared Redis connection used for:
 *  - geo-spatial discovery index (GEOADD / GEOSEARCH)  -> key: `geo:users`
 *  - OTP challenge store (with TTL)                     -> key: `otp:<phone>`
 *  - per-user daily request-cap counters (with TTL)     -> key: `cap:requests:<userId>:<yyyymmdd>`
 *  - online presence heartbeat                          -> key: `presence:<userId>`
 */
export const redis = new Redis(env.redisUrl, {
  retryStrategy(times: number) {
    if (times > 10) return null; // stop retrying after 10 attempts
    return Math.min(times * 100, 3000);
  },
  maxRetriesPerRequest: 3,
  connectTimeout: 5000,
  lazyConnect: false,
});

redis.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[redis] connection error:', err.message);
});

// Keys / namespaces kept in one place so they never drift.
export const RedisKeys = {
  geoUsers: 'geo:users',
  otp: (phone: string) => `otp:${phone}`,
  otpAttempts: (phone: string) => `otp:attempts:${phone}`,
  dailyRequestCap: (userId: string, yyyymmdd: string) => `cap:requests:${userId}:${yyyymmdd}`,
  dailyExpiringPhotoCap: (userId: string, yyyymmdd: string) => `cap:expphoto:${userId}:${yyyymmdd}`,
  presence: (userId: string) => `presence:${userId}`,
  banned: (userId: string) => `banned:${userId}`,
  collegeOtp: (userId: string) => `college-otp:${userId}`,
  lastActive: (userId: string) => `lastActive:${userId}`,
  aiTop10: (userId: string) => `ai:top10:${userId}`,

  // Rate-limiting keys
  refreshRate: (ip: string)       => `refresh_rate:${ip}`,
  firebaseLoginRate: (ip: string) => `firebase_login:${ip}`,

  // Section 2.3 — blocked IDs cache (30s TTL)
  blockedIds: (userId: string) => `blocked:${userId}`,

  // Section 2.4 — static data response caches
  cacheBillingPlans: 'cache:billing_plans',
  cacheCatalogs: 'cache:catalogs',
};
