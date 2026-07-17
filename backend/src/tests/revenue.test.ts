import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import {
  cleanDatabase, createTestUser, createTestToken,
  authHeader, createActiveAddOn,
} from './helpers';

// ─────────────────────────────────────────────────────────────
// REVENUE-CRITICAL TESTS
// These verify that users get what they pay for (and nothing more).
// A failure here means money is being collected without delivering value.
// ─────────────────────────────────────────────────────────────

const app = createApp();

beforeAll(async () => {
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

// ─── TEST 1 — Chat pack extends interaction limit ─────────────

describe('Chat Pack add-on', () => {
  it('extends the free-tier interaction limit by chatSlotsAdded', async () => {
    const actor = await createTestUser({ plan: 'free' });
    const token = createTestToken(actor.id, 'free');

    // Exhaust the base 20-person limit
    for (let i = 0; i < 20; i++) {
      const target = await createTestUser();
      await prisma.userInteraction.create({
        data: { actorId: actor.id, targetId: target.id, interactionType: 'message' },
      });
    }

    // 21st conversation — blocked at the base limit
    const target21 = await createTestUser();
    const blocked = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(token))
      .send({ userId: target21.id });

    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('interaction_limit_reached');
    expect(blocked.body.details.limit).toBe(20);

    // Purchase a chat pack (S = 5 extra slots)
    await createActiveAddOn(actor.id, 'chat_pack_s', { chatSlotsAdded: 5 });

    // 21st conversation now succeeds (limit is now 25)
    const allowed = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(token))
      .send({ userId: target21.id });

    expect(allowed.status).toBe(201);

    // Reach 25 total interactions, then the 26th should be blocked again
    for (let i = 0; i < 4; i++) {
      const t = await createTestUser();
      await prisma.userInteraction.create({
        data: { actorId: actor.id, targetId: t.id, interactionType: 'message' },
      });
    }
    const target26 = await createTestUser();
    const blocked26 = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(token))
      .send({ userId: target26.id });

    expect(blocked26.status).toBe(403);
    expect(blocked26.body.details.limit).toBe(25); // 20 base + 5 from pack
  });
});

// ─── TEST 2 — Travel pass grants access for Free/Premium ─────

