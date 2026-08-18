# Claude → Gemini AI Features Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Claude/Anthropic with Gemini for 5 user-facing AI features (Icebreakers, Reply Suggestions, Compatibility explanation, Daily Top 10 "why" labels, Profile Optimizer) in `backend/src/modules/ai/ai.controller.ts`, behind a new shared Gemini client, with zero behavior change to gating, fallbacks, caching, or response shapes.

**Architecture:** Extract a generalized `callGeminiJson<T>()` helper into `backend/src/adapters/geminiClient.ts`, modeled on the existing working `backend/src/adapters/translation.ts` Gemini adapter (same model, timeout, fetch/AbortController pattern) but parameterized over prompt/schema/validator so all 5 features share one client instead of duplicating fetch logic. Each `ai.controller.ts` endpoint keeps its exact existing try/catch-and-fallback structure — only the inner "call the LLM and get raw text" step changes from `callClaude()+safeParseJson()` to `callGeminiJson()`, which throws on any failure (network, timeout, non-2xx, empty text, malformed JSON, or schema-invalid shape) so the existing catch blocks keep working unmodified.

**Tech Stack:** TypeScript, Express, Prisma, Vitest + supertest (integration tests hit a real local test DB/Redis per `src/tests/setup.ts`), native `fetch` + `AbortController` (no HTTP client library), Gemini `generateContent` REST API with `responseMimeType: 'application/json'` + `responseSchema`.

## Global Constraints

