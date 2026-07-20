import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import {
  cleanDatabase, createTestUser, createTestToken,
  authHeader,
} from './helpers';
import { prisma } from '../config/prisma';

// ─────────────────────────────────────────────────────────────────
// MESSAGING TESTS
// Delivery/read status, unsend, edit, message templates, and
// conversation management (delete-thread, pin).
// ─────────────────────────────────────────────────────────────────

const app = createApp();

beforeAll(async () => {
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

// Helper: start a conversation between two users
async function startConversation(tokenA: string, userBId: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/conversations/start')
    .set(authHeader(tokenA))
    .send({ userId: userBId });
  expect([200, 201]).toContain(res.status);
  return res.body.id as string;
}

// Helper: send a message
async function sendMessage(token: string, convId: string, content: string) {
  const res = await request(app)
    .post(`/api/v1/conversations/${convId}/messages`)
    .set(authHeader(token))
    .send({ type: 'text', content });
  expect(res.status).toBe(201);
  return res.body;
}

// The message-template endpoints are mounted under the conversations router.
const TEMPLATES_PATH = '/api/v1/conversations/templates';

// ─── Message delivery status ─────────────────────────────────────

describe('Message delivery status', () => {
  it('new message has readAt=null initially (recipient offline in test env)', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id);

    const convId = await startConversation(tokenA, userB.id);
    const msg = await sendMessage(tokenA, convId, 'Hello!');

    const dbMsg = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(dbMsg).not.toBeNull();
    // deliveredAt should be null since B has no live socket / presence key
    expect(dbMsg?.deliveredAt).toBeNull();
    expect(dbMsg?.readAt).toBeNull();
  });

  it('mark-read sets readAt on unread messages', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id);
    const tokenB = createTestToken(userB.id);

    const convId = await startConversation(tokenA, userB.id);
    const msg = await sendMessage(tokenA, convId, 'Hello!');

    // B marks as read
    const readRes = await request(app)
      .post(`/api/v1/conversations/${convId}/read`)
      .set(authHeader(tokenB));
    expect(readRes.status).toBe(200);

    const dbMsg = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(dbMsg?.readAt).not.toBeNull();
    // A read message is necessarily delivered — deliveredAt is backfilled too.
    expect(dbMsg?.deliveredAt).not.toBeNull();
  });
});

// ─── Message unsend ──────────────────────────────────────────────

describe('Message unsend', () => {
  it('Premium: can unsend before recipient reads', async () => {
    const userA = await createTestUser({ plan: 'premium' });
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id, 'premium',
      Math.floor(Date.now() / 1000) + 86400);

    const convId = await startConversation(tokenA, userB.id);
    const msg = await sendMessage(tokenA, convId, 'Oops wrong message');

    const unsend = await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msg.id}/unsend`)
      .set(authHeader(tokenA));
    expect(unsend.status).toBe(200);
    expect(unsend.body.isUnsent).toBe(true);

    const dbMsg = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(dbMsg?.isUnsent).toBe(true);
  });

  it('Premium: cannot unsend after recipient reads', async () => {
    const userA = await createTestUser({ plan: 'premium' });
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id, 'premium',
      Math.floor(Date.now() / 1000) + 86400);
    const tokenB = createTestToken(userB.id);

    const convId = await startConversation(tokenA, userB.id);
    const msg = await sendMessage(tokenA, convId, 'Message');

    await request(app)
      .post(`/api/v1/conversations/${convId}/read`)
      .set(authHeader(tokenB));

    const unsend = await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msg.id}/unsend`)
      .set(authHeader(tokenA));
    expect(unsend.status).toBe(403);
    expect(unsend.body.error).toBe('already_read');
  });

  it('Gold: can unsend after recipient reads', async () => {
    const userA = await createTestUser({ plan: 'gold' });
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id, 'gold',
      Math.floor(Date.now() / 1000) + 86400);
    const tokenB = createTestToken(userB.id);

    const convId = await startConversation(tokenA, userB.id);
    const msg = await sendMessage(tokenA, convId, 'Message');

    await request(app)
      .post(`/api/v1/conversations/${convId}/read`)
      .set(authHeader(tokenB));

    const unsend = await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msg.id}/unsend`)
      .set(authHeader(tokenA));
    expect(unsend.status).toBe(200);
    expect(unsend.body.isUnsent).toBe(true);
  });

  it('Free user cannot unsend at all', async () => {
    const userA = await createTestUser({ plan: 'free' });
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id, 'free');

    const convId = await startConversation(tokenA, userB.id);
    const msg = await sendMessage(tokenA, convId, 'Message');

    const unsend = await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msg.id}/unsend`)
      .set(authHeader(tokenA));
    expect(unsend.status).toBe(403);
  });

  it('non-sender cannot unsend', async () => {
    const userA = await createTestUser({ plan: 'gold' });
    const userB = await createTestUser({ plan: 'gold' });
    const tokenA = createTestToken(userA.id, 'gold',
      Math.floor(Date.now() / 1000) + 86400);
    const tokenB = createTestToken(userB.id, 'gold',
      Math.floor(Date.now() / 1000) + 86400);

    const convId = await startConversation(tokenA, userB.id);
    const msg = await sendMessage(tokenA, convId, 'A sent this');

    // B tries to unsend A's message
    const unsend = await request(app)
      .post(`/api/v1/conversations/${convId}/messages/${msg.id}/unsend`)
      .set(authHeader(tokenB));
    expect(unsend.status).toBe(403);
  });
});

