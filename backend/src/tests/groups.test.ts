import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import {
  cleanDatabase, createTestUser, createTestToken, authHeader,
} from './helpers';
import { prisma } from '../config/prisma';

// ─────────────────────────────────────────────────────────────────
// GROUPS (Dating Rooms) TESTS
// Room creation, join/leave, messaging, admin permissions, and the
// invite-or-add flow.
// ─────────────────────────────────────────────────────────────────

const app = createApp();

beforeAll(async () => {
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

// Helper: create a room and return { user, token, roomId }
async function createRoom(plan = 'free', planExpiry?: number) {
  const user = await createTestUser({ plan: plan as never });
  const token = createTestToken(user.id, plan as never, planExpiry ?? null);
  const res = await request(app)
    .post('/api/rooms')
    .set(authHeader(token))
    .send({ name: 'Test Room', category: 'city_dating' });
  // createRoom responds { room }, but tolerate a flat shape too.
  const roomId = res.body.room?.id ?? res.body.id;
  expect(roomId).toBeTruthy();
  return { user, token, roomId };
}

// ─── Room creation ───────────────────────────────────────────────

describe('Room creation', () => {
  it('creates a room and makes creator an admin member', async () => {
    const { user, roomId } = await createRoom();

    const member = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: user.id } },
    });
    expect(member).not.toBeNull();
    expect(member?.role).toBe('admin');

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    expect(room?.creatorId).toBe(user.id);
    expect(room?.memberCount).toBe(1);
  });

  it('validates required fields (name and category)', async () => {
    const user = await createTestUser();
    const token = createTestToken(user.id);

    const noName = await request(app)
      .post('/api/rooms')
      .set(authHeader(token))
      .send({ category: 'city_dating' });
    expect(noName.status).toBe(422);

    const noCat = await request(app)
      .post('/api/rooms')
      .set(authHeader(token))
      .send({ name: 'Test' });
    expect(noCat.status).toBe(422);
  });

  it('name cannot exceed 100 characters', async () => {
    const user = await createTestUser();
    const token = createTestToken(user.id);

    const res = await request(app)
      .post('/api/rooms')
      .set(authHeader(token))
      .send({ name: 'A'.repeat(101), category: 'city_dating' });
    expect(res.status).toBe(422);
  });
});

// ─── Room join and leave ─────────────────────────────────────────

describe('Room join and leave', () => {
  it('joining increments memberCount', async () => {
    const { roomId } = await createRoom();
    const userB = await createTestUser();
    const tokenB = createTestToken(userB.id);

    const join = await request(app)
      .post(`/api/rooms/${roomId}/join`)
      .set(authHeader(tokenB));
    expect(join.status).toBe(200);

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    expect(room?.memberCount).toBe(2);
  });

  it('joining twice is idempotent (no error, no duplicate member)', async () => {
    const { roomId } = await createRoom();
    const userB = await createTestUser();
    const tokenB = createTestToken(userB.id);

    await request(app).post(`/api/rooms/${roomId}/join`).set(authHeader(tokenB));
    const second = await request(app)
      .post(`/api/rooms/${roomId}/join`)
      .set(authHeader(tokenB));
    expect([200, 201]).toContain(second.status);

    const count = await prisma.roomMember.count({ where: { roomId, userId: userB.id } });
    expect(count).toBe(1); // no duplicate
  });

  it('leaving decrements memberCount', async () => {
    const { roomId } = await createRoom();
    const userB = await createTestUser();
    const tokenB = createTestToken(userB.id);

    await request(app).post(`/api/rooms/${roomId}/join`).set(authHeader(tokenB));
    await request(app).delete(`/api/rooms/${roomId}/join`).set(authHeader(tokenB));

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    expect(room?.memberCount).toBe(1);

    const member = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: userB.id } },
    });
    expect(member).toBeNull();
  });
});

// ─── Room messaging ──────────────────────────────────────────────