describe('Travel Pass add-on', () => {
  it('allows a Free user to use city profiles (travel mode)', async () => {
    const freeUser = await createTestUser({ plan: 'free' });
    const token = createTestToken(freeUser.id, 'free');

    const without = await request(app)
      .post('/api/v1/city-profiles')
      .set(authHeader(token))
      .send({ city: 'Bangalore', country: 'India' });

    expect(without.status).toBe(403);

    await createActiveAddOn(freeUser.id, 'travel_pass');

    const withPass = await request(app)
      .post('/api/v1/city-profiles')
      .set(authHeader(token))
      .send({ city: 'Bangalore', country: 'India' });

    expect(withPass.status).toBe(201);
    expect(withPass.body).toHaveProperty('id');
    expect(withPass.body.cityName).toBe('Bangalore, India');
  });

  it('allows a Premium user to use city profiles with travel pass', async () => {
    const premiumUser = await createTestUser({ plan: 'premium' });
    const token = createTestToken(premiumUser.id, 'premium', Math.floor(Date.now() / 1000) + 86400);

    const without = await request(app)
      .post('/api/v1/city-profiles')
      .set(authHeader(token))
      .send({ city: 'Mumbai', country: 'India' });

    expect(without.status).toBe(403);

    await createActiveAddOn(premiumUser.id, 'travel_pass_week');

    const withPass = await request(app)
      .post('/api/v1/city-profiles')
      .set(authHeader(token))
      .send({ city: 'Mumbai', country: 'India' });

    expect(withPass.status).toBe(201);
  });

  it('travel pass does not expire while still active', async () => {
    const freeUser = await createTestUser({ plan: 'free' });
    const token = createTestToken(freeUser.id, 'free');

    await createActiveAddOn(freeUser.id, 'travel_pass', {
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app)
      .post('/api/v1/city-profiles')
      .set(authHeader(token))
      .send({ city: 'Chennai', country: 'India' });

    expect(res.status).toBe(201);
  });

  it('expired travel pass is rejected', async () => {
    const freeUser = await createTestUser({ plan: 'free' });
    const token = createTestToken(freeUser.id, 'free');

    await createActiveAddOn(freeUser.id, 'travel_pass', {
      expiresAt: new Date(Date.now() - 1000),
      isActive: true,
    });

    const res = await request(app)
      .post('/api/v1/city-profiles')
      .set(authHeader(token))
      .send({ city: 'Delhi', country: 'India' });

    expect(res.status).toBe(403);
  });
});

// ─── TEST 3 — Subscription verify immediately updates entitlements ─

describe('Subscription verify — plan entitlement update', () => {
  it('reflects the new plan on GET /auth/me right after activation', async () => {
    const user = await createTestUser({ plan: 'free' });
    const freeToken = createTestToken(user.id, 'free');

    // Simulate what subscriptions.controller.ts#verifySubscription does after a
    // successful payment-provider signature check (which needs live Razorpay/Stripe
    // credentials we don't have in test — so we drive the same DB writes directly).
    await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: 'free',
        plan: 'gold',
        billingCycle: 'monthly',
        priceInr: 799,
        active: false,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paymentProvider: 'razorpay',
        providerSubscriptionId: 'test-order-123',
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { plan: 'gold', planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    await prisma.subscription.update({
      where: { userId: user.id },
      data: { active: true },
    });

    // /me reads the user row directly, so the OLD (free) JWT already sees the new plan.
    const meResponse = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(freeToken));

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.plan).toBe('gold');

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.plan).toBe('gold');
  });
});

// ─── TEST 4 — Gold/Platinum get 100km radius, Free gets 25km ──

describe('Grid radius by plan', () => {
  it('clamps radius to 25km for Free users', async () => {
    const freeUser = await createTestUser({ plan: 'free' });
    const token = createTestToken(freeUser.id, 'free');

    await redis.geoadd('geo:users', 77.5946, 12.9716, freeUser.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946, radius: 80000 });

    expect(res.status).toBe(200);
    expect(res.body.radiusM).toBeLessThanOrEqual(25_000);
  });

  it('allows Gold users to request up to 100km radius', async () => {
    const goldUser = await createTestUser({ plan: 'gold' });
    const token = createTestToken(goldUser.id, 'gold', Math.floor(Date.now() / 1000) + 86400);

    await redis.geoadd('geo:users', 77.5946, 12.9716, goldUser.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946, radius: 80000 });

    expect(res.status).toBe(200);
    expect(res.body.radiusM).toBeGreaterThanOrEqual(79_000);
  });

  it('clamps Gold users at 100km maximum', async () => {
    const goldUser = await createTestUser({ plan: 'gold' });
    const token = createTestToken(goldUser.id, 'gold', Math.floor(Date.now() / 1000) + 86400);

    await redis.geoadd('geo:users', 77.5946, 12.9716, goldUser.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946, radius: 200000 });

    expect(res.status).toBe(200);
    expect(res.body.radiusM).toBeLessThanOrEqual(100_000);
  });

  it('Free users are capped at their plan\'s gridProfiles limit (100)', async () => {
    const freeUser = await createTestUser({ plan: 'free' });
    const token = createTestToken(freeUser.id, 'free');

    for (let i = 0; i < 120; i++) {
      const u = await createTestUser();
      await redis.geoadd('geo:users', 77.5946, 12.9716, u.id);
    }
    await redis.geoadd('geo:users', 77.5946, 12.9716, freeUser.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946, limit: 50 });

    expect(res.status).toBe(200);
    expect(res.body.cards.length).toBeLessThanOrEqual(100);
    expect(res.body.planLimit).toBe(100);
  });
});
