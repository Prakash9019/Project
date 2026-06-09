/**
 * AI language filtering / offensive-content detection.
 * Powers "AI Language Filtering" (auto-hide disrespectful messages) and "Block Offensive Language"
 * (reject offensive inbound likes/messages).
 * TODO: wire OpenAI Moderation / Perspective API / a self-hosted classifier.
 */
export interface ModerationAdapter {
  classifyText(text: string): Promise<{ offensive: boolean; categories: string[]; score: number }>;
}

// Minimal stub word-list so the feature is demonstrable without a provider.
const STUB_BLOCKLIST = ['slur1', 'slur2', 'offensiveword'];

class StubModerationAdapter implements ModerationAdapter {
  async classifyText(text: string): Promise<{ offensive: boolean; categories: string[]; score: number }> {
    const lower = text.toLowerCase();
    const hit = STUB_BLOCKLIST.some((w) => lower.includes(w));
    // TODO: replace with a real classifier call.
    return { offensive: hit, categories: hit ? ['harassment'] : [], score: hit ? 0.9 : 0.0 };
  }
}

export const moderation: ModerationAdapter = new StubModerationAdapter();