- Model: `gemini-2.5-flash` only — no `-latest`/`-preview` aliases (per `translation.ts:26` comment on `gemini-2.0-flash` being retired).
- Env var: `GEMINI_API_KEY` only (already in `backend/src/config/env.ts:120-126` as `env.gemini.apiKey`). Do NOT add `EXPO_PUBLIC_GEMINI_API_KEY` or expose the key to the frontend.
- Do NOT touch `backend/src/adapters/moderation.ts` (Claude Haiku moderation — migrated separately later).
- Do NOT remove `ANTHROPIC_API_KEY`, `env.anthropic`, or any Anthropic documentation yet.
- Do NOT change: `requireAiFeature` gating, `requirePlan('platinum')` route middleware, `compatibilityScore` (deterministic scoring), Redis Top-10 caching (`RedisKeys.aiTop10`, 24h TTL), any response JSON shape, any frontend code, Prisma schema.
- Each endpoint's existing fallback value/behavior must be preserved exactly (see per-task "Existing fallback" notes below).
- No markdown-fence JSON parsing for the new Gemini paths — use `responseMimeType: 'application/json'` + `responseSchema` (Gemini's native structured output), and validate the parsed shape before returning it to the caller.
- Test runner: Vitest (`npm test` → `dotenv -e .env.test -- vitest run`), integration tests follow the `messaging.test.ts` pattern (`createApp()` + `supertest` + `createTestUser`/`createTestToken`/`cleanDatabase` from `src/tests/helpers.ts`), NOT Prisma mocks.
- Do not introduce new user-visible errors — a Gemini failure must degrade to the same fallback a Claude failure used to produce.

---

## File Structure

- **Create** `backend/src/adapters/geminiClient.ts` — shared Gemini call helper (`callGeminiJson`), generalized from `translation.ts`. Exports a `GeminiRequestError` class and the `callGeminiJson<T>()` function.
- **Create** `backend/src/tests/geminiClient.test.ts` — unit tests for the shared client (fetch-mocked, no DB), mirroring `translation.test.ts`.
- **Modify** `backend/src/modules/ai/ai.controller.ts` — replace `callClaudeRaw`/`callClaude`/`AI_MODEL`/`safeParseJson` Claude plumbing with per-endpoint Gemini schema + validator, one endpoint at a time.
- **Create** `backend/src/tests/ai.test.ts` — new integration test file for all 5 endpoints (no existing AI controller tests exist today), following `messaging.test.ts`'s `createApp()` + `supertest` + `cleanDatabase` pattern, with `global.fetch` mocked per-test to stand in for Gemini.

---

## Task 1: Shared Gemini client (`geminiClient.ts`)

**Files:**
- Create: `backend/src/adapters/geminiClient.ts`
- Test: `backend/src/tests/geminiClient.test.ts`

**Interfaces:**
- Produces (used by every later task):
  ```ts
  export class GeminiRequestError extends Error {}

  export async function callGeminiJson<T>(
    systemPrompt: string,
    userPrompt: string,
    responseSchema: object,
    validate: (value: unknown) => value is T,
  ): Promise<T>
  ```
  Throws `GeminiRequestError` for: missing API key, timeout, network failure, non-2xx response, empty response text, malformed JSON, or `validate(parsed)` returning `false`. Resolves with the validated, typed value only when everything succeeds.

- [ ] **Step 1: Write the failing unit test**

Create `backend/src/tests/geminiClient.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';

const ORIGINAL_GEMINI_KEY = process.env.GEMINI_API_KEY;
const ORIGINAL_FETCH = global.fetch;

async function loadClient() {
  vi.resetModules();
  return import('../adapters/geminiClient');
}

interface Suggestions { suggestions: string[] }
const isSuggestions = (v: unknown): v is Suggestions =>
  !!v && typeof v === 'object' && Array.isArray((v as Suggestions).suggestions) &&
  (v as Suggestions).suggestions.every((s) => typeof s === 'string');

const SCHEMA = {
  type: 'OBJECT',
  properties: { suggestions: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['suggestions'],
};

describe('geminiClient — callGeminiJson', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_GEMINI_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_KEY;
    vi.restoreAllMocks();
  });

  it('calls the Gemini API (not Anthropic) with the correct model and responseSchema', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ suggestions: ['a', 'b', 'c'] }) }] } }],
      }),
    } as Response));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { callGeminiJson } = await loadClient();
    const result = await callGeminiJson('sys', 'user', SCHEMA, isSuggestions);

    expect(result).toEqual({ suggestions: ['a', 'b', 'c'] });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('generativelanguage.googleapis.com');
    expect(calledUrl).toContain('gemini-2.5-flash');
    expect(calledUrl).not.toContain('anthropic.com');

    const calledOpts = fetchMock.mock.calls[0][1] as RequestInit;
    expect((calledOpts.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini-key');
    const body = JSON.parse(calledOpts.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toEqual(SCHEMA);
  });

  it('throws GeminiRequestError on a non-2xx response (caller falls back)', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as Response)) as unknown as typeof fetch;

    const { callGeminiJson, GeminiRequestError } = await loadClient();
    await expect(callGeminiJson('sys', 'user', SCHEMA, isSuggestions)).rejects.toThrow(GeminiRequestError);
    await expect(callGeminiJson('sys', 'user', SCHEMA, isSuggestions)).rejects.toThrow(/Gemini API returned 500/);
  });

  it('throws when GEMINI_API_KEY is missing, without calling fetch', async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { callGeminiJson } = await loadClient();
    await expect(callGeminiJson('sys', 'user', SCHEMA, isSuggestions)).rejects.toThrow(/GEMINI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when Gemini returns JSON that fails the validator (malformed structured output)', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ suggestions: [1, 2, 3] }) }] } }],
      }),
    } as Response)) as unknown as typeof fetch;

    const { callGeminiJson } = await loadClient();
    await expect(callGeminiJson('sys', 'user', SCHEMA, isSuggestions)).rejects.toThrow(/failed schema validation/);
  });

  it('throws when the response text is not valid JSON', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
    } as Response)) as unknown as typeof fetch;

    const { callGeminiJson } = await loadClient();
    await expect(callGeminiJson('sys', 'user', SCHEMA, isSuggestions)).rejects.toThrow(/malformed JSON/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/geminiClient.test.ts`
Expected: FAIL — `Cannot find module '../adapters/geminiClient'`.

- [ ] **Step 3: Implement `backend/src/adapters/geminiClient.ts`**

```ts
/**
 * Shared Gemini API client for all AI features (icebreakers, reply
 * suggestions, compatibility explanations, daily-top-10 "why" labels,
 * profile optimizer). Generalizes the fetch/timeout/structured-output
 * pattern already proven in `translation.ts` so no feature duplicates
 * fetch/API-key/error-handling logic.
 */
import { env } from '../config/env';

// `gemini-2.0-flash` was retired by Google (404s). Stay pinned to the
// current stable `gemini-2.5-flash` — no `-latest`/`-preview` aliases.
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 10_000;
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export class GeminiRequestError extends Error {}

/**
 * Calls Gemini with a JSON Schema (`responseSchema`) for native structured
 * output, parses and validates the result, and returns it typed as `T`.
 * Throws `GeminiRequestError` on any failure — callers are expected to
 * catch this and apply their feature-specific fallback, exactly as they
 * previously caught failures from the Claude call.
 */
export async function callGeminiJson<T>(
  systemPrompt: string,
  userPrompt: string,
  responseSchema: object,
  validate: (value: unknown) => value is T,
): Promise<T> {
  const apiKey = env.gemini.apiKey;
  if (!apiKey) {
    throw new GeminiRequestError('GEMINI_API_KEY is not set');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GeminiRequestError('Gemini request timed out');
    }
    throw new GeminiRequestError(`Gemini request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    let detail = '';
    try {
      const body = (await resp.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      /* non-JSON error body — status alone has to do */
    }
    throw new GeminiRequestError(`Gemini API returned ${resp.status}${detail ? ` — ${detail}` : ''}`);
  }

  const data = (await resp.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new GeminiRequestError('Gemini returned an empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiRequestError('Gemini returned malformed JSON');
  }

  if (!validate(parsed)) {
    throw new GeminiRequestError('Gemini returned data that failed schema validation');
  }

  return parsed;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/geminiClient.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/adapters/geminiClient.ts backend/src/tests/geminiClient.test.ts
git commit -m "feat: add shared Gemini client for AI feature migration"
```

---

## Task 2: Migrate Icebreakers to Gemini

**Files:**
- Modify: `backend/src/modules/ai/ai.controller.ts:107-149` (function `getIcebreakers`), plus its shared imports at the top of the file.
- Test: `backend/src/tests/ai.test.ts` (create this file now with the first `describe` block; later tasks append to it)

**Interfaces:**
- Consumes: `callGeminiJson<T>(systemPrompt, userPrompt, responseSchema, validate)` from Task 1 (`backend/src/adapters/geminiClient.ts`).
- Produces: no new exports; `getIcebreakers` keeps its existing signature `(req: Request, res: Response) => Promise<void>` and response shape `{ suggestions: string[], count: 3 }`.

**Existing fallback (must be preserved exactly):** on any failure, or if the parsed array has fewer than 3 items, respond with `FALLBACK_ICEBREAKERS` (the same 3 hardcoded strings at `ai.controller.ts:32-36`) and still `count: 3`.

- [ ] **Step 1: Write the failing integration test**

Create `backend/src/tests/ai.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/ai.test.ts`
Expected: FAIL — still calling `api.anthropic.com`, so the "not.toContain('anthropic.com')" and Gemini-mock assertions fail (fetch mock never gets hit because `callClaude` is what's actually invoked).

- [ ] **Step 3: Migrate `getIcebreakers`**

In `backend/src/modules/ai/ai.controller.ts`, add the import at the top (near the existing imports):

```ts
import { callGeminiJson } from '../../adapters/geminiClient';
```

Replace lines 107-149 (`getIcebreakers`) with:

```ts
interface IcebreakersResult { suggestions: string[] }
const ICEBREAKERS_SCHEMA = {
  type: 'OBJECT',
  properties: { suggestions: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['suggestions'],
};
const isIcebreakersResult = (v: unknown): v is IcebreakersResult =>
  !!v && typeof v === 'object' && Array.isArray((v as IcebreakersResult).suggestions) &&
  (v as IcebreakersResult).suggestions.every((s) => typeof s === 'string');

export async function getIcebreakers(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  await requireAiFeature(userId, 'icebreakers');

  const { conversationId } = req.query as { conversationId?: string };
  if (!conversationId) throw Errors.badRequest('conversationId is required');

  const convo = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  });
  if (!convo) throw Errors.notFound('Conversation not found');

  const targetId = convo.userAId === userId ? convo.userBId : convo.userAId;
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { firstName: true, age: true, bio: true, interests: true, lookingFor: true, whereAreYouFrom: true, fantasyTags: true },
  });
  if (!target) throw Errors.notFound('User not found');

  const system = `You are a dating app assistant helping users start conversations.
Generate 3 short, personalized, genuine opening messages based on the profile provided.
Each should be under 120 characters. Be warm, specific, not generic.
Never be explicit or suggestive. Respond ONLY with a JSON array of 3 strings.`;

  const user = `Profile: Name: ${target.firstName ?? 'Unknown'}, Age: ${target.age ?? 'unknown'}, Bio: ${target.bio ?? ''}, Interests: ${(target.interests ?? []).join(', ')}, Looking for: ${(target.lookingFor ?? []).join(', ')}, From: ${target.whereAreYouFrom ?? ''}, Tags: ${(target.fantasyTags ?? []).join(', ')}`;

  let suggestions: string[];
  try {
    const parsed = await callGeminiJson(system, user, ICEBREAKERS_SCHEMA, isIcebreakersResult);
    suggestions = parsed.suggestions.length >= 3 ? parsed.suggestions.slice(0, 3) : FALLBACK_ICEBREAKERS;
  } catch (err) {
    console.error('[ai] icebreakers Gemini call failed', err);
    suggestions = FALLBACK_ICEBREAKERS;
  }

  res.status(200).json({ suggestions, count: 3 });
}
```

Leave `callClaudeRaw`, `callClaude`, `AI_MODEL`, `safeParseJson`, and `FALLBACK_ICEBREAKERS` in place for now — the remaining 4 endpoints (Tasks 3-6) still use them. They are removed in Task 7 once every endpoint has migrated.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/ai.test.ts`
Expected: PASS (all 4 tests in the `icebreakers` describe block).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ai/ai.controller.ts backend/src/tests/ai.test.ts
git commit -m "feat: migrate AI icebreakers endpoint from Claude to Gemini"
```

---

## Task 3: Migrate Reply Suggestions to Gemini

**Files:**
- Modify: `backend/src/modules/ai/ai.controller.ts:153-189` (function `getReplySuggestions`)
- Test: `backend/src/tests/ai.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `callGeminiJson` from Task 1 (same as Task 2).
- Produces: `getReplySuggestions` keeps signature and response shape `{ suggestions: string[] }`.

