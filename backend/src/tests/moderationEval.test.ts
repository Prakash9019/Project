import { describe, it, expect, vi, afterEach } from 'vitest';
import { moderationDataset } from '../evals/moderationDataset';
import { computeMetrics, classifyDataset, ClassifierRun } from '../evals/runModerationEval';
import type { ModerationResult } from '../adapters/moderation';

// ─────────────────────────────────────────────────────────────────
// Dataset shape / coverage
// ─────────────────────────────────────────────────────────────────

describe('moderationDataset', () => {
  const REQUIRED_CATEGORIES = ['benign', 'harassment', 'hate_speech', 'sexual_explicit', 'threat', 'spam', 'borderline'];

  it('covers every required category with at least 3 examples each', () => {
    for (const cat of REQUIRED_CATEGORIES) {
      const count = moderationDataset.filter((i) => i.category === cat).length;
      expect(count, `category "${cat}" needs >=3 examples`).toBeGreaterThanOrEqual(3);
    }
  });

  it('has unique ids', () => {
    const ids = moderationDataset.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has non-empty text and a boolean expectedOffensive for every item', () => {
    for (const item of moderationDataset) {
      expect(item.text.length).toBeGreaterThan(0);
      expect(typeof item.expectedOffensive).toBe('boolean');
    }
  });

  it('every benign-category item is labeled non-offensive', () => {
    for (const item of moderationDataset.filter((i) => i.category === 'benign')) {
      expect(item.expectedOffensive).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// computeMetrics — pure function, hand-computed fixtures
// ─────────────────────────────────────────────────────────────────

function run(expected: boolean, predicted: boolean | null, category = 'benign', id = 'x'): ClassifierRun {
  return {
    item: { id, text: 't', category: category as never, expectedOffensive: expected },
    predictedOffensive: predicted,
    categories: [],
    latencyMs: 10,
  };
}

describe('computeMetrics', () => {
  it('scores a perfect classifier as 100% across the board', () => {
    const runs = [
      run(true, true, 'threat', 'a'),
      run(false, false, 'benign', 'b'),
      run(true, true, 'harassment', 'c'),
    ];
    const m = computeMetrics(runs);
    expect(m.accuracy).toBe(1);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(m.falsePositiveRate).toBe(0);
    expect(m.falseNegatives).toHaveLength(0);
    expect(m.falsePositives).toHaveLength(0);
  });

  it('computes precision/recall/FPR correctly for a mixed confusion matrix', () => {
    // 2 true positives, 1 false positive, 1 false negative, 1 true negative
    const runs = [
      run(true, true, 'threat', 'tp1'),
      run(true, true, 'hate_speech', 'tp2'),
      run(false, true, 'borderline', 'fp1'),
      run(true, false, 'sexual_explicit', 'fn1'),
      run(false, false, 'benign', 'tn1'),
    ];
    const m = computeMetrics(runs);
    // accuracy = (tp+tn)/n = (2+1)/5 = 0.6
    expect(m.accuracy).toBeCloseTo(0.6);
    // precision = tp/(tp+fp) = 2/3
    expect(m.precision).toBeCloseTo(2 / 3);
    // recall = tp/(tp+fn) = 2/3
    expect(m.recall).toBeCloseTo(2 / 3);
    // FPR = fp/(fp+tn) = 1/2
    expect(m.falsePositiveRate).toBeCloseTo(0.5);
    expect(m.falseNegatives.map((f) => f.id)).toEqual(['fn1']);
    expect(m.falsePositives.map((f) => f.id)).toEqual(['fp1']);
  });

  it('excludes classifier errors from scoring but counts them', () => {
    const runs = [
      run(true, true, 'threat', 'a'),
      { ...run(true, null, 'threat', 'b'), error: 'timeout' },
    ];
    const m = computeMetrics(runs);
    expect(m.n).toBe(1);
    expect(m.errors).toBe(1);
    expect(m.accuracy).toBe(1);
  });

  it('breaks accuracy down per category', () => {
    const runs = [
      run(true, true, 'threat', 'a'),
      run(true, false, 'threat', 'b'),
      run(false, false, 'benign', 'c'),
    ];
    const m = computeMetrics(runs);
    expect(m.byCategory.threat).toEqual({ n: 2, correct: 1, accuracy: 0.5 });
    expect(m.byCategory.benign).toEqual({ n: 1, correct: 1, accuracy: 1 });
  });

  it('returns zeroed metrics (not NaN) on an empty run set', () => {
    const m = computeMetrics([]);
    expect(m).toMatchObject({ n: 0, errors: 0, accuracy: 0, precision: 0, recall: 0, falsePositiveRate: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────
// classifyDataset — records latency/errors per item without throwing
// ─────────────────────────────────────────────────────────────────

describe('classifyDataset', () => {
  it('runs a classifier over every dataset item and records latency', async () => {
    const items = moderationDataset.slice(0, 3);
    const classify = vi.fn(async (text: string): Promise<ModerationResult> => ({
      offensive: text.includes('hurt'),
      categories: [],
      score: 0,
    }));
    const runs = await classifyDataset(classify, items);
    expect(runs).toHaveLength(3);
    expect(classify).toHaveBeenCalledTimes(3);
    for (const r of runs) {
      expect(typeof r.latencyMs).toBe('number');
      expect(r.predictedOffensive).not.toBeNull();
    }
  });

  it('captures a classifier error per item instead of throwing', async () => {
    const items = moderationDataset.slice(0, 2);
    const classify = vi.fn(async (): Promise<ModerationResult> => { throw new Error('provider down'); });
    const runs = await classifyDataset(classify, items);
    expect(runs).toHaveLength(2);
    for (const r of runs) {
      expect(r.predictedOffensive).toBeNull();
      expect(r.error).toBe('provider down');
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// geminiClassifyText — same fetch-mock contract as geminiClient.test.ts
// ─────────────────────────────────────────────────────────────────

describe('geminiModeration — geminiClassifyText', () => {
  const ORIGINAL_FETCH = global.fetch;
  const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
    vi.restoreAllMocks();
  });

  it('calls the Gemini API (not Anthropic) and returns a parsed ModerationResult', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ offensive: true, categories: ['threat'], score: 0.9 }) }] } }],
      }),
    } as Response)) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const { geminiClassifyText } = await import('../adapters/geminiModeration');
    const result = await geminiClassifyText('I will find you and hurt you');

    expect(result).toEqual({ offensive: true, categories: ['threat'], score: 0.9 });
    const calledUrl = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('generativelanguage.googleapis.com');
    expect(calledUrl).not.toContain('anthropic.com');
  });

  it('propagates GeminiRequestError on failure so the harness records it as an error, not a false result', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as Response)) as unknown as typeof fetch;

    const { geminiClassifyText } = await import('../adapters/geminiModeration');
    await expect(geminiClassifyText('anything')).rejects.toThrow(/Gemini API returned 500/);
  });

  it('rejects a malformed structured-output shape (missing offensive/score)', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ categories: ['spam'] }) }] } }],
      }),
    } as Response)) as unknown as typeof fetch;

    const { geminiClassifyText } = await import('../adapters/geminiModeration');
    await expect(geminiClassifyText('anything')).rejects.toThrow(/failed schema validation/);
  });
});
