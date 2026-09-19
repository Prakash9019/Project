import { withTimeout } from '../utils/withTimeout';
import { geminiClassifyText } from './geminiModeration';

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

// Exported for the moderation eval harness (src/evals/) — also used directly
// by CompositeModerationAdapter as the fallback when Gemini is unconfigured
// or fails.
export function ruleBasedClassify(text: string): ModerationResult {
  for (const pattern of BLOCKLIST_PATTERNS) {
    if (pattern.test(text)) {
      return { offensive: true, categories: ['rule_match'], score: 0.95 };
    }
  }
  return { offensive: false, categories: [], score: 0.0 };
}

// ── Composite adapter: Gemini → rule-based fallback ──────────────────────────

class CompositeModerationAdapter implements ModerationAdapter {
  async classifyText(text: string): Promise<ModerationResult> {
    try {
      return await withTimeout(
        geminiClassifyText(text),
        5000,
        ruleBasedClassify(text), // fallback: rule-based result on timeout
      );
    } catch {
      return ruleBasedClassify(text);
    }
  }
}

export const moderation: ModerationAdapter = new CompositeModerationAdapter();
