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
  maxRetriesPerRequest: 3,
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
};
