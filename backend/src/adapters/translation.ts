/**
 * Chat translation (premium "Chat Translate" feature).
 *
 * Backed by the Google Gemini API via `GEMINI_API_KEY` (backend-only — never
 * exposed to the React Native client, and never `EXPO_PUBLIC_*`).
 *
 * Note: with true E2E encryption, translation must run client-side on
 * decrypted text; this server-side adapter is for non-E2E/plaintext payloads
 * or a trusted-relay mode. Keep that trade-off in mind before enabling in
 * production (see `chat.controller.ts#translateMessage`, which already blocks
 * ciphertext-only messages).
 */
import { env } from '../config/env';

export interface TranslationAdapter {
  detectLanguage(text: string): Promise<string>; // ISO 639-1
  translate(text: string, targetLang: string): Promise<{ text: string; detectedSourceLang: string }>;
}

// `gemini-2.0-flash` was retired by Google — generateContent now answers 404
// ("This model ... is no longer available"). `gemini-2.5-flash` is the current
// stable, generally-available flash model and supports generateContent plus the
// structured-output (responseSchema) config this adapter relies on. Verified
// against GET https://generativelanguage.googleapis.com/v1beta/models for this
// key; keep it on a pinned stable id rather than a `-latest`/`-preview` alias.
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 10_000;
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

async function callGemini(systemPrompt: string, userPrompt: string, responseSchema: object): Promise<string> {
  const apiKey = env.gemini.apiKey;
  if (!apiKey) {
    throw new Error(
      'Translation is not configured: GEMINI_API_KEY is not set. ' +
      'Set GEMINI_API_KEY in the backend environment to enable Chat Translate.',
    );
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
      throw new Error('Translation request timed out');
    }
    throw new Error(`Translation request failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    // Surface Gemini's own message (invalid/restricted key, retired model,
    // quota) rather than a bare status — a silent placeholder translation is
    // never an acceptable fallback.
    let detail = '';
    try {
      const body = (await resp.json()) as { error?: { message?: string; status?: string } };
      detail = body.error?.message ?? '';
    } catch {
      /* non-JSON error body — status alone has to do */
    }
    throw new Error(
      `Translation provider error: Gemini API returned ${resp.status}` +
      (detail ? ` — ${detail}` : ''),
    );
  }

  const data = (await resp.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Translation provider returned an empty response');
  }
  return text;
}

class GeminiTranslationAdapter implements TranslationAdapter {
  async detectLanguage(text: string): Promise<string> {
    const system = 'You are a language detector. Respond with ONLY the ISO 639-1 two-letter code ' +
      '(e.g. "en", "fr", "hi") of the language the given text is written in.';
    const raw = await callGemini(system, text, {
      type: 'OBJECT',
      properties: { languageCode: { type: 'STRING' } },
      required: ['languageCode'],
    });

    let parsed: { languageCode?: unknown };
    try {
      parsed = JSON.parse(raw) as { languageCode?: unknown };
    } catch {
      throw new Error('Translation provider returned a malformed response');
    }

    const code = typeof parsed.languageCode === 'string' ? parsed.languageCode.toLowerCase().slice(0, 2) : '';
    if (!/^[a-z]{2}$/.test(code)) {
      throw new Error('Translation provider returned an invalid language code');
    }
    return code;
  }

  async translate(text: string, targetLang: string): Promise<{ text: string; detectedSourceLang: string }> {
    const system = `You are a professional translator. Translate the user's message into the language ` +
      `identified by ISO 639-1 code "${targetLang}". Preserve tone, meaning, emoji, and formatting. ` +
      `Also detect the ISO 639-1 code of the source language. ` +
      `Respond with only the translated text and the detected source language code — no commentary.`;

    const raw = await callGemini(system, text, {
      type: 'OBJECT',
      properties: {
        translatedText: { type: 'STRING' },
        detectedSourceLang: { type: 'STRING' },
      },
      required: ['translatedText', 'detectedSourceLang'],
    });

    let parsed: { translatedText?: unknown; detectedSourceLang?: unknown };
    try {
      parsed = JSON.parse(raw) as { translatedText?: unknown; detectedSourceLang?: unknown };
    } catch {
      throw new Error('Translation provider returned a malformed response');
    }

    if (typeof parsed.translatedText !== 'string' || !parsed.translatedText.trim()) {
      throw new Error('Translation provider returned no translated text');
    }

    const detectedSourceLang = typeof parsed.detectedSourceLang === 'string' && parsed.detectedSourceLang
      ? parsed.detectedSourceLang.toLowerCase().slice(0, 5)
      : 'unknown';

    return { text: parsed.translatedText, detectedSourceLang };
  }
}

export const translation: TranslationAdapter = new GeminiTranslationAdapter();
