import { env } from '../config/env';
import { withTimeout } from '../utils/withTimeout';

export interface ModerationResult {
  offensive: boolean;
  categories: string[];
  score: number;
}

export interface ModerationAdapter {
  classifyText(text: string): Promise<ModerationResult>;
}

// ── Rule-based fallback (no external dependency) ─────────────────────────────

const BLOCKLIST_PATTERNS = [
  /\b(slur1|slur2|offensiveword)\b/i,
  // Extend with project-specific patterns here
];

// Exported for the Claude-vs-Gemini moderation eval harness (src/evals/) —
// not used by CompositeModerationAdapter's control flow, which is unchanged.
export function ruleBasedClassify(text: string): ModerationResult {
  for (const pattern of BLOCKLIST_PATTERNS) {
    if (pattern.test(text)) {
      return { offensive: true, categories: ['rule_match'], score: 0.95 };
    }
  }
  return { offensive: false, categories: [], score: 0.0 };
}

// ── Claude Haiku option A: fetch-based, no SDK required ──────────────────────

// Exported for the moderation eval harness (src/evals/runModerationEval.ts) so
// it reuses this exact call instead of duplicating the Claude fetch logic.
export async function claudeHaikuClassify(text: string): Promise<ModerationResult> {
  const apiKey = env.anthropic.apiKey;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    messages: [
      {
        role: 'user',
        content: `You are a content moderation assistant. Classify the following message as offensive or not.\nRespond with JSON only: {"offensive": boolean, "categories": string[], "score": number}\nCategories: harassment, hate_speech, sexual_explicit, threat, spam, none\n\nMessage: ${JSON.stringify(text)}`,
      },
    ],
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`Anthropic API error: ${resp.status}`);

  const data = await resp.json() as { content: Array<{ text: string }> };
  const raw = data.content?.[0]?.text ?? '{}';
  try {
    return JSON.parse(raw) as ModerationResult;
  } catch {
    throw new Error('Failed to parse Claude Haiku moderation response');
  }
}

// ── Composite adapter: Claude Haiku → rule-based fallback ────────────────────

class CompositeModerationAdapter implements ModerationAdapter {
  async classifyText(text: string): Promise<ModerationResult> {
    if (env.anthropic.apiKey) {
      try {
        const result = await withTimeout(
          claudeHaikuClassify(text),
          5000,
          ruleBasedClassify(text), // fallback: rule-based result on timeout
        );
        return result;
      } catch {
        // fall through to rule-based
      }
    }
    return ruleBasedClassify(text);
  }
}

export const moderation: ModerationAdapter = new CompositeModerationAdapter();