// ─── Message edit ────────────────────────────────────────────────

describe('Message edit', () => {
  it('Gold: can edit within 5 minutes', async () => {
    const userA = await createTestUser({ plan: 'gold' });
    const tokenA = createTestToken(userA.id, 'gold',
      Math.floor(Date.now() / 1000) + 86400);
    const userB = await createTestUser();

    const convId = await startConversation(tokenA, userB.id);
    const msg = await sendMessage(tokenA, convId, 'Original');

    const edit = await request(app)
      .patch(`/api/v1/conversations/${convId}/messages/${msg.id}`)
      .set(authHeader(tokenA))
      .send({ content: 'Edited' });
    expect(edit.status).toBe(200);
    expect(edit.body.content).toBe('Edited');
    expect(edit.body.isEdited).toBe(true);
  });

  it('Gold: cannot edit after 5 minute window', async () => {
    const userA = await createTestUser({ plan: 'gold' });
    const tokenA = createTestToken(userA.id, 'gold',
      Math.floor(Date.now() / 1000) + 86400);
    const userB = await createTestUser();

    const convId = await startConversation(tokenA, userB.id);
    const msg = await sendMessage(tokenA, convId, 'Original');

    // Backdate createdAt by 6 minutes
    await prisma.message.update({
      where: { id: msg.id },
      data: { createdAt: new Date(Date.now() - 6 * 60 * 1000) },
    });

    const edit = await request(app)
      .patch(`/api/v1/conversations/${convId}/messages/${msg.id}`)
      .set(authHeader(tokenA))
      .send({ content: 'Too late' });
    expect(edit.status).toBe(403);
    expect(edit.body.error).toBe('edit_window_expired');
  });

  it('edit preserves originalContent in DB (not exposed to client)', async () => {
    const userA = await createTestUser({ plan: 'gold' });
    const tokenA = createTestToken(userA.id, 'gold',
      Math.floor(Date.now() / 1000) + 86400);
    const userB = await createTestUser();

    const convId = await startConversation(tokenA, userB.id);
    const msg = await sendMessage(tokenA, convId, 'Original text');

    const edit = await request(app)
      .patch(`/api/v1/conversations/${convId}/messages/${msg.id}`)
      .set(authHeader(tokenA))
      .send({ content: 'Edited text' });
    // The API response never carries originalContent
    expect(edit.body).not.toHaveProperty('originalContent');

    const dbMsg = await prisma.message.findUnique({ where: { id: msg.id } });
    expect(dbMsg?.originalContent).toBe('Original text');
    expect(dbMsg?.content).toBe('Edited text');
  });
});

// ─── Message templates (mounted at /conversations/templates) ──────

describe('Message templates', () => {
  it('Free user cannot create templates (limit=0)', async () => {
    const user = await createTestUser({ plan: 'free' });
    const token = createTestToken(user.id, 'free');

    const res = await request(app)
      .post(TEMPLATES_PATH)
      .set(authHeader(token))
      .send({ content: 'Hey there!' });
    // Service throws HttpError(403, 'plan_required') when the plan limit is 0.
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('plan_required');
  });

  it('Premium can create up to 5 templates', async () => {
    const user = await createTestUser({ plan: 'premium' });
    const token = createTestToken(user.id, 'premium',
      Math.floor(Date.now() / 1000) + 86400);

    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post(TEMPLATES_PATH)
        .set(authHeader(token))
        .send({ content: `Template ${i}` });
      expect(res.status).toBe(201);
    }

    // 6th template should fail
    const over = await request(app)
      .post(TEMPLATES_PATH)
      .set(authHeader(token))
      .send({ content: 'Template 6' });
    expect(over.status).toBe(403);
    expect(over.body.error).toBe('template_limit_reached');
  });

  it('Platinum can create up to 10 templates', async () => {
    const user = await createTestUser({ plan: 'platinum' });
    const token = createTestToken(user.id, 'platinum',
      Math.floor(Date.now() / 1000) + 86400);

    for (let i = 1; i <= 10; i++) {
      const res = await request(app)
        .post(TEMPLATES_PATH)
        .set(authHeader(token))
        .send({ content: `Template ${i}` });
      expect(res.status).toBe(201);
    }

    // 11th should fail
    const over = await request(app)
      .post(TEMPLATES_PATH)
      .set(authHeader(token))
      .send({ content: 'Template 11' });
    expect(over.status).toBe(403);
  });
});

