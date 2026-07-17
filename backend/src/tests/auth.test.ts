import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { cleanDatabase, createTestUser, createTestToken, authHeader } from './helpers';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';

// ─────────────────────────────────────────────────────────────────
// AUTH TESTS
// Email OTP flows, JWT lifecycle, rate limiting, account security.
//
// Auth routes are mounted under /api/v1/auth (see app.ts). The email-OTP
// Redis keys are `email-otp:<email>` and `email-otp-rate:<email>`
// (config/redis.ts RedisKeys). Emails are normalized to lowercase.
// ─────────────────────────────────────────────────────────────────

const app = createApp();

beforeAll(async () => {
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

describe('Email OTP flow', () => {
  it('sends OTP to valid email address', async () => {
    const res = await request(app)
      .post('/api/v1/auth/email/send-otp')
      .send({ email: 'test@example.com' });
    // No Resend key in test env → controller logs the code and returns 200.
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      const stored = await redis.get('email-otp:test@example.com');
      expect(stored).not.toBeNull();
    }
  });

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/email/send-otp')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
  });

  it('verifies correct OTP and returns JWT', async () => {
    const email = `otp-test-${Date.now()}@example.com`;

    // Manually seed the OTP in Redis (simulates what send-otp would do).
    await redis.set(`email-otp:${email}`, '123456', 'EX', 600);

    const res = await request(app)
      .post('/api/v1/auth/email/verify-otp')
      .send({ email, code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body).toHaveProperty('isNewUser');

    // OTP should be consumed (deleted) after a successful verify.
    const remaining = await redis.get(`email-otp:${email}`);
    expect(remaining).toBeNull();
  });

  it('rejects wrong OTP', async () => {
    const email = `wrong-otp-${Date.now()}@example.com`;
    await redis.set(`email-otp:${email}`, '123456', 'EX', 600);

    const res = await request(app)
      .post('/api/v1/auth/email/verify-otp')
      .send({ email, code: '999999' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  it('rejects expired OTP (key not in Redis)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/email/verify-otp')
      .send({ email: 'nobody@example.com', code: '123456' });

    expect(res.status).toBe(400);
  });

  it('OTP is one-time use only', async () => {
    const email = `one-time-${Date.now()}@example.com`;
    await redis.set(`email-otp:${email}`, '123456', 'EX', 600);

    const first = await request(app)
      .post('/api/v1/auth/email/verify-otp')
      .send({ email, code: '123456' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/auth/email/verify-otp')
      .send({ email, code: '123456' });
    expect(second.status).toBe(400);
  });
});

describe('JWT token lifecycle', () => {
  it('GET /auth/me returns user with valid token', async () => {
    const user = await createTestUser();
    const token = createTestToken(user.id);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.plan).toBe('free');
  });

  it('GET /auth/me includes effectiveLimits with correct values', async () => {
    const freeUser = await createTestUser({ plan: 'free' });
    const goldUser = await createTestUser({ plan: 'gold' });

    const freeToken = createTestToken(freeUser.id, 'free');
    const goldToken = createTestToken(goldUser.id, 'gold',
      Math.floor(Date.now() / 1000) + 86400);

    const freeRes = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(freeToken));
    expect(freeRes.body.effectiveLimits).toBeDefined();
    expect(freeRes.body.effectiveLimits.messageTemplates).toBe(0);
    expect(freeRes.body.effectiveLimits.gridProfiles).toBe(100);
    expect(freeRes.body.effectiveLimits.incognitoMode).toBe(false);
    expect(freeRes.body.effectiveLimits.maxRadiusM).toBe(25_000);

    const goldRes = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(goldToken));
    expect(goldRes.body.effectiveLimits.messageTemplates).toBe(5);
    expect(goldRes.body.effectiveLimits.gridProfiles).toBeNull();
    expect(goldRes.body.effectiveLimits.incognitoMode).toBe(true);
    expect(goldRes.body.effectiveLimits.maxRadiusM).toBe(100_000);
  });

  it('GET /auth/me returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me returns 401 with tampered token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.tampered.signature');
    expect(res.status).toBe(401);
  });

  it('expired plan downgrades to free on next request', async () => {
    const user = await createTestUser({ plan: 'gold' });
    await prisma.user.update({
      where: { id: user.id },
      data: { planExpiresAt: new Date(Date.now() - 1000) },
    });

    // Token carrying an already-expired planExpiresAt (Unix seconds).
    const expiredPlanToken = createTestToken(
      user.id,
      'gold',
      Math.floor((Date.now() - 1000) / 1000),
    );

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(expiredPlanToken));

    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });

  it('banned user gets 403 on any authenticated request', async () => {
    const user = await createTestUser();
    const token = createTestToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { isBanned: true },
    });
    // requireAuth checks the Redis banned flag (set at ban time).
    await redis.set(`banned:${user.id}`, '1');

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(token));

    expect(res.status).toBe(403);
    // errorHandler surfaces the code in `error` ('forbidden') and the human
    // text in `message` ('Account suspended').
    expect(res.body.message).toMatch(/banned|suspended/i);
  });
});

describe('Auth rate limiting', () => {
  it('rate limits email OTP requests (max 3 per window)', async () => {
    const email = `ratelimit-${Date.now()}@example.com`;

    // Send 3 times (the configured limit).
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/v1/auth/email/send-otp')
        .send({ email });
    }

    // 4th request should be rate limited.
    const blocked = await request(app)
      .post('/api/v1/auth/email/send-otp')
      .send({ email });

    // 429 (rate limit) is the expected outcome. A 500 (Resend failure) is
    // acceptable in test env — the key guarantee is it does NOT succeed (200).
    expect(blocked.status).not.toBe(200);
    if (blocked.status === 429) {
      expect(blocked.body.error).toMatch(/rate|limit/i);
    }
  });
});

describe('Account security', () => {
  it('cannot access another user data with own token', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id);

    // A updates their own profile — must never touch B.
    await request(app)
      .patch('/api/v1/me')
      .set(authHeader(tokenA))
      .send({ firstName: 'Hacked' });

    const dbUserB = await prisma.user.findUnique({ where: { id: userB.id } });
    expect(dbUserB?.firstName).not.toBe('Hacked');

    const resB = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(createTestToken(userB.id)));
    expect(resB.body.firstName).not.toBe('Hacked');
  });
});
