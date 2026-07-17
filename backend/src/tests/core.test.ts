import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import {
  cleanDatabase, createTestUser, createTestToken,
  authHeader,
} from './helpers';

const app = createApp();

beforeAll(async () => {
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

// ─────────────────────────────────────────────────────────────────
// CORE MECHANICS TESTS
// These verify the fundamental rules of messaging, calls, and discovery.
// ─────────────────────────────────────────────────────────────────

// ─── TEST 1 — Interaction cap is lifetime, not daily ─────────────

describe('Interaction cap — lifetime, not daily', () => {
  it('keeps the 21st person blocked even when the 20 prior interactions are from "yesterday"', async () => {
    const actor = await createTestUser({ plan: 'free' });
    const token = createTestToken(actor.id, 'free');

    // 20 prior interactions, backdated 25+ hours — proves the cap has no
    // rolling/daily window: recordInteraction()'s count query
    // (prisma.userInteraction.count({ where: { actorId } })) has no date
    // filter at all, so old rows count exactly the same as fresh ones.
    for (let i = 0; i < 20; i++) {
      const target = await createTestUser();
      const interaction = await prisma.userInteraction.create({
        data: { actorId: actor.id, targetId: target.id, interactionType: 'message' },
      });
      await prisma.userInteraction.update({
        where: { id: interaction.id },
        data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      });
    }

    const target21 = await createTestUser();
    const blocked = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(token))
      .send({ userId: target21.id });

    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('interaction_limit_reached');
    expect(blocked.body.details.limit).toBe(20);
  });

  it('a paid (Gold) user has no interaction cap at all', async () => {
    const goldActor = await createTestUser({ plan: 'gold' });
    const token = createTestToken(goldActor.id, 'gold', Math.floor(Date.now() / 1000) + 86400);

    // recordInteraction() short-circuits for any active paid plan before it
    // even looks at the count, so it never writes a UserInteraction row —
    // 20 real conversations, then a 21st, all must succeed.
    for (let i = 0; i < 20; i++) {
      const target = await createTestUser();
      const res = await request(app)
        .post('/api/v1/conversations/start')
        .set(authHeader(token))
        .send({ userId: target.id });
      expect(res.status).toBe(201);
    }

    const target21 = await createTestUser();
    const allowed = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(token))
      .send({ userId: target21.id });

    expect(allowed.status).toBe(201);

    const interactionCount = await prisma.userInteraction.count({ where: { actorId: goldActor.id } });
    expect(interactionCount).toBe(0);
  });
});

// ─── TEST 2 — Message delivery: first message sets the sender's own flag ─
//
// Conversation.userAId/userBId are assigned by stable(senderId, receiverId) —
// a lexicographic sort of the two UUIDs — NOT by who initiated. So "A" the
// initiator in this test is not guaranteed to be conversation.userAId. The
// aHasReplied/bHasReplied columns mean "this side of the conversation has
// sent at least one message" (see chat.service.ts sendMessage: the SENDER's
// own side flips true immediately). callFlags() then unlocks calls for a
// user once the OTHER side's flag is true. We read back convo.userAId to
// map "A's flag" / "B's flag" correctly instead of assuming column names.

describe('Message delivery — reply flags unlock calls', () => {
  it('flips the sender\'s own flag on first send, and unlocks calls only once both sides have sent one', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id);
    const tokenB = createTestToken(userB.id);

    const startRes = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(tokenA))
      .send({ userId: userB.id });
    expect(startRes.status).toBe(201);
    const conversationId = startRes.body.id;

    const convo0 = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(convo0.aHasReplied).toBe(false);
    expect(convo0.bHasReplied).toBe(false);

    // A sends the first message
    const sendA = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(tokenA))
      .send({ type: 'text', content: 'Hi!' });
    expect(sendA.status).toBe(201);

    const convo1 = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    const isAUserA = convo1.userAId === userA.id;
    const aSideFlag = isAUserA ? convo1.aHasReplied : convo1.bHasReplied;
    const bSideFlag = isAUserA ? convo1.bHasReplied : convo1.aHasReplied;

    // A's own side flag is now true (A has sent a message); B's is still false.
    expect(aSideFlag).toBe(true);
    expect(bSideFlag).toBe(false);
    // Calls are still not enabled for A — the OTHER side (B) hasn't sent anything.
    expect(sendA.body.audioCallEnabled).toBe(false);

    // A tries to call before B has replied — must be blocked
    const callBeforeReply = await request(app)
      .post('/api/v1/calls')
      .set(authHeader(tokenA))
      .send({ conversationId, type: 'audio' });
    expect(callBeforeReply.status).toBe(403);

    // B sends their first message
    const sendB = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(tokenB))
      .send({ type: 'text', content: 'Hey!' });
    expect(sendB.status).toBe(201);

    const convo2 = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    const bSideFlagNow = isAUserA ? convo2.bHasReplied : convo2.aHasReplied;
    expect(bSideFlagNow).toBe(true);

    // Now both sides have sent a message — calls are enabled for A.
    const callAfterReply = await request(app)
      .post('/api/v1/calls')
      .set(authHeader(tokenA))
      .send({ conversationId, type: 'audio' });
    expect(callAfterReply.status).toBe(201);
    expect(callAfterReply.body.agoraChannelName).toBeTruthy();
  });
});