// ─── Conversation management ─────────────────────────────────────

describe('Conversation management', () => {
  it('delete-thread soft-deletes for requesting user only', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id);
    const tokenB = createTestToken(userB.id);

    const convId = await startConversation(tokenA, userB.id);
    await sendMessage(tokenA, convId, 'Hi');

    // A deletes thread
    const del = await request(app)
      .delete(`/api/v1/conversations/${convId}`)
      .set(authHeader(tokenA));
    expect(del.status).toBe(204);

    // Thread disappears from A's inbox
    const aConvs = await request(app)
      .get('/api/v1/conversations')
      .set(authHeader(tokenA));
    const aIds = aConvs.body.conversations.map((c: any) => c.id);
    expect(aIds).not.toContain(convId);

    // But B still sees it
    const bConvs = await request(app)
      .get('/api/v1/conversations')
      .set(authHeader(tokenB));
    const bIds = bConvs.body.conversations.map((c: any) => c.id);
    expect(bIds).toContain(convId);
  });

  it('pin chat requires Gold+ plan', async () => {
    const freeUser = await createTestUser({ plan: 'free' });
    const userB = await createTestUser();
    const tokenFree = createTestToken(freeUser.id, 'free');

    const convId = await startConversation(tokenFree, userB.id);

    const pin = await request(app)
      .post(`/api/v1/conversations/${convId}/pin`)
      .set(authHeader(tokenFree));
    expect(pin.status).toBe(403);

    // Gold can pin
    const goldUser = await createTestUser({ plan: 'gold' });
    const tokenGold = createTestToken(goldUser.id, 'gold',
      Math.floor(Date.now() / 1000) + 86400);
    const convId2 = await startConversation(tokenGold, userB.id);

    const pin2 = await request(app)
      .post(`/api/v1/conversations/${convId2}/pin`)
      .set(authHeader(tokenGold));
    expect(pin2.status).toBe(200);
    expect(pin2.body.isPinned).toBe(true);
  });
});

// ─── Starred messages + disappearing messages (Phase 3/5) ────────

describe('Starred messages', () => {
  it('starred message can be added and retrieved', async () => {
    const userA = await createTestUser({ plan: 'gold' });
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id, 'gold', Math.floor(Date.now() / 1000) + 86400);

    const convId = await startConversation(tokenA, userB.id);
    const msg = await sendMessage(tokenA, convId, 'Important message');

    const star = await request(app)
      .post(`/api/v1/messages/${msg.id}/star`)
      .set(authHeader(tokenA))
      .send({ type: 'chat' });
    expect(star.status).toBe(201);

    const list = await request(app)
      .get('/api/v1/messages/starred')
      .set(authHeader(tokenA));
    expect(list.status).toBe(200);
    expect(list.body.starred.some((s: { messageId: string }) => s.messageId === msg.id)).toBe(true);

    // Unstar removes it.
    const unstar = await request(app)
      .delete(`/api/v1/messages/${msg.id}/star`)
      .set(authHeader(tokenA));
    expect(unstar.status).toBe(204);

    const list2 = await request(app)
      .get('/api/v1/messages/starred')
      .set(authHeader(tokenA));
    expect(list2.body.starred.some((s: { messageId: string }) => s.messageId === msg.id)).toBe(false);
  });
});

describe('Disappearing messages', () => {
  it('filters expired messages from the response', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const tokenA = createTestToken(userA.id);
    const tokenB = createTestToken(userB.id);

    const convId = await startConversation(tokenA, userB.id);

    // Enable 24h disappearing.
    const patch = await request(app)
      .patch(`/api/v1/conversations/${convId}`)
      .set(authHeader(tokenA))
      .send({ disappearingMessages: '24h' });
    expect(patch.status).toBe(200);

    // Create a message backdated 25 hours ago.
    const msg = await sendMessage(tokenA, convId, 'Old message');
    await prisma.message.update({
      where: { id: msg.id },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    const messages = await request(app)
      .get(`/api/v1/conversations/${convId}/messages`)
      .set(authHeader(tokenB));
    expect(messages.status).toBe(200);
    const ids = messages.body.messages.map((m: { id: string }) => m.id);
    expect(ids).not.toContain(msg.id);
  });
});
