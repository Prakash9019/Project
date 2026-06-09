import dotenv from 'dotenv';

dotenv.config();

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? Number(v) : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

export const env = {
  port: num('PORT', 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',

  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTtl: process.env.REFRESH_TOKEN_TTL ?? '7d',
  },

  otp: {
    ttlSeconds: num('OTP_TTL_SECONDS', 300),
    devReturn: bool('OTP_DEV_RETURN', true),
  },

  grid: {
    defaultRadiusM: num('DEFAULT_RADIUS_M', 5000),
    shrinkRadiusM: num('SHRINK_RADIUS_M', 500),
    distanceFuzzKm: num('DISTANCE_FUZZ_KM', 0.1),
    onlineWindowSeconds: num('ONLINE_WINDOW_SECONDS', 120),
  },

  freeTierDailyRequests: num('FREE_TIER_DAILY_REQUESTS', 5),
  feedBoostDurationMinutes: num('FEED_BOOST_DURATION_MINUTES', 30),

  expiringPhoto: {
    freeTierDaily: num('FREE_TIER_DAILY_EXPIRING_PHOTOS', 5),
    viewSeconds: num('EXPIRING_PHOTO_VIEW_SECONDS', 10),
  },

  mediaBaseUrl: process.env.MEDIA_BASE_URL ?? '',

  webrtc: {
    stunUrls: (process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302').split(',').map((s) => s.trim()).filter(Boolean),
    turnUrl: process.env.TURN_URL ?? '',
    turnUsername: process.env.TURN_USERNAME ?? '',
    turnCredential: process.env.TURN_CREDENTIAL ?? '',
  },

  nationwideRadiusM: num('NATIONWIDE_RADIUS_M', 2_000_000),

  corsOrigin: process.env.CORS_ORIGIN ?? '*',
};