// ─── TEST 3 — Unsend before read (Premium) / after read (Gold+) ─────

describe('Unsend — Premium before read, Gold+ anytime', () => {
  it('Premium can unsend an unread message', async () => {
    const sender = await createTestUser({ plan: 'premium' });
    const recipient = await createTestUser();
    const senderToken = createTestToken(sender.id, 'premium', Math.floor(Date.now() / 1000) + 86400);

    const startRes = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(senderToken))
      .send({ userId: recipient.id });
    const conversationId = startRes.body.id;

    const sendRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(senderToken))
      .send({ type: 'text', content: 'oops' });
    const messageId = sendRes.body.id;

    // Recipient has NOT read it yet
    const unsendRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages/${messageId}/unsend`)
      .set(authHeader(senderToken));

    expect(unsendRes.status).toBe(200);
    expect(unsendRes.body.isUnsent).toBe(true);
  });

  it('Premium CANNOT unsend once the recipient has read it (403)', async () => {
    const sender = await createTestUser({ plan: 'premium' });
    const recipient = await createTestUser();
    const senderToken = createTestToken(sender.id, 'premium', Math.floor(Date.now() / 1000) + 86400);
    const recipientToken = createTestToken(recipient.id);

    const startRes = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(senderToken))
      .send({ userId: recipient.id });
    const conversationId = startRes.body.id;

    const sendRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(senderToken))
      .send({ type: 'text', content: 'oops' });
    const messageId = sendRes.body.id;

    // Recipient reads the conversation
    const readRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/read`)
      .set(authHeader(recipientToken));
    expect(readRes.status).toBe(200);

    const unsendRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages/${messageId}/unsend`)
      .set(authHeader(senderToken));

    expect(unsendRes.status).toBe(403);
    expect(unsendRes.body.error).toBe('already_read');
  });

  it('Gold can unsend even after the recipient has read it', async () => {
    const sender = await createTestUser({ plan: 'gold' });
    const recipient = await createTestUser();
    const senderToken = createTestToken(sender.id, 'gold', Math.floor(Date.now() / 1000) + 86400);
    const recipientToken = createTestToken(recipient.id);

    const startRes = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(senderToken))
      .send({ userId: recipient.id });
    const conversationId = startRes.body.id;

    const sendRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(senderToken))
      .send({ type: 'text', content: 'oops' });
    const messageId = sendRes.body.id;

    await request(app)
      .post(`/api/v1/conversations/${conversationId}/read`)
      .set(authHeader(recipientToken));

    const unsendRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages/${messageId}/unsend`)
      .set(authHeader(senderToken));

    expect(unsendRes.status).toBe(200);
    expect(unsendRes.body.isUnsent).toBe(true);
  });
});

// ─── TEST 4 — Edit message: 5 minute window only (Gold+) ────────────