**Existing fallback (preserve exactly):** on any failure, respond with `['Sounds great!', 'Tell me more!', 'Interesting! What else?']`.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/tests/ai.test.ts`:

```ts
describe('GET /api/v1/ai/reply-suggestions', () => {
  it('returns Gemini-generated reply suggestions', async () => {
    const { token } = await createPlatinumUser('replySuggestions');
    const other = await createTestUser();
    const convId = await startConversation(token, other.id);
    await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set(authHeader(token))
      .send({ type: 'text', content: 'Hey, how was your day?' });

    mockGeminiSuccess(JSON.stringify({ suggestions: ['It was great, thanks!', 'Pretty busy, honestly', 'Tell me about yours!'] }));

    const res = await request(app)
      .get(`/api/v1/ai/reply-suggestions?conversationId=${convId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestions: ['It was great, thanks!', 'Pretty busy, honestly', 'Tell me about yours!'] });
  });

  it('falls back to the hardcoded replies when Gemini fails', async () => {
    const { token } = await createPlatinumUser('replySuggestions');
    const other = await createTestUser();
    const convId = await startConversation(token, other.id);
    await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set(authHeader(token))
      .send({ type: 'text', content: 'Hey!' });

    mockGeminiFailure(500);

    const res = await request(app)
      .get(`/api/v1/ai/reply-suggestions?conversationId=${convId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestions: ['Sounds great!', 'Tell me more!', 'Interesting! What else?'] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/ai.test.ts`
Expected: FAIL — `getReplySuggestions` still calls Claude, so the mocked Gemini fetch is never hit and the happy-path assertion fails.

- [ ] **Step 3: Migrate `getReplySuggestions`**

Replace lines 153-189 in `ai.controller.ts` with:

```ts
interface ReplySuggestionsResult { suggestions: string[] }
const REPLY_SUGGESTIONS_SCHEMA = {
  type: 'OBJECT',
  properties: { suggestions: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['suggestions'],
};
const isReplySuggestionsResult = (v: unknown): v is ReplySuggestionsResult =>
  !!v && typeof v === 'object' && Array.isArray((v as ReplySuggestionsResult).suggestions) &&
  (v as ReplySuggestionsResult).suggestions.every((s) => typeof s === 'string');

export async function getReplySuggestions(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  await requireAiFeature(userId, 'replySuggestions');

  const { conversationId } = req.query as { conversationId?: string };
  if (!conversationId) throw Errors.badRequest('conversationId is required');

  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, OR: [{ userAId: userId }, { userBId: userId }] },
    select: { id: true, userAId: true, userBId: true },
  });
  if (!convo) throw Errors.notFound('Conversation not found');

  const messages = await prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { senderId: true, content: true },
  });
  messages.reverse();

  const system = `You are a dating app assistant. Suggest 3 natural reply options for the user.
Keep each under 100 characters. Match the tone of the conversation.
Never be explicit. Respond ONLY with a JSON array of 3 strings.`;

  const userMsg = `Conversation (newest last):\n${messages.map((m) => `${m.senderId === userId ? 'Me' : 'Them'}: ${m.content}`).join('\n')}`;

  let suggestions: string[];
  try {
    const parsed = await callGeminiJson(system, userMsg, REPLY_SUGGESTIONS_SCHEMA, isReplySuggestionsResult);
    suggestions = parsed.suggestions;
  } catch (err) {
    console.error('[ai] reply-suggestions Gemini call failed', err);
    suggestions = ['Sounds great!', 'Tell me more!', 'Interesting! What else?'];
  }

  res.status(200).json({ suggestions });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/ai.test.ts`
Expected: PASS (icebreakers block + reply-suggestions block, 6 tests total).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ai/ai.controller.ts backend/src/tests/ai.test.ts
git commit -m "feat: migrate AI reply suggestions endpoint from Claude to Gemini"
```

---

## Task 4: Migrate Compatibility explanation to Gemini

**Files:**
- Modify: `backend/src/modules/ai/ai.controller.ts:193-237` (function `getCompatibility`)
- Test: `backend/src/tests/ai.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `callGeminiJson` from Task 1; `compatibilityScore` (unchanged, `ai.controller.ts:92-103`).
- Produces: `getCompatibility` keeps signature and response shape `{ score: number, breakdown: string[] }`. **The deterministic `score` must be computed exactly as before — do not touch `compatibilityScore` or the profile-mapping logic.**

**Existing fallback (preserve exactly):** on any failure, `breakdown = []`; `score` is always present regardless of Gemini outcome.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/tests/ai.test.ts`:

```ts
describe('GET /api/v1/ai/compatibility/:userId', () => {
  it('returns the deterministic score plus a Gemini-generated breakdown', async () => {
    const { user, token } = await createPlatinumUser('compatibility');
    const other = await createTestUser();

    mockGeminiSuccess(JSON.stringify({ breakdown: ['You both value honesty', 'Shared interest in hiking'] }));

    const res = await request(app)
      .get(`/api/v1/ai/compatibility/${other.id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(typeof res.body.score).toBe('number');
    expect(res.body.breakdown).toEqual(['You both value honesty', 'Shared interest in hiking']);
  });

  it('keeps the deterministic score but returns an empty breakdown when Gemini fails', async () => {
    const { token } = await createPlatinumUser('compatibility');
    const other = await createTestUser();

    mockGeminiFailure(500);

    const res = await request(app)
      .get(`/api/v1/ai/compatibility/${other.id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(typeof res.body.score).toBe('number');
    expect(res.body.breakdown).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/ai.test.ts`
Expected: FAIL on the happy-path breakdown assertion (still calling Claude).

- [ ] **Step 3: Migrate `getCompatibility`**

Replace lines 193-237 in `ai.controller.ts` with (the `compatibilityScore`/`toProfile`/`UserProfile` code above it, lines 76-103, stays untouched):

```ts
interface CompatibilityBreakdownResult { breakdown: string[] }
const COMPATIBILITY_SCHEMA = {
  type: 'OBJECT',
  properties: { breakdown: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['breakdown'],
};
const isCompatibilityBreakdownResult = (v: unknown): v is CompatibilityBreakdownResult =>
  !!v && typeof v === 'object' && Array.isArray((v as CompatibilityBreakdownResult).breakdown) &&
  (v as CompatibilityBreakdownResult).breakdown.every((s) => typeof s === 'string');

export async function getCompatibility(req: Request, res: Response): Promise<void> {
  const myId = req.user!.sub;
  const { userId: theirId } = req.params;
  await requireAiFeature(myId, 'compatibility');

  const profileSelect = {
    id: true, firstName: true, age: true, bio: true,
    lookingFor: true, datingIntentions: true, interests: true, tribes: true,
    relationshipStatus: true, whereWeCanMeet: true,
  } as const;

  const [me, them] = await Promise.all([
    prisma.user.findUnique({ where: { id: myId }, select: profileSelect }),
    prisma.user.findUnique({ where: { id: theirId }, select: profileSelect }),
  ]);
  if (!me || !them) throw Errors.notFound('User not found');

  const toProfile = (u: typeof me): UserProfile => ({
    lookingFor: (u.lookingFor ?? []) as string[],
    datingIntentions: (u.datingIntentions ?? []) as string[],
    interests: u.interests ?? [],
    tribes: u.tribes ?? [],
    relationshipStatus: u.relationshipStatus ?? null,
    whereWeCanMeet: (u.whereWeCanMeet ?? []) as string[],
  });

  const score = compatibilityScore(toProfile(me), toProfile(them));

  const system = `You are a compatibility analyst. Given two dating profiles, explain their compatibility in 2-3 short bullet points.
Focus on shared interests, intent alignment, and lifestyle.
Never mention race, religion, orientation, or physical appearance beyond what they stated.
Respond ONLY with a JSON array of 2-3 strings (the bullet points).`;

  const userMsg = `Profile A: Name ${me.firstName ?? 'A'}, Bio: ${me.bio ?? ''}, Interests: ${me.interests?.join(', ')}, Looking for: ${(me.lookingFor ?? []).join(', ')}. Profile B: Name ${them.firstName ?? 'B'}, Bio: ${them.bio ?? ''}, Interests: ${them.interests?.join(', ')}, Looking for: ${(them.lookingFor ?? []).join(', ')}. Score: ${score}/100`;

  let breakdown: string[];
  try {
    const parsed = await callGeminiJson(system, userMsg, COMPATIBILITY_SCHEMA, isCompatibilityBreakdownResult);
    breakdown = parsed.breakdown;
  } catch (err) {
    console.error('[ai] compatibility Gemini call failed', err);
    breakdown = [];
  }

  res.status(200).json({ score, breakdown });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/ai.test.ts`
Expected: PASS (icebreakers + reply-suggestions + compatibility blocks, 8 tests total).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ai/ai.controller.ts backend/src/tests/ai.test.ts
git commit -m "feat: migrate AI compatibility breakdown endpoint from Claude to Gemini"
```

---

## Task 5: Migrate Daily Top 10 "why" labels to Gemini

**Files:**
- Modify: `backend/src/modules/ai/ai.controller.ts:241-341` (function `getDailyTop10`, only the "why" label generation block at lines 312-323)
- Test: `backend/src/tests/ai.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `callGeminiJson` from Task 1.
- Produces: `getDailyTop10` keeps signature and response shape `{ profiles: [...], refreshesAt }` exactly as before. **Do not touch: Redis cache read/write (`RedisKeys.aiTop10`, `TOP10_TTL`), the candidate query, `compatibilityScore` ranking, or the top-10 slice.** Only the per-candidate "why" label call for the top 3 changes provider.

**Existing fallback (preserve exactly):** each of the top-3 candidates gets its own independent try/catch (`Promise.all` over `top3.map`) — if that candidate's call throws, `whyLabels[c.id]` is simply never set, so `whyLabel` on that profile is `null` (via `whyLabels[c.id] ?? null`). Other candidates' labels are unaffected by one candidate's failure.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/tests/ai.test.ts`. This test needs enough candidates on the grid to populate the top-10 list, so it creates several `discoverable` users:

```ts
describe('GET /api/v1/ai/top-10', () => {
  it('attaches a Gemini-generated whyLabel to the top-3 profiles', async () => {
    const { token } = await createPlatinumUser('dailyTop10');
    for (let i = 0; i < 4; i++) {
      await createTestUser({ firstName: `Candidate${i}` });
    }

    mockGeminiSuccess(JSON.stringify({ whyLabel: 'You both love hiking and coffee' }));

    const res = await request(app)
      .get('/api/v1/ai/top-10')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.profiles)).toBe(true);
    expect(res.body.profiles.length).toBeGreaterThan(0);
    const top = res.body.profiles[0];
    expect(top.whyLabel).toBe('You both love hiking and coffee');
  });

  it('omits whyLabel (null) for candidates when Gemini fails, without failing the request', async () => {
    const { token } = await createPlatinumUser('dailyTop10');
    for (let i = 0; i < 4; i++) {
      await createTestUser({ firstName: `Candidate${i}` });
    }

    mockGeminiFailure(500);

    const res = await request(app)
      .get('/api/v1/ai/top-10')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.profiles[0].whyLabel).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/ai.test.ts`
Expected: FAIL on the happy-path `whyLabel` assertion (still calling Claude).

- [ ] **Step 3: Migrate the "why" label block**

In `ai.controller.ts`, add near the other schema/validator declarations (e.g. just above `getDailyTop10`):

```ts
interface WhyLabelResult { whyLabel: string }
const WHY_LABEL_SCHEMA = {
  type: 'OBJECT',
  properties: { whyLabel: { type: 'STRING' } },
  required: ['whyLabel'],
};
const isWhyLabelResult = (v: unknown): v is WhyLabelResult =>
  !!v && typeof v === 'object' && typeof (v as WhyLabelResult).whyLabel === 'string';
```

Replace lines 312-323 (the `whyLabels`/`top3`/`Promise.all` block) with:

```ts
  const whyLabels: Record<string, string> = {};
  const top3 = scored.slice(0, 3);
  await Promise.all(top3.map(async (c) => {
    try {
      const system = 'In under 10 words, explain why these two people might connect well.';
      const userMsg = `${me.interests?.slice(0, 3).join(', ') || 'unknown interests'} | ${c.interests?.slice(0, 3).join(', ') || 'unknown interests'}`;
      const parsed = await callGeminiJson(system, userMsg, WHY_LABEL_SCHEMA, isWhyLabelResult);
      whyLabels[c.id] = parsed.whyLabel.trim().replace(/^["']|["']$/g, '').slice(0, 60);
    } catch (err) {
      console.error('[ai] top-10 why-label Gemini call failed', err);
      // skip — whyLabel stays null for this candidate
    }
  }));
```

(The surrounding `scored`, `profiles`, cache-write, and response-serialization code is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/ai.test.ts`
Expected: PASS (10 tests total). Note the Redis cache from `beforeAll`/`afterEach` `cleanDatabase()` flushes the DB (which includes `redis.flushdb()`), so each test gets a fresh (uncached) top-10 computation — no stale-cache leakage between the two tests in this block.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ai/ai.controller.ts backend/src/tests/ai.test.ts
git commit -m "feat: migrate AI daily top-10 why-labels from Claude to Gemini"
```

---

## Task 6: Migrate Profile Optimizer to Gemini

**Files:**
- Modify: `backend/src/modules/ai/ai.controller.ts:345-396` (function `getProfileOptimizer`)
- Test: `backend/src/tests/ai.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `callGeminiJson` from Task 1.
- Produces: `getProfileOptimizer` keeps signature and response shape — the optimizer result object is the top-level response body (no wrapper key): `{ profileScore: number, suggestions: Array<{ section: string, issue: string, recommendation: string }> }`.

**Existing fallback (preserve exactly):** on any failure, `{ profileScore: Math.round(user.profileCompletenessScore), suggestions: [] }`.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/tests/ai.test.ts`:

```ts
describe('GET /api/v1/ai/profile-optimizer', () => {
  it('returns Gemini-generated profile suggestions', async () => {
    const { token } = await createPlatinumUser('profileOptimizer');

    mockGeminiSuccess(JSON.stringify({
      profileScore: 72,
      suggestions: [
        { section: 'bio', issue: 'Bio is empty', recommendation: 'Add a sentence about your interests' },
        { section: 'photos', issue: 'Only 1 photo', recommendation: 'Add 2-3 more photos' },
      ],
    }));

    const res = await request(app)
      .get('/api/v1/ai/profile-optimizer')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.profileScore).toBe(72);
    expect(res.body.suggestions).toHaveLength(2);
    expect(res.body.suggestions[0]).toEqual({
      section: 'bio', issue: 'Bio is empty', recommendation: 'Add a sentence about your interests',
    });
  });

  it('falls back to the completeness score with no suggestions when Gemini fails', async () => {
    const { user, token } = await createPlatinumUser('profileOptimizer');

    mockGeminiFailure(500);

    const res = await request(app)
      .get('/api/v1/ai/profile-optimizer')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.profileScore).toBe(Math.round(user.profileCompletenessScore));
    expect(res.body.suggestions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/ai.test.ts`
Expected: FAIL on the happy-path assertions (still calling Claude).

- [ ] **Step 3: Migrate `getProfileOptimizer`**

Replace lines 345-396 in `ai.controller.ts` with:

```ts
interface ProfileOptimizerResult {
  profileScore: number;
  suggestions: Array<{ section: string; issue: string; recommendation: string }>;
}
const PROFILE_OPTIMIZER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    profileScore: { type: 'NUMBER' },
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          section: { type: 'STRING' },
          issue: { type: 'STRING' },
          recommendation: { type: 'STRING' },
        },
        required: ['section', 'issue', 'recommendation'],
      },
    },
  },
  required: ['profileScore', 'suggestions'],
};
const isProfileOptimizerResult = (v: unknown): v is ProfileOptimizerResult => {
  if (!v || typeof v !== 'object') return false;
  const r = v as ProfileOptimizerResult;
  return typeof r.profileScore === 'number' && Array.isArray(r.suggestions) &&
    r.suggestions.every((s) =>
      s && typeof s === 'object' &&
      typeof s.section === 'string' && typeof s.issue === 'string' && typeof s.recommendation === 'string');
};

export async function getProfileOptimizer(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  await requireAiFeature(userId, 'profileOptimizer');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true, age: true, bio: true, interests: true, lookingFor: true,
      datingIntentions: true, tribes: true, tags: true, profileCompletenessScore: true,
      photos: { where: { isPrivate: false }, select: { id: true }, take: 10 },
      prompts: { select: { prompt: true, answer: true }, take: 6 },
    },
  });
  if (!user) throw Errors.notFound();

  const profileSummary = {
    firstName: user.firstName,
    age: user.age,
    bio: user.bio,
    interests: user.interests,
    lookingFor: user.lookingFor,
    datingIntentions: user.datingIntentions,
    photoCount: user.photos.length,
    promptCount: user.prompts.length,
    prompts: user.prompts,
  };

  const system = `You are a dating profile coach. Analyze this profile and return specific, actionable improvements.
Sections: bio, photos, interests, lookingFor, prompts.
Be specific and encouraging. Max 5 suggestions.`;

  const userMsg = `Profile: ${JSON.stringify(profileSummary)}`;

  let result: ProfileOptimizerResult;
  try {
    result = await callGeminiJson(system, userMsg, PROFILE_OPTIMIZER_SCHEMA, isProfileOptimizerResult);
  } catch (err) {
    console.error('[ai] profile-optimizer Gemini call failed', err);
    result = { profileScore: Math.round(user.profileCompletenessScore), suggestions: [] };
  }

  res.status(200).json(result);
}
```

Note the system prompt drops the old `Respond ONLY with JSON: {...}` instruction sentence — Gemini's `responseSchema` now enforces the shape natively, so that sentence is redundant (this matches the task instruction to use native structured output instead of prompt-only JSON parsing). The `Sections:`/`Max 5 suggestions` guidance sentences are kept since they shape prompt *content*, not JSON *mechanics*.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && dotenv -e .env.test -- vitest run src/tests/ai.test.ts`
Expected: PASS (12 tests total, all 5 features covered).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ai/ai.controller.ts backend/src/tests/ai.test.ts
git commit -m "feat: migrate AI profile optimizer endpoint from Claude to Gemini"
```

---

## Task 7: Remove dead Claude plumbing, verify zero Anthropic calls, full validation

**Files:**
- Modify: `backend/src/modules/ai/ai.controller.ts` (delete now-unused Claude helpers)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is a cleanup-and-verify task, no behavior change.

- [ ] **Step 1: Delete the now-unused Claude helpers**

In `ai.controller.ts`, all 5 endpoints now use `callGeminiJson` exclusively. Delete:
- `AI_MODEL` constant (was `'claude-sonnet-4-6'`)
- `callClaudeRaw` function
- `callClaude` function
- `safeParseJson` function (no longer called anywhere — every endpoint now validates via its own `isXResult` type guard)
- The now-unused `env` import if `env.anthropic.apiKey` was the only remaining use of `env` in this file — check with `grep -n "env\." backend/src/modules/ai/ai.controller.ts` first; keep the import if `env` is still used elsewhere in the file.
- The now-unused `withTimeout` import (only `callClaude` used it).

Keep: `requireAiFeature`, `getAiOptIn`, `AiOptIn`, `FALLBACK_ICEBREAKERS`, `compatibilityScore`, `UserProfile`, `overlap` — all still in active use.

- [ ] **Step 2: Verify zero Anthropic references remain in this file**

Run: `grep -n -i "anthropic\|claude" backend/src/modules/ai/ai.controller.ts`
Expected: no output (empty).

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: exit code 0, no errors (in particular, no unused-import errors from the deleted Claude helpers, and no unused `env`/`withTimeout` imports if they were removed in Step 1).

- [ ] **Step 4: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all suites pass, including the new `geminiClient.test.ts` and `ai.test.ts`, and no regressions in `translation.test.ts`, `messaging.test.ts`, `discovery.test.ts`, `groups.test.ts`, `auth.test.ts`, `core.test.ts`, `safety.test.ts`, `revenue.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ai/ai.controller.ts
git commit -m "chore: remove dead Claude plumbing from ai.controller.ts after Gemini migration"
```

---

## Final Report Checklist (produce after Task 7 passes)

After all 7 tasks are complete, compile the final report the user asked for:

1. **Gemini migration status** — all 5 features FIXED (Tasks 2-6).
2. **Shared infrastructure** — describe `geminiClient.ts` (Task 1): what it does, that it's modeled on `translation.ts`, and that `translation.ts` itself was intentionally left unrefactored (lower risk; the task made this optional) — state this explicitly as a decision, not an oversight.
3. **Files changed** — list every file touched across Tasks 1-7: `backend/src/adapters/geminiClient.ts` (new), `backend/src/tests/geminiClient.test.ts` (new), `backend/src/tests/ai.test.ts` (new), `backend/src/modules/ai/ai.controller.ts` (modified).
4. **Claude usage remaining** — run `grep -rn -i "anthropic\|claude" backend/src --include=*.ts | grep -v test` and confirm the only production hits are in `backend/src/adapters/moderation.ts` and `backend/src/config/env.ts` (the `env.anthropic` config entry, intentionally kept per the task's constraints).
5. **Tests** — paste the exact `npm test` output/summary line (pass/fail counts), not a paraphrase.
6. **Physical testing required** — list the manual flows that need a real device/browser check (since this plan only covers automated tests): triggering each of the 5 AI endpoints from the actual frontend UI as a Platinum user with each feature's opt-in toggled on in Settings → AI Features, confirming real Gemini responses render correctly in the UI (icebreaker chips in chat, reply suggestion chips, compatibility breakdown on a profile, top-10 why-labels on the grid, profile optimizer suggestions screen), and confirming the 403 upgrade/opt-in prompts still appear correctly for non-Platinum or non-opted-in users. Explicitly do not claim this manual testing was performed.
