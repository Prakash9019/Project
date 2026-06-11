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
  logLevel: process.env.LOG_LEVEL ?? 'info',

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

  agora: {
    appId: process.env.AGORA_APP_ID ?? '',
    appCertificate: process.env.AGORA_APP_CERTIFICATE ?? '',
    tokenExpirySec: num('AGORA_TOKEN_EXPIRY_SEC', 3600),
  },

  calls: {
    freeTierAudioMinPerDay: num('FREE_TIER_AUDIO_MIN_PER_DAY', 5),
    freeTierVideoMinPerDay: num('FREE_TIER_VIDEO_MIN_PER_DAY', 2),
  },

  payments: {
    razorpayKeyId:     process.env.RAZORPAY_KEY_ID ?? '',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    stripeSecretKey:   process.env.STRIPE_SECRET_KEY ?? '',
    stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  },

  aws: {
    region:          process.env.AWS_REGION ?? 'ap-south-1',
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },

  gcs: {
    projectId:      process.env.GCS_PROJECT_ID ?? '',
    bucket:         process.env.GCS_BUCKET ?? '',
    keyFilename:    process.env.GCS_KEY_FILENAME ?? '',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  },

  digilocker: {
    clientId:     process.env.DIGILOCKER_CLIENT_ID ?? '',
    clientSecret: process.env.DIGILOCKER_CLIENT_SECRET ?? '',
    redirectUri:  process.env.DIGILOCKER_REDIRECT_URI ?? '',
  },

  email: {
    host:     process.env.EMAIL_HOST ?? 'smtp.mailtrap.io',
    port:     num('EMAIL_PORT', 587),
    user:     process.env.EMAIL_USER ?? '',
    pass:     process.env.EMAIL_PASS ?? '',
    from:     process.env.EMAIL_FROM ?? 'noreply@nearme.app',
  },

  collegeOtpTtlSeconds: num('COLLEGE_OTP_TTL_SECONDS', 600),

  googleMaps: {
    serverApiKey: process.env.GOOGLE_MAPS_SERVER_KEY ?? '',
  },

  safety: {
    reportThresholdForReview: num('REPORT_THRESHOLD_FOR_REVIEW', 3),
    reportThresholdForBan:    num('REPORT_THRESHOLD_FOR_BAN', 10),
  },
};

// ── Startup env validation (Section 1.6) ─────────────────

const REQUIRED = [
  'DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'AGORA_APP_ID', 'AGORA_APP_CERTIFICATE',
  'GCS_BUCKET_NAME', 'GCS_SERVICE_ACCOUNT_KEY',
];
const OPTIONAL_WARN = ['ANTHROPIC_API_KEY', 'AWS_REKOGNITION_ACCESS_KEY', 'STRIPE_SECRET_KEY', 'DIGILOCKER_CLIENT_ID', 'ENCRYPTION_KEY'];

export function validateEnv(): void {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(`FATAL: Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  for (const k of OPTIONAL_WARN) {
    if (!process.env[k]) {
      // eslint-disable-next-line no-console
      console.warn(`WARN: Optional env var not set: ${k}`);
    }
  }
}
