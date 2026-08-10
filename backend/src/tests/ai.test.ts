import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { cleanDatabase, createTestUser, createTestToken, authHeader } from './helpers';
import { prisma } from '../config/prisma';

// ─────────────────────────────────────────────────────────────────
// AI FEATURES — Gemini-backed endpoints (icebreakers, reply suggestions,
// compatibility, daily top 10, profile optimizer). global.fetch is mocked
// per-test to stand in for the Gemini API; DB/Redis are real (test env).
// ─────────────────────────────────────────────────────────────────

const app = createApp();
const ORIGINAL_FETCH = global.fetch;

beforeAll(async () => {
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function mockGeminiSuccess(jsonText: string) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: jsonText }] } }] }),
  } as Response)) as unknown as typeof fetch;
}

function mockGeminiFailure(status = 500) {
  global.fetch = vi.fn(async () => ({ ok: false, status, json: async () => ({}) } as Response)) as unknown as typeof fetch;
}

async function createPlatinumUser(optInFeature: string) {
  const user = await createTestUser({ plan: 'platinum' });
  await prisma.user.update({
    where: { id: user.id },
    data: { aiOptInFeatures: { [optInFeature]: true } },
  });
  const token = createTestToken(user.id, 'platinum');
  return { user, token };
}

async function startConversation(tokenA: string, userBId: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/conversations/start')
    .set(authHeader(tokenA))
    .send({ userId: userBId });
  expect([200, 201]).toContain(res.status);
  return res.body.id as string;
}

describe('GET /api/v1/ai/icebreakers', () => {
  it('returns Gemini-generated suggestions, calling Gemini (not Anthropic)', async () => {
    const { token } = await createPlatinumUser('icebreakers');
    const other = await createTestUser({ firstName: 'Riya' });
    const convId = await startConversation(token, other.id);

    mockGeminiSuccess(JSON.stringify({ suggestions: ['Hi Riya!', 'Loved your bio', 'What do you enjoy most?'] }));

    const res = await request(app)
      .get(`/api/v1/ai/icebreakers?conversationId=${convId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestions: ['Hi Riya!', 'Loved your bio', 'What do you enjoy most?'], count: 3 });

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('generativelanguage.googleapis.com');
    expect(calledUrl).not.toContain('anthropic.com');
  });

  it('falls back to the hardcoded icebreakers when Gemini fails', async () => {
    const { token } = await createPlatinumUser('icebreakers');
    const other = await createTestUser({ firstName: 'Riya' });
    const convId = await startConversation(token, other.id);

    mockGeminiFailure(500);

    const res = await request(app)
      .get(`/api/v1/ai/icebreakers?conversationId=${convId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.suggestions).toEqual([
      "Hey, I'd love to hear more about you!",
      'Your profile caught my eye — what do you enjoy doing on weekends?',
      'Hi there! What are you passionate about these days?',
    ]);
  });

  it('falls back to the hardcoded icebreakers when Gemini returns fewer than 3 suggestions', async () => {
    const { token } = await createPlatinumUser('icebreakers');
    const other = await createTestUser({ firstName: 'Riya' });
    const convId = await startConversation(token, other.id);

    mockGeminiSuccess(JSON.stringify({ suggestions: ['only one'] }));

    const res = await request(app)
      .get(`/api/v1/ai/icebreakers?conversationId=${convId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.suggestions).toEqual([
      "Hey, I'd love to hear more about you!",
      'Your profile caught my eye — what do you enjoy doing on weekends?',
      'Hi there! What are you passionate about these days?',
    ]);
  });

  it('403s when the user has not opted in to the icebreakers AI feature', async () => {
    const user = await createTestUser({ plan: 'platinum' });
    const other = await createTestUser();
    const token = createTestToken(user.id, 'platinum');
    const convId = await startConversation(token, other.id);

    const res = await request(app)
      .get(`/api/v1/ai/icebreakers?conversationId=${convId}`)
      .set(authHeader(token));

    expect(res.status).toBe(403);
  });

  it('403s for a non-platinum plan even with opt-in set', async () => {
    const user = await createTestUser({ plan: 'free' });
    await prisma.user.update({ where: { id: user.id }, data: { aiOptInFeatures: { icebreakers: true } } });
    const other = await createTestUser();
    const token = createTestToken(user.id, 'free');
    const convId = await startConversation(token, other.id);

    const res = await request(app)
      .get(`/api/v1/ai/icebreakers?conversationId=${convId}`)
      .set(authHeader(token));

    expect(res.status).toBe(403);
  });
});
