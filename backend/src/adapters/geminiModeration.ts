/**
 * Gemini text-moderation classifier — evaluation-only.
 *
 * Used exclusively by the moderation eval harness (src/evals/) to compare
 * against the production Claude Haiku classifier in `moderation.ts`. This is
 * NOT wired into `CompositeModerationAdapter` — the live moderation path is
 * unchanged. Reuses the shared `callGeminiJson` client (no new Gemini fetch
 * logic), and mirrors Claude's exact category taxonomy so results are
 * directly comparable.
 */
import { callGeminiJson } from './geminiClient';
import type { ModerationResult } from './moderation';

const MODERATION_CATEGORIES = ['harassment', 'hate_speech', 'sexual_explicit', 'threat', 'spam', 'none'] as const;

const SYSTEM_PROMPT =
  'You are a content moderation assistant for a dating/social app. Classify the given ' +
  'chat message as offensive or not. A message is offensive if it contains harassment, ' +
  'hate speech, sexually explicit solicitation, threats of violence, or spam/scam content. ' +
  `Categories: ${MODERATION_CATEGORIES.join(', ')}.`;

const MODERATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    offensive: { type: 'BOOLEAN' },
    categories: { type: 'ARRAY', items: { type: 'STRING', enum: [...MODERATION_CATEGORIES] } },
    score: { type: 'NUMBER' },
  },
  required: ['offensive', 'categories', 'score'],
};

function isModerationResult(v: unknown): v is ModerationResult {
  if (!v || typeof v !== 'object') return false;
  const r = v as ModerationResult;
  return (
    typeof r.offensive === 'boolean' &&
    Array.isArray(r.categories) && r.categories.every((c) => typeof c === 'string') &&
    typeof r.score === 'number'
  );
}

export async function geminiClassifyText(text: string): Promise<ModerationResult> {
  const userPrompt = `Message: ${JSON.stringify(text)}`;
  return callGeminiJson(SYSTEM_PROMPT, userPrompt, MODERATION_SCHEMA, isModerationResult);
}
