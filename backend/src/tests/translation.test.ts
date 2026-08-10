import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Pure adapter unit test — no DB/Redis needed. Mocks global fetch and
// re-imports the module fresh per test so env.gemini.apiKey picks up
// process.env.GEMINI_API_KEY mutations (env.ts reads it once at import time).
//
// env.ts also calls dotenv.config() on every fresh load (triggered by
// vi.resetModules() below). On a machine with a real backend/.env that has
// GEMINI_API_KEY set, that reload would silently repopulate a deliberately
// `delete`d process.env.GEMINI_API_KEY, breaking the "missing key" test.
// Stub dotenv.config() to a no-op so this file only ever sees the
// process.env values it sets itself.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

const ORIGINAL_GEMINI_KEY = process.env.GEMINI_API_KEY;
const ORIGINAL_FETCH = global.fetch;

async function loadAdapter() {
  vi.resetModules();
  const mod = await import('../adapters/translation');
  return mod.translation;
}

describe('translation adapter — Gemini provider', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_GEMINI_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_KEY;
    vi.restoreAllMocks();
  });

  it('calls the Gemini API (not Anthropic) and returns the real translated text', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const fetchMock = vi.fn(async (url: string, _opts?: RequestInit) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({ translatedText: 'Hola', detectedSourceLang: 'en' }),
              }],
            },
          }],
        }),
      } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const translation = await loadAdapter();
    const result = await translation.translate('Hello', 'es');

    expect(result).toEqual({ text: 'Hola', detectedSourceLang: 'en' });

    // Root-cause regression guard: the request must go to Gemini's endpoint,
    // never to Anthropic's — this is exactly the bug being fixed.
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('generativelanguage.googleapis.com');
    expect(calledUrl).not.toContain('anthropic.com');

    const calledOpts = fetchMock.mock.calls[0][1] as RequestInit;
    expect((calledOpts.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini-key');
  });

  it('never returns a placeholder like "[lang] original text" when Gemini fails', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 } as Response)) as unknown as typeof fetch;

    const translation = await loadAdapter();
    await expect(translation.translate('Hello', 'es')).rejects.toThrow(/Gemini API returned 500/);
  });

  it('throws a configuration error (not a placeholder) when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    global.fetch = vi.fn() as unknown as typeof fetch;

    const translation = await loadAdapter();
    await expect(translation.translate('Hello', 'es')).rejects.toThrow(/GEMINI_API_KEY is not set/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
