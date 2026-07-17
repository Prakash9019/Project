import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import {
  cleanDatabase, createTestUser, createTestToken, authHeader,
} from './helpers';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';

// ─────────────────────────────────────────────────────────────────
// DISCOVERY TESTS
// Grid visibility/exclusions, plan limits, orientation filtering,
// profile views, taps, Right Now feed, favorites.
//
// Orientation filtering keys off the `gender` column ('male'/'female')
// via toDiscoverLabel() in grid.service — genderIdentity 'man'/'woman'
// is NOT mapped, so these tests set `gender` to mirror real behavior.
// ─────────────────────────────────────────────────────────────────

const app = createApp();

beforeAll(async () => {
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

// Helper: add user to geo index
async function addToGeo(userId: string, lat = 12.9716, lng = 77.5946) {
  await redis.geoadd('geo:users', lng, lat, userId);
}

// ─── Grid — basic visibility ─────────────────────────────────────

describe('Grid — basic visibility', () => {
  it('returns cards for nearby users', async () => {
    const viewer = await createTestUser();
    const nearby = await createTestUser();
    const token = createTestToken(viewer.id);

    await addToGeo(viewer.id);
    await addToGeo(nearby.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946 });

    expect(res.status).toBe(200);
    expect(res.body.cards).toBeDefined();
    const ids = res.body.cards.map((c: any) => c.id);
    expect(ids).toContain(nearby.id);
  });

  it('excludes self from grid results', async () => {
    const viewer = await createTestUser();
    const token = createTestToken(viewer.id);

    await addToGeo(viewer.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946 });

    expect(res.status).toBe(200);
    const ids = res.body.cards.map((c: any) => c.id);
    expect(ids).not.toContain(viewer.id);
  });

  it('excludes users inactive for more than 14 days', async () => {
    const viewer = await createTestUser();
    const stale = await createTestUser();
    const token = createTestToken(viewer.id);

    await prisma.user.update({
      where: { id: stale.id },
      data: { lastActiveAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
    });

    await addToGeo(viewer.id);
    await addToGeo(stale.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946 });

    const ids = res.body.cards.map((c: any) => c.id);
    expect(ids).not.toContain(stale.id);
  });

  it('excludes users with incognitoMode=true', async () => {
    const viewer = await createTestUser();
    const incognito = await createTestUser();
    const token = createTestToken(viewer.id);

    await prisma.user.update({
      where: { id: incognito.id },
      data: { incognitoMode: true },
    });

    await addToGeo(viewer.id);
    await addToGeo(incognito.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946 });

    const ids = res.body.cards.map((c: any) => c.id);
    expect(ids).not.toContain(incognito.id);
  });

  it('excludes users with isOnGrid=false (panic hide)', async () => {
    const viewer = await createTestUser();
    const hidden = await createTestUser();
    const token = createTestToken(viewer.id);

    await prisma.user.update({
      where: { id: hidden.id },
      data: { isOnGrid: false },
    });

    await addToGeo(viewer.id);
    await addToGeo(hidden.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946 });

    const ids = res.body.cards.map((c: any) => c.id);
    expect(ids).not.toContain(hidden.id);
  });
});

// ─── Grid — plan limits ──────────────────────────────────────────

describe('Grid — plan limits', () => {
  it('Free users get planLimit=100 in response', async () => {
    const viewer = await createTestUser({ plan: 'free' });
    const token = createTestToken(viewer.id);
    await addToGeo(viewer.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946 });

    expect(res.body.planLimit).toBe(100);
  });

  it('Gold users get planLimit=null (unlimited) in response', async () => {
    const viewer = await createTestUser({ plan: 'gold' });
    const token = createTestToken(viewer.id, 'gold',
      Math.floor(Date.now() / 1000) + 86400);
    await addToGeo(viewer.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946 });

    expect(res.body.planLimit).toBeNull();
  });
});

// ─── Grid — orientation filter ───────────────────────────────────

describe('Grid — orientation filter', () => {
  it('straight man does not see another straight man', async () => {
    const manA = await createTestUser();
    const manB = await createTestUser();

    await prisma.user.update({
      where: { id: manA.id },
      data: { gender: 'male', genderIdentity: 'man', wantToSee: ['women'] },
    });
    await prisma.user.update({
      where: { id: manB.id },
      data: { gender: 'male', genderIdentity: 'man', wantToSee: ['women'], whoCanDiscoverMe: ['women'] },
    });

    const token = createTestToken(manA.id);
    await addToGeo(manA.id);
    await addToGeo(manB.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946 });

    const ids = res.body.cards.map((c: any) => c.id);
    expect(ids).not.toContain(manB.id);
  });

  it('gay man sees another gay man', async () => {
    const manA = await createTestUser();
    const manB = await createTestUser();

    await prisma.user.update({
      where: { id: manA.id },
      data: { gender: 'male', genderIdentity: 'man', wantToSee: ['men'], whoCanDiscoverMe: ['men'] },
    });
    await prisma.user.update({
      where: { id: manB.id },
      data: { gender: 'male', genderIdentity: 'man', wantToSee: ['men'], whoCanDiscoverMe: ['men'] },
    });

    const token = createTestToken(manA.id);
    await addToGeo(manA.id);
    await addToGeo(manB.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(token))
      .query({ lat: 12.9716, lng: 77.5946 });

    const ids = res.body.cards.map((c: any) => c.id);
    expect(ids).toContain(manB.id);
  });
});

// ─── Profile views and taps ──────────────────────────────────────

