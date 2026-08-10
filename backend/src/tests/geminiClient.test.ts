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
    } as unknown as Response));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { callGeminiJson } = await loadClient();
    const result = await callGeminiJson('sys', 'user', SCHEMA, isSuggestions);

    expect(result).toEqual({ suggestions: ['a', 'b', 'c'] });

    expect(fetchMock).toHaveBeenCalled();
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const calledUrl = calls[0][0];
    expect(calledUrl).toContain('generativelanguage.googleapis.com');
    expect(calledUrl).toContain('gemini-2.5-flash');
    expect(calledUrl).not.toContain('anthropic.com');

    const calledOpts = calls[0][1];
    expect((calledOpts.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini-key');
    const body = JSON.parse(calledOpts.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toEqual(SCHEMA);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
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

  it('throws GeminiRequestError when response.json() fails (malformed 2xx body)', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new Error('invalid body'); },
    } as unknown as Response)) as unknown as typeof fetch;

    const { callGeminiJson, GeminiRequestError } = await loadClient();
    await expect(callGeminiJson('sys', 'user', SCHEMA, isSuggestions)).rejects.toThrow(GeminiRequestError);
    await expect(callGeminiJson('sys', 'user', SCHEMA, isSuggestions)).rejects.toThrow(/malformed JSON/);
  });
});
