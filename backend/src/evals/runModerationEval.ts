/**
 * Claude-vs-Gemini text-moderation evaluation harness.
 *
 * Standalone script — does NOT touch the production moderation path
 * (`CompositeModerationAdapter` in adapters/moderation.ts is untouched and
 * still calls Claude). Run with:
 *
 *   npm run eval:moderation
 *
 * Requires real ANTHROPIC_API_KEY / GEMINI_API_KEY in the backend .env to
 * evaluate each respective provider — a provider without a configured key is
 * reported as `skipped`, not silently scored as 0.
 */
import { env } from '../config/env';
import { moderationDataset, ModerationDatasetItem } from './moderationDataset';
import { claudeHaikuClassify, ruleBasedClassify, ModerationResult } from '../adapters/moderation';
import { geminiClassifyText } from '../adapters/geminiModeration';

export interface ClassifierRun {
  item: ModerationDatasetItem;
  predictedOffensive: boolean | null; // null = classifier errored
  categories: string[];
  latencyMs: number;
  error?: string;
}

export interface ProviderMetrics {
  n: number;
  errors: number;
  accuracy: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
  avgLatencyMs: number;
  falseNegatives: Array<{ id: string; text: string; category: string }>;
  falsePositives: Array<{ id: string; text: string; category: string }>;
  byCategory: Record<string, { n: number; correct: number; accuracy: number }>;
}

export type ProviderReport = ProviderMetrics | { skipped: true; reason: string };

async function timed(fn: () => Promise<ModerationResult>): Promise<{ result: ModerationResult | null; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, latencyMs: Date.now() - start };
  } catch (err) {
    return { result: null, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function classifyDataset(
  classify: (text: string) => Promise<ModerationResult>,
  dataset: ModerationDatasetItem[] = moderationDataset,
): Promise<ClassifierRun[]> {
  const runs: ClassifierRun[] = [];
  for (const item of dataset) {
    const { result, latencyMs, error } = await timed(() => classify(item.text));
    runs.push({
      item,
      predictedOffensive: result ? result.offensive : null,
      categories: result ? result.categories : [],
      latencyMs,
      error,
    });
  }
  return runs;
}

export function computeMetrics(runs: ClassifierRun[]): ProviderMetrics {
  const evaluable = runs.filter((r) => r.predictedOffensive !== null);
  const errors = runs.length - evaluable.length;

  let tp = 0, tn = 0, fp = 0, fn = 0;
  const falseNegatives: ProviderMetrics['falseNegatives'] = [];
  const falsePositives: ProviderMetrics['falsePositives'] = [];
  const byCategory: ProviderMetrics['byCategory'] = {};

  for (const r of evaluable) {
    const expected = r.item.expectedOffensive;
    const predicted = r.predictedOffensive as boolean;
    const cat = r.item.category;
    byCategory[cat] ??= { n: 0, correct: 0, accuracy: 0 };
    byCategory[cat].n += 1;
    if (predicted === expected) byCategory[cat].correct += 1;

    if (expected && predicted) tp += 1;
    else if (!expected && !predicted) tn += 1;
    else if (!expected && predicted) { fp += 1; falsePositives.push({ id: r.item.id, text: r.item.text, category: cat }); }
    else { fn += 1; falseNegatives.push({ id: r.item.id, text: r.item.text, category: cat }); }
  }

  for (const cat of Object.keys(byCategory)) {
    const c = byCategory[cat];
    c.accuracy = c.n ? c.correct / c.n : 0;
  }

  const n = evaluable.length;
  const accuracy = n ? (tp + tn) / n : 0;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const falsePositiveRate = fp + tn ? fp / (fp + tn) : 0;
  const avgLatencyMs = runs.length ? runs.reduce((s, r) => s + r.latencyMs, 0) / runs.length : 0;

  return { n, errors, accuracy, precision, recall, falsePositiveRate, avgLatencyMs, falseNegatives, falsePositives, byCategory };
}

interface ProviderDef {
  name: string;
  classify: (text: string) => Promise<ModerationResult>;
  available: boolean;
  reason?: string;
}

export async function runEval(dataset: ModerationDatasetItem[] = moderationDataset): Promise<Record<string, ProviderReport>> {
  const providers: ProviderDef[] = [
    {
      name: 'claude',
      classify: claudeHaikuClassify,
      available: !!env.anthropic.apiKey,
      reason: env.anthropic.apiKey ? undefined : 'ANTHROPIC_API_KEY not set — cannot evaluate production Claude moderation',
    },
    {
      name: 'gemini',
      classify: geminiClassifyText,
      available: !!env.gemini.apiKey,
      reason: env.gemini.apiKey ? undefined : 'GEMINI_API_KEY not set',
    },
    {
      // Reference baseline: what Claude's own fallback produces when the API
      // is unavailable — useful context when ANTHROPIC_API_KEY is unset.
      name: 'rule_based_fallback',
      classify: async (text: string) => ruleBasedClassify(text),
      available: true,
    },
  ];

  const report: Record<string, ProviderReport> = {};
  for (const p of providers) {
    if (!p.available) {
      report[p.name] = { skipped: true, reason: p.reason! };
      continue;
    }
    const runs = await classifyDataset(p.classify, dataset);
    report[p.name] = computeMetrics(runs);
  }
  return report;
}

/* istanbul ignore next -- CLI entry point, exercised manually via `npm run eval:moderation` */
if (require.main === module) {
  runEval()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