describe('Profile views and taps', () => {
  it('viewing a profile records a ProfileView', async () => {
    const viewer = await createTestUser();
    const viewed = await createTestUser();
    const token = createTestToken(viewer.id);

    const res = await request(app)
      .get(`/api/v1/users/${viewed.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);

    const view = await prisma.profileView.findFirst({
      where: { viewerId: viewer.id, viewedId: viewed.id },
    });
    expect(view).not.toBeNull();
  });

  it('incognito user viewing a profile does NOT record a view', async () => {
    const viewer = await createTestUser();
    const viewed = await createTestUser();
    const token = createTestToken(viewer.id);

    await prisma.user.update({
      where: { id: viewer.id },
      data: { incognitoMode: true },
    });

    await request(app)
      .get(`/api/v1/users/${viewed.id}`)
      .set(authHeader(token));

    const view = await prisma.profileView.findFirst({
      where: { viewerId: viewer.id, viewedId: viewed.id },
    });
    expect(view).toBeNull();
  });

  it('sending a tap creates a Tap record', async () => {
    const sender = await createTestUser();
    const receiver = await createTestUser();
    const token = createTestToken(sender.id);

    const res = await request(app)
      .post('/api/v1/discovery/taps')
      .set(authHeader(token))
      .send({ userId: receiver.id });
    expect(res.status).toBe(201);

    const tap = await prisma.tap.findFirst({
      where: { senderId: sender.id, receiverId: receiver.id },
    });
    expect(tap).not.toBeNull();
  });

  it('Gold+ can see who viewed their profile', async () => {
    const gold = await createTestUser({ plan: 'gold' });
    const viewer = await createTestUser();
    const goldToken = createTestToken(gold.id, 'gold',
      Math.floor(Date.now() / 1000) + 86400);

    await prisma.profileView.create({
      data: { viewerId: viewer.id, viewedId: gold.id },
    });

    const res = await request(app)
      .get('/api/v1/discovery/views')
      .set(authHeader(goldToken));
    expect(res.status).toBe(200);
    expect(res.body.views.length).toBeGreaterThan(0);
    expect(res.body.views[0].viewer.id).toBe(viewer.id);
  });

  it('Free user cannot see who viewed their profile', async () => {
    const freeUser = await createTestUser({ plan: 'free' });
    const token = createTestToken(freeUser.id, 'free');

    const res = await request(app)
      .get('/api/v1/discovery/views')
      .set(authHeader(token));
    expect(res.status).toBe(403);
  });
});

// ─── Right Now feed ──────────────────────────────────────────────

describe('Right Now feed', () => {
  it('active Right Now status appears in feed', async () => {
    const poster = await createTestUser();
    const viewer = await createTestUser();
    const posterToken = createTestToken(poster.id);
    const viewerToken = createTestToken(viewer.id);

    // Set Right Now status (rightNowCategory is a lowercase enum).
    const patch = await request(app)
      .patch('/api/v1/me')
      .set(authHeader(posterToken))
      .send({
        rightNowStatus: 'Looking for coffee meetup',
        rightNowCategory: 'coffee',
        rightNowExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      });
    expect(patch.status).toBe(200);

    // The feed resolves the viewer's own geo position, so both need geo entries.
    await addToGeo(poster.id);
    await addToGeo(viewer.id);

    const feed = await request(app)
      .get('/api/v1/discovery/right-now')
      .set(authHeader(viewerToken))
      .query({ lat: 12.9716, lng: 77.5946 });

    expect(feed.status).toBe(200);
    const ids = feed.body.statuses.map((s: any) => s.id);
    expect(ids).toContain(poster.id);
  });

  it('expired Right Now status does not appear in feed', async () => {
    const poster = await createTestUser();
    const viewer = await createTestUser();
    const viewerToken = createTestToken(viewer.id);

    // Set an already-expired status directly in the DB.
    await prisma.user.update({
      where: { id: poster.id },
      data: {
        rightNowStatus: 'Old status',
        rightNowExpiresAt: new Date(Date.now() - 1000),
      },
    });

    await addToGeo(poster.id);
    await addToGeo(viewer.id);

    const feed = await request(app)
      .get('/api/v1/discovery/right-now')
      .set(authHeader(viewerToken))
      .query({ lat: 12.9716, lng: 77.5946 });

    expect(feed.status).toBe(200);
    const ids = feed.body.statuses.map((s: any) => s.id);
    expect(ids).not.toContain(poster.id);
  });
});

// ─── Favorites ───────────────────────────────────────────────────

describe('Favorites', () => {
  it('can add and remove a favorite', async () => {
    const user = await createTestUser();
    const target = await createTestUser();
    const token = createTestToken(user.id);

    const add = await request(app)
      .post('/api/v1/discovery/favorites')
      .set(authHeader(token))
      .send({ userId: target.id });
    expect(add.status).toBe(201);

    const list = await request(app)
      .get('/api/v1/discovery/favorites')
      .set(authHeader(token));
    expect(list.status).toBe(200);
    const ids = list.body.favorites.map((f: any) => f.id);
    expect(ids).toContain(target.id);

    const remove = await request(app)
      .delete(`/api/v1/discovery/favorites/${target.id}`)
      .set(authHeader(token));
    expect(remove.status).toBe(204);

    const after = await request(app)
      .get('/api/v1/discovery/favorites')
      .set(authHeader(token));
    const afterIds = after.body.favorites.map((f: any) => f.id);
    expect(afterIds).not.toContain(target.id);
  });
});
