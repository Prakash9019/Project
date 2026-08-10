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
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 1024,
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

  let data: GeminiResponse;
  try {
    data = (await resp.json()) as GeminiResponse;
  } catch {
    throw new GeminiRequestError('Gemini returned malformed JSON');
  }

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
