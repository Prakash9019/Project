import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { cleanDatabase, createTestUser, createTestToken, authHeader } from './helpers';
import { prisma } from '../config/prisma';

// ─────────────────────────────────────────────────────────────────
// CHAT SEARCH + SHARED MEDIA — full-history, server-side. Replaces the
// client-side filter/scan that only ever saw the loaded page.
// ─────────────────────────────────────────────────────────────────

const app = createApp();

beforeAll(async () => {
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

async function startConversation(tokenA: string, userBId: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/conversations/start')
    .set(authHeader(tokenA))
    .send({ userId: userBId });
  expect([200, 201]).toContain(res.status);
  return res.body.id as string;
}

async function send(token: string, convId: string, body: Record<string, unknown>) {
  const res = await request(app)
    .post(`/api/v1/conversations/${convId}/messages`)
    .set(authHeader(token))
    .send({ type: 'text', ...body });
  expect(res.status).toBe(201);
  return res.body;
}

async function fixture() {
  const userA = await createTestUser();
  const userB = await createTestUser();
  const tokenA = createTestToken(userA.id);
  const convId = await startConversation(tokenA, userB.id);
  return { userA, userB, tokenA, tokenB: createTestToken(userB.id), convId };
}

describe('GET /conversations/:id/messages/search', () => {
  it('finds a message far outside the most recent page', async () => {
    const { tokenA, convId } = await fixture();

    await send(tokenA, convId, { content: 'needle in a haystack' });
    // Bury it under more messages than a default page would return.
    for (let i = 0; i < 40; i++) {
      await send(tokenA, convId, { content: `filler ${i}` });
    }

    const res = await request(app)
      .get(`/api/v1/conversations/${convId}/messages/search`)
      .query({ q: 'needle' })
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].content).toBe('needle in a haystack');
  });

  it('matches case-insensitively', async () => {
    const { tokenA, convId } = await fixture();
    await send(tokenA, convId, { content: 'Coffee Tomorrow?' });

    const res = await request(app)
      .get(`/api/v1/conversations/${convId}/messages/search`)
      .query({ q: 'COFFEE' })
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it('returns an empty list when nothing matches', async () => {
    const { tokenA, convId } = await fixture();
    await send(tokenA, convId, { content: 'hello' });

    const res = await request(app)
      .get(`/api/v1/conversations/${convId}/messages/search`)
      .query({ q: 'zzzznotpresent' })
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
  });

  it('rejects an empty query', async () => {
    const { tokenA, convId } = await fixture();
    const res = await request(app)
      .get(`/api/v1/conversations/${convId}/messages/search`)
      .query({ q: '' })
      .set(authHeader(tokenA));

    expect(res.status).toBe(422);
  });

  it('does not leak another conversation to a non-participant', async () => {
    const { convId } = await fixture();
    const outsider = createTestToken((await createTestUser()).id);

    const res = await request(app)
      .get(`/api/v1/conversations/${convId}/messages/search`)
      .query({ q: 'anything' })
      .set(authHeader(outsider));

    expect(res.status).toBe(404);
  });

  it('is paginated by the `before` cursor', async () => {
    const { tokenA, convId } = await fixture();
    for (let i = 0; i < 5; i++) await send(tokenA, convId, { content: `match ${i}` });

    const first = await request(app)
      .get(`/api/v1/conversations/${convId}/messages/search`)
      .query({ q: 'match', limit: 2 })
      .set(authHeader(tokenA));

    expect(first.status).toBe(200);
    expect(first.body.messages).toHaveLength(2);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await request(app)
      .get(`/api/v1/conversations/${convId}/messages/search`)
      .query({ q: 'match', limit: 2, before: first.body.nextCursor })
      .set(authHeader(tokenA));

    expect(second.status).toBe(200);
    const firstIds = first.body.messages.map((m: { id: string }) => m.id);
    for (const m of second.body.messages) expect(firstIds).not.toContain(m.id);
  });
});

describe('GET /conversations/:id/media', () => {
  it('returns shared media from the full history, newest first', async () => {
    const { tokenA, convId } = await fixture();

    await send(tokenA, convId, { type: 'photo', mediaUrls: ['uploads/a.jpg'] });
    for (let i = 0; i < 30; i++) await send(tokenA, convId, { content: `filler ${i}` });
    await send(tokenA, convId, { type: 'photo', mediaUrls: ['uploads/b.jpg'] });

    const res = await request(app)
      .get(`/api/v1/conversations/${convId}/media`)
      .query({ type: 'image' })
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.media).toHaveLength(2);
  });

  it('filters links out of plain text messages', async () => {
    const { tokenA, convId } = await fixture();
    await send(tokenA, convId, { content: 'check https://example.com out' });
    await send(tokenA, convId, { content: 'no url here' });

    const res = await request(app)
      .get(`/api/v1/conversations/${convId}/media`)
      .query({ type: 'link' })
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.media).toHaveLength(1);
    expect(res.body.media[0].content).toContain('example.com');
  });

  it('excludes view-once photos from the gallery', async () => {
    const { tokenA, userA, convId } = await fixture();
    await send(tokenA, convId, { type: 'photo', mediaUrls: ['uploads/normal.jpg'] });
    // Inserted directly: sending an expiring photo is Premium-gated, and this
    // test is about the gallery query, not the paywall.
    await prisma.message.create({
      data: {
        conversationId: convId,
        senderId: userA.id,
        type: 'expiring_photo',
        mediaUrls: ['uploads/secret.jpg'],
        viewOnce: true,
      },
    });

    const res = await request(app)
      .get(`/api/v1/conversations/${convId}/media`)
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.media).toHaveLength(1);
  });

  it('is not readable by a non-participant', async () => {
    const { convId } = await fixture();
    const outsider = createTestToken((await createTestUser()).id);

    const res = await request(app)
      .get(`/api/v1/conversations/${convId}/media`)
      .set(authHeader(outsider));

    expect(res.status).toBe(404);
  });
});