describe('Room messaging', () => {
  it('member can send a message', async () => {
    const { token, roomId } = await createRoom();

    const msg = await request(app)
      .post(`/api/rooms/${roomId}/messages`)
      .set(authHeader(token))
      .send({ type: 'text', content: 'Hello room!' });
    expect(msg.status).toBe(201);
    expect(msg.body.content).toBe('Hello room!');
  });

  it('non-member cannot send a message (403)', async () => {
    const { roomId } = await createRoom();
    const outsider = await createTestUser();
    const outsiderToken = createTestToken(outsider.id);

    const msg = await request(app)
      .post(`/api/rooms/${roomId}/messages`)
      .set(authHeader(outsiderToken))
      .send({ type: 'text', content: 'Sneaky message' });
    expect(msg.status).toBe(403);
  });

  it('message reactions can be toggled (add and remove)', async () => {
    const { token, roomId } = await createRoom();

    const msg = await request(app)
      .post(`/api/rooms/${roomId}/messages`)
      .set(authHeader(token))
      .send({ type: 'text', content: 'React to this' });
    const msgId = msg.body.id;

    const add = await request(app)
      .post(`/api/rooms/${roomId}/messages/${msgId}/react`)
      .set(authHeader(token))
      .send({ emoji: '❤️' });
    expect(add.status).toBe(200);
    expect(add.body.added).toBe(true);
    expect(add.body.count).toBe(1);

    const remove = await request(app)
      .post(`/api/rooms/${roomId}/messages/${msgId}/react`)
      .set(authHeader(token))
      .send({ emoji: '❤️' });
    expect(remove.status).toBe(200);
    expect(remove.body.added).toBe(false);
    expect(remove.body.count).toBe(0);
  });

  it('paginated messages return newest first', async () => {
    const { token, roomId } = await createRoom();

    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post(`/api/rooms/${roomId}/messages`)
        .set(authHeader(token))
        .send({ type: 'text', content: `Message ${i}` });
    }

    const res = await request(app)
      .get(`/api/rooms/${roomId}/messages`)
      .set(authHeader(token))
      .query({ limit: 3 });
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBe(3);
    // Newest first
    expect(res.body.messages[0].content).toBe('Message 5');
  });

  it('free user cannot edit a room message (Gold+ only feature)', async () => {
    const { token, roomId } = await createRoom('free');

    const msg = await request(app)
      .post(`/api/rooms/${roomId}/messages`)
      .set(authHeader(token))
      .send({ type: 'text', content: 'original' });
    const msgId = msg.body.id;

    const editRes = await request(app)
      .patch(`/api/rooms/${roomId}/messages/${msgId}`)
      .set(authHeader(token))
      .send({ content: 'nope' });

    expect(editRes.status).toBe(403);
    expect(editRes.body.error).toBe('plan_required');
  });

  it('Gold member can edit their own room message within the edit window', async () => {
    const { token, roomId } = await createRoom('gold', Math.floor(Date.now() / 1000) + 86400);

    const msg = await request(app)
      .post(`/api/rooms/${roomId}/messages`)
      .set(authHeader(token))
      .send({ type: 'text', content: 'original' });
    const msgId = msg.body.id;

    const editRes = await request(app)
      .patch(`/api/rooms/${roomId}/messages/${msgId}`)
      .set(authHeader(token))
      .send({ content: 'edited' });

    expect(editRes.status).toBe(200);
    expect(editRes.body.content).toBe('edited');
  });
});

// ─── Admin permissions ───────────────────────────────────────────

describe('Admin permissions', () => {
  it('admin can remove a member', async () => {
    const { token: creatorToken, roomId } = await createRoom();
    const member = await createTestUser();
    const memberToken = createTestToken(member.id);

    await request(app).post(`/api/rooms/${roomId}/join`).set(authHeader(memberToken));

    const remove = await request(app)
      .delete(`/api/rooms/${roomId}/members/${member.id}`)
      .set(authHeader(creatorToken));
    expect(remove.status).toBe(204);

    const row = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: member.id } },
    });
    expect(row).toBeNull();
  });

  it('regular member cannot remove another member', async () => {
    const { roomId } = await createRoom();
    const memberA = await createTestUser();
    const memberB = await createTestUser();
    const tokenA = createTestToken(memberA.id);
    const tokenB = createTestToken(memberB.id);

    await request(app).post(`/api/rooms/${roomId}/join`).set(authHeader(tokenA));
    await request(app).post(`/api/rooms/${roomId}/join`).set(authHeader(tokenB));

    const remove = await request(app)
      .delete(`/api/rooms/${roomId}/members/${memberB.id}`)
      .set(authHeader(tokenA));
    expect(remove.status).toBe(403);
  });

  it('admin can pin a message', async () => {
    const { token, roomId } = await createRoom();

    const msg = await request(app)
      .post(`/api/rooms/${roomId}/messages`)
      .set(authHeader(token))
      .send({ type: 'text', content: 'Important announcement' });

    const pin = await request(app)
      .post(`/api/rooms/${roomId}/messages/${msg.body.id}/pin`)
      .set(authHeader(token))
      .send({ pin: true });
    expect(pin.status).toBe(200);

    const dbMsg = await prisma.roomMessage.findUnique({
      where: { id: msg.body.id },
    });
    expect(dbMsg?.isPinned).toBe(true);
  });

  it('non-admin cannot pin a message', async () => {
    const { roomId } = await createRoom();
    const member = await createTestUser();
    const memberToken = createTestToken(member.id);

    await request(app).post(`/api/rooms/${roomId}/join`).set(authHeader(memberToken));

    const msg = await request(app)
      .post(`/api/rooms/${roomId}/messages`)
      .set(authHeader(memberToken))
      .send({ type: 'text', content: 'Try to pin this' });

    const pin = await request(app)
      .post(`/api/rooms/${roomId}/messages/${msg.body.id}/pin`)
      .set(authHeader(memberToken))
      .send({ pin: true });
    expect(pin.status).toBe(403);
  });
});

