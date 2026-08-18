import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimit } from '../middleware/rateLimit';
import { errorHandler } from '../middleware/error';
import { redis } from '../config/redis';
import { detectProvider } from '../utils/paymentProvider';
import { stripeConfigured } from '../adapters/stripe';

// ─────────────────────────────────────────────────────────────────
// RATE LIMITING — the limiter is disabled suite-wide in setup.ts, so
// these tests re-enable it around their own assertions.
// ─────────────────────────────────────────────────────────────────

/** Unique bucket per test run so reruns never inherit a warm counter. */
function bucket(label: string): string {
  return `test-${label}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

function appWith(name: string, limit: number, by: 'ip' | 'user' = 'ip') {
  const app = express();
  app.get('/probe', rateLimit({ name, limit, windowSec: 60, by }), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  process.env.RATE_LIMIT_DISABLED = 'false';
});

afterEach(async () => {
  process.env.RATE_LIMIT_DISABLED = 'true';
  const keys = await redis.keys('ratelimit:test-*');
  if (keys.length) await redis.del(...keys);
});

describe('rateLimit middleware', () => {
  it('allows requests up to the limit and 429s beyond it', async () => {
    const name = bucket('basic');
    const app = appWith(name, 3);

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/probe');
      expect(res.status, `request ${i + 1}`).toBe(200);
    }

    const blocked = await request(app).get('/probe');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('rate_limited');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('reports remaining quota in RateLimit-Remaining', async () => {
    const app = appWith(bucket('headers'), 5);
    const first = await request(app).get('/probe');
    expect(first.headers['ratelimit-limit']).toBe('5');
    expect(first.headers['ratelimit-remaining']).toBe('4');
  });

  it('keys separate clients independently', async () => {
    const app = appWith(bucket('perclient'), 1);

    const a1 = await request(app).get('/probe').set('x-forwarded-for', '203.0.113.10');
    const a2 = await request(app).get('/probe').set('x-forwarded-for', '203.0.113.10');
    const b1 = await request(app).get('/probe').set('x-forwarded-for', '203.0.113.11');

    expect(a1.status).toBe(200);
    expect(a2.status).toBe(429); // same client, over limit
    expect(b1.status).toBe(200); // different client, own bucket
  });

  it('is a no-op when RATE_LIMIT_DISABLED=true', async () => {
    const app = appWith(bucket('disabled'), 1);
    process.env.RATE_LIMIT_DISABLED = 'true';

    for (let i = 0; i < 5; i++) {
      expect((await request(app).get('/probe')).status).toBe(200);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// PAYMENT PROVIDER — adapters/stripe is a stub whose retrievePaymentIntent
// always reports "succeeded". Honouring a client-supplied
// paymentProvider:'stripe' would therefore hand out free subscriptions.
// ─────────────────────────────────────────────────────────────────

describe('detectProvider — stripe stub cannot be selected', () => {
  it('never routes to stripe while stripe is unconfigured', () => {
    expect(stripeConfigured).toBe(false);
    expect(detectProvider('+919876543210', 'stripe')).toBe('razorpay');
    expect(detectProvider('+14155550100', 'stripe')).toBe('razorpay');
    expect(detectProvider('+14155550100')).toBe('razorpay');
    expect(detectProvider(null, 'stripe')).toBe('razorpay');
  });
});