describe('Edit message — 5 minute window, Gold+ only', () => {
  it('Gold can edit within the 5 minute window', async () => {
    const sender = await createTestUser({ plan: 'gold' });
    const recipient = await createTestUser();
    const senderToken = createTestToken(sender.id, 'gold', Math.floor(Date.now() / 1000) + 86400);

    const startRes = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(senderToken))
      .send({ userId: recipient.id });
    const conversationId = startRes.body.id;

    const sendRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(senderToken))
      .send({ type: 'text', content: 'original' });
    const messageId = sendRes.body.id;

    const editRes = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/messages/${messageId}`)
      .set(authHeader(senderToken))
      .send({ content: 'edited within window' });

    expect(editRes.status).toBe(200);
    expect(editRes.body.content).toBe('edited within window');
    expect(editRes.body.isEdited).toBe(true);
  });

  it('Gold CANNOT edit after the 5 minute window (403)', async () => {
    const sender = await createTestUser({ plan: 'gold' });
    const recipient = await createTestUser();
    const senderToken = createTestToken(sender.id, 'gold', Math.floor(Date.now() / 1000) + 86400);

    const startRes = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(senderToken))
      .send({ userId: recipient.id });
    const conversationId = startRes.body.id;

    const sendRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(senderToken))
      .send({ type: 'text', content: 'original' });
    const messageId = sendRes.body.id;

    // Simulate the message being over 5 minutes old
    await prisma.message.update({
      where: { id: messageId },
      data: { createdAt: new Date(Date.now() - 6 * 60 * 1000) },
    });

    const editRes = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/messages/${messageId}`)
      .set(authHeader(senderToken))
      .send({ content: 'too late' });

    expect(editRes.status).toBe(403);
    expect(editRes.body.error).toBe('edit_window_expired');
  });

  it('Free user cannot edit at all (Gold+ only feature)', async () => {
    const sender = await createTestUser({ plan: 'free' });
    const recipient = await createTestUser();
    const senderToken = createTestToken(sender.id, 'free');

    const startRes = await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(senderToken))
      .send({ userId: recipient.id });
    const conversationId = startRes.body.id;

    const sendRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(authHeader(senderToken))
      .send({ type: 'text', content: 'original' });
    const messageId = sendRes.body.id;

    const editRes = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/messages/${messageId}`)
      .set(authHeader(senderToken))
      .send({ content: 'nope' });

    // requirePlan() (middleware/subscription.ts) now throws an HttpError, so
    // errorHandler's `instanceof HttpError` branch handles it and this
    // correctly surfaces as 403 `plan_required` instead of a generic 500.
    expect(editRes.status).toBe(403);
    expect(editRes.body.error).toBe('plan_required');
  });
});

// ─── TEST 5 — Orientation grid: two straight men don't see each other ─

describe('Orientation filtering in grid', () => {
  it('two men who both want to see women do not see each other', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id);
    const tokenB = createTestToken(userB.id);

    await prisma.user.update({ where: { id: userA.id }, data: { gender: 'male', wantToSee: ['women'] } });
    await prisma.user.update({ where: { id: userB.id }, data: { gender: 'male', wantToSee: ['women'] } });

    await redis.geoadd('geo:users', 77.5946, 12.9716, userA.id);
    await redis.geoadd('geo:users', 77.5946, 12.9716, userB.id);

    const gridForA = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(tokenA))
      .query({ lat: 12.9716, lng: 77.5946 });
    expect(gridForA.status).toBe(200);
    expect(gridForA.body.cards.map((c: any) => c.id)).not.toContain(userB.id);

    const gridForB = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(tokenB))
      .query({ lat: 12.9716, lng: 77.5946 });
    expect(gridForB.status).toBe(200);
    expect(gridForB.body.cards.map((c: any) => c.id)).not.toContain(userA.id);
  });
});

// ─── TEST 6 — Platinum ranks above Free in grid results ─────────────

describe('Grid ranking by plan', () => {
  it('a Platinum candidate ranks above every Free candidate at the same location', async () => {
    const viewer = await createTestUser({ plan: 'free' });
    const viewerToken = createTestToken(viewer.id);

    const freeUsers = [];
    for (let i = 0; i < 5; i++) {
      const u = await createTestUser({ plan: 'free' });
      await redis.geoadd('geo:users', 77.5946, 12.9716, u.id);
      freeUsers.push(u);
    }

    const platinumUser = await createTestUser({
      plan: 'platinum',
      planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await redis.geoadd('geo:users', 77.5946, 12.9716, platinumUser.id);

    const res = await request(app)
      .get('/api/v1/grid')
      .set(authHeader(viewerToken))
      .query({ lat: 12.9716, lng: 77.5946 });

    expect(res.status).toBe(200);
    const ids = res.body.cards.map((c: any) => c.id);
    const platinumIndex = ids.indexOf(platinumUser.id);
    expect(platinumIndex).toBeGreaterThanOrEqual(0);

    for (const free of freeUsers) {
      const freeIndex = ids.indexOf(free.id);
      expect(freeIndex).toBeGreaterThanOrEqual(0);
      expect(platinumIndex).toBeLessThan(freeIndex);
    }
  });
});