// ─── Group invite system ─────────────────────────────────────────

describe('Group invite system', () => {
  it('cannot directly add user with groupsAvailable=false and no prior conversation', async () => {
    const { token: creatorToken, roomId } = await createRoom();
    const target = await createTestUser();

    await prisma.user.update({
      where: { id: target.id },
      data: { groupsAvailable: false },
    });

    const add = await request(app)
      .post(`/api/rooms/${roomId}/invite-or-add/${target.id}`)
      .set(authHeader(creatorToken));
    expect(add.status).toBe(403);
    expect(add.body.error).toBe('cannot_add_user');
  });

  it('can directly add user with groupsAvailable=true', async () => {
    const { token: creatorToken, roomId } = await createRoom();
    const target = await createTestUser();

    await prisma.user.update({
      where: { id: target.id },
      data: { groupsAvailable: true },
    });

    const add = await request(app)
      .post(`/api/rooms/${roomId}/invite-or-add/${target.id}`)
      .set(authHeader(creatorToken));
    expect([200, 201]).toContain(add.status);
    expect(add.body.method).toBe('direct');
  });

  it('sends invite when groupsAvailable=false but prior conversation exists', async () => {
    const creator = await createTestUser();
    const target = await createTestUser();
    const creatorToken = createTestToken(creator.id);

    // Create prior conversation
    await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(creatorToken))
      .send({ userId: target.id });

    // Create room
    const roomRes = await request(app)
      .post('/api/rooms')
      .set(authHeader(creatorToken))
      .send({ name: 'My Room', category: 'city_dating' });
    const roomId = roomRes.body.room?.id ?? roomRes.body.id;

    await prisma.user.update({
      where: { id: target.id },
      data: { groupsAvailable: false },
    });

    const add = await request(app)
      .post(`/api/rooms/${roomId}/invite-or-add/${target.id}`)
      .set(authHeader(creatorToken));
    expect([200, 201]).toContain(add.status);
    expect(add.body.method).toBe('invite_sent');

    const targetToken = createTestToken(target.id);
    const invites = await request(app)
      .get('/api/rooms/invites')
      .set(authHeader(targetToken));
    expect(invites.body.invites.length).toBe(1);
    expect(invites.body.invites[0].room.id).toBe(roomId);
  });

  it('accepting an invite joins the room', async () => {
    const creator = await createTestUser();
    const target = await createTestUser();
    const creatorToken = createTestToken(creator.id);
    const targetToken = createTestToken(target.id);

    await request(app)
      .post('/api/v1/conversations/start')
      .set(authHeader(creatorToken))
      .send({ userId: target.id });

    const roomRes = await request(app)
      .post('/api/rooms')
      .set(authHeader(creatorToken))
      .send({ name: 'Room', category: 'city_dating' });
    const roomId = roomRes.body.room?.id ?? roomRes.body.id;

    await prisma.user.update({
      where: { id: target.id },
      data: { groupsAvailable: false },
    });

    await request(app)
      .post(`/api/rooms/${roomId}/invite-or-add/${target.id}`)
      .set(authHeader(creatorToken));

    const invites = await request(app)
      .get('/api/rooms/invites')
      .set(authHeader(targetToken));
    const inviteId = invites.body.invites[0].id;

    const accept = await request(app)
      .post(`/api/rooms/invites/${inviteId}/accept`)
      .set(authHeader(targetToken));
    expect(accept.status).toBe(200);

    const member = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: target.id } },
    });
    expect(member).not.toBeNull();

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    expect(room?.memberCount).toBe(2);
  });
});
