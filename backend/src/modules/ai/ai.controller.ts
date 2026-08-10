import { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { env } from '../../config/env';
import { Errors } from '../../utils/httpError';
import { withTimeout } from '../../utils/withTimeout';
import { callGeminiJson } from '../../adapters/geminiClient';

// ── Helpers ───────────────────────────────────────────────

interface AiOptIn {
  icebreakers?: boolean;
  replySuggestions?: boolean;
  compatibility?: boolean;
  dailyTop10?: boolean;
  profileOptimizer?: boolean;
}

function getAiOptIn(raw: unknown): AiOptIn {
  if (!raw || typeof raw !== 'object') return {};
  return raw as AiOptIn;
}

async function requireAiFeature(userId: string, feature: keyof AiOptIn): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { aiOptInFeatures: true } });
  const optIn = getAiOptIn(user?.aiOptInFeatures);
  if (!optIn[feature]) {
    throw Errors.forbidden('Enable this feature in Settings → AI Features.');
  }
}

const AI_MODEL = 'claude-sonnet-4-6';
const FALLBACK_ICEBREAKERS = [
  "Hey, I'd love to hear more about you!",
  'Your profile caught my eye — what do you enjoy doing on weekends?',
  'Hi there! What are you passionate about these days?',
];

async function callClaudeRaw(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = env.anthropic.apiKey;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    }),
  });

  if (!resp.ok) throw new Error(`Claude API error: ${resp.status}`);
  const data = await resp.json() as { content: Array<{ text: string }> };
  return data.content?.[0]?.text ?? '';
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  return withTimeout(callClaudeRaw(systemPrompt, userPrompt), 10000, '');
}

function safeParseJson<T>(text: string, fallback: T): T {
  try {
    // Strip markdown code fences if present
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(clean) as T;
  } catch {
    return fallback;
  }
}

// ── Compatibility score (deterministic, no AI) ────────────────────────────────

type UserProfile = {
  lookingFor: string[];
  datingIntentions: string[];
  interests: string[];
  tribes: string[];
  relationshipStatus: string | null;
  whereWeCanMeet: string[];
};

function overlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x)).length;
}

function compatibilityScore(a: UserProfile, b: UserProfile): number {
  let score = 0;
  if (overlap(a.lookingFor, b.lookingFor) > 0)       score += 20;
  if (overlap(a.datingIntentions, b.datingIntentions) > 0) score += 20;
  if (overlap(a.interests, b.interests) > 2)          score += 15;
  if (overlap(a.tribes, b.tribes) > 0)                score += 15;
  const bothSingle = a.relationshipStatus === 'single' && b.relationshipStatus === 'single';
  if (bothSingle || a.relationshipStatus === b.relationshipStatus) score += 10;
  if (overlap(a.whereWeCanMeet, b.whereWeCanMeet) > 0) score += 10;
  // bodyType preference heuristic: no reliable way to determine match without explicit prefs
  return Math.min(score, 100);
}

// ── AI Icebreakers ────────────────────────────────────────

interface IcebreakersResult { suggestions: string[] }
const ICEBREAKERS_SCHEMA = {
  type: 'OBJECT',
  properties: { suggestions: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['suggestions'],
};
const isIcebreakersResult = (v: unknown): v is IcebreakersResult =>
  !!v && typeof v === 'object' && Array.isArray((v as IcebreakersResult).suggestions) &&
  (v as IcebreakersResult).suggestions.every((s) => typeof s === 'string');

export async function getIcebreakers(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  await requireAiFeature(userId, 'icebreakers');

  const { conversationId } = req.query as { conversationId?: string };
  if (!conversationId) throw Errors.badRequest('conversationId is required');

  const convo = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  });
  if (!convo) throw Errors.notFound('Conversation not found');

  const targetId = convo.userAId === userId ? convo.userBId : convo.userAId;
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { firstName: true, age: true, bio: true, interests: true, lookingFor: true, whereAreYouFrom: true, fantasyTags: true },
  });
  if (!target) throw Errors.notFound('User not found');

  const system = `You are a dating app assistant helping users start conversations.
Generate 3 short, personalized, genuine opening messages based on the profile provided.
Each should be under 120 characters. Be warm, specific, not generic.
Never be explicit or suggestive. Respond ONLY with a JSON array of 3 strings.`;

  const user = `Profile: Name: ${target.firstName ?? 'Unknown'}, Age: ${target.age ?? 'unknown'}, Bio: ${target.bio ?? ''}, Interests: ${(target.interests ?? []).join(', ')}, Looking for: ${(target.lookingFor ?? []).join(', ')}, From: ${target.whereAreYouFrom ?? ''}, Tags: ${(target.fantasyTags ?? []).join(', ')}`;

  let suggestions: string[];
  try {
    const parsed = await callGeminiJson(system, user, ICEBREAKERS_SCHEMA, isIcebreakersResult);
    if (parsed.suggestions.length >= 3) {
      suggestions = parsed.suggestions.slice(0, 3);
    } else {
      console.error('[ai] icebreakers Gemini returned fewer than 3 suggestions', parsed.suggestions);
      suggestions = FALLBACK_ICEBREAKERS;
    }
  } catch (err) {
    console.error('[ai] icebreakers Gemini call failed', err);
    suggestions = FALLBACK_ICEBREAKERS;
  }

  res.status(200).json({ suggestions, count: 3 });
}

// ── AI Reply Suggestions ──────────────────────────────────

interface ReplySuggestionsResult { suggestions: string[] }
const REPLY_SUGGESTIONS_SCHEMA = {
  type: 'OBJECT',
  properties: { suggestions: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['suggestions'],
};
const isReplySuggestionsResult = (v: unknown): v is ReplySuggestionsResult =>
  !!v && typeof v === 'object' && Array.isArray((v as ReplySuggestionsResult).suggestions) &&
  (v as ReplySuggestionsResult).suggestions.every((s) => typeof s === 'string');

export async function getReplySuggestions(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  await requireAiFeature(userId, 'replySuggestions');

  const { conversationId } = req.query as { conversationId?: string };
  if (!conversationId) throw Errors.badRequest('conversationId is required');

  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, OR: [{ userAId: userId }, { userBId: userId }] },
    select: { id: true, userAId: true, userBId: true },
  });
  if (!convo) throw Errors.notFound('Conversation not found');

  const messages = await prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { senderId: true, content: true },
  });
  messages.reverse();

  const system = `You are a dating app assistant. Suggest 3 natural reply options for the user.
Keep each under 100 characters. Match the tone of the conversation.
Never be explicit. Respond ONLY with a JSON array of 3 strings.`;

  const userMsg = `Conversation (newest last):\n${messages.map((m) => `${m.senderId === userId ? 'Me' : 'Them'}: ${m.content}`).join('\n')}`;

  let suggestions: string[];
  try {
    const parsed = await callGeminiJson(system, userMsg, REPLY_SUGGESTIONS_SCHEMA, isReplySuggestionsResult);
    suggestions = parsed.suggestions;
  } catch (err) {
    console.error('[ai] reply-suggestions Gemini call failed', err);
    suggestions = ['Sounds great!', 'Tell me more!', 'Interesting! What else?'];
  }

  res.status(200).json({ suggestions });
}

// ── AI Compatibility ──────────────────────────────────────

interface CompatibilityBreakdownResult { breakdown: string[] }
const COMPATIBILITY_SCHEMA = {
  type: 'OBJECT',
  properties: { breakdown: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['breakdown'],
};
const isCompatibilityBreakdownResult = (v: unknown): v is CompatibilityBreakdownResult =>
  !!v && typeof v === 'object' && Array.isArray((v as CompatibilityBreakdownResult).breakdown) &&
  (v as CompatibilityBreakdownResult).breakdown.every((s) => typeof s === 'string');

export async function getCompatibility(req: Request, res: Response): Promise<void> {
  const myId = req.user!.sub;
  const { userId: theirId } = req.params;
  await requireAiFeature(myId, 'compatibility');

  const profileSelect = {
    id: true, firstName: true, age: true, bio: true,
    lookingFor: true, datingIntentions: true, interests: true, tribes: true,
    relationshipStatus: true, whereWeCanMeet: true,
  } as const;

  const [me, them] = await Promise.all([
    prisma.user.findUnique({ where: { id: myId }, select: profileSelect }),
    prisma.user.findUnique({ where: { id: theirId }, select: profileSelect }),
  ]);
  if (!me || !them) throw Errors.notFound('User not found');

  const toProfile = (u: typeof me): UserProfile => ({
    lookingFor: (u.lookingFor ?? []) as string[],
    datingIntentions: (u.datingIntentions ?? []) as string[],
    interests: u.interests ?? [],
    tribes: u.tribes ?? [],
    relationshipStatus: u.relationshipStatus ?? null,
    whereWeCanMeet: (u.whereWeCanMeet ?? []) as string[],
  });

  const score = compatibilityScore(toProfile(me), toProfile(them));

  const system = `You are a compatibility analyst. Given two dating profiles, explain their compatibility in 2-3 short bullet points.
Focus on shared interests, intent alignment, and lifestyle.
Never mention race, religion, orientation, or physical appearance beyond what they stated.
Respond ONLY with a JSON array of 2-3 strings (the bullet points).`;

  const userMsg = `Profile A: Name ${me.firstName ?? 'A'}, Bio: ${me.bio ?? ''}, Interests: ${me.interests?.join(', ')}, Looking for: ${(me.lookingFor ?? []).join(', ')}. Profile B: Name ${them.firstName ?? 'B'}, Bio: ${them.bio ?? ''}, Interests: ${them.interests?.join(', ')}, Looking for: ${(them.lookingFor ?? []).join(', ')}. Score: ${score}/100`;

  let breakdown: string[];
  try {
    const parsed = await callGeminiJson(system, userMsg, COMPATIBILITY_SCHEMA, isCompatibilityBreakdownResult);
    breakdown = parsed.breakdown;
  } catch (err) {
    console.error('[ai] compatibility Gemini call failed', err);
    breakdown = [];
  }

  res.status(200).json({ score, breakdown });
}

// ── AI Daily Top 10 ───────────────────────────────────────

const TOP10_TTL = 60 * 60 * 24; // 24h

interface WhyLabelResult { whyLabel: string }
const WHY_LABEL_SCHEMA = {
  type: 'OBJECT',
  properties: { whyLabel: { type: 'STRING' } },
  required: ['whyLabel'],
};
const isWhyLabelResult = (v: unknown): v is WhyLabelResult =>
  !!v && typeof v === 'object' && typeof (v as WhyLabelResult).whyLabel === 'string';

export async function getDailyTop10(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  await requireAiFeature(userId, 'dailyTop10');

  const cacheKey = RedisKeys.aiTop10(userId);
  const cached = await redis.get(cacheKey);
  if (cached) {
    const ttlSec = await redis.ttl(cacheKey);
    const refreshesAt = new Date(Date.now() + ttlSec * 1000).toISOString();
    return res.status(200).json({ ...JSON.parse(cached), refreshesAt }) as unknown as void;
  }

  // Fetch viewer profile for compatibility scoring
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      lookingFor: true, datingIntentions: true, interests: true, tribes: true,
      relationshipStatus: true, whereWeCanMeet: true,
      wantToSee: true, gender: true,
    },
  });
  if (!me) throw Errors.notFound();

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Fetch 50 candidates applying standard grid filters
  const candidates = await prisma.user.findMany({
    where: {
      id: { not: userId },
      phoneVerified: true,
      isOnGrid: true,
      incognitoMode: false,
      pauseIncomingMessages: false,
      lastActiveAt: { gte: fourteenDaysAgo },
      settings: { discoverable: true },
    },
    select: {
      id: true, firstName: true, age: true, bio: true, plan: true,
      lookingFor: true, datingIntentions: true, interests: true, tribes: true,
      relationshipStatus: true, whereWeCanMeet: true, isVerified: true,
      photos: { where: { isPrimary: true, isPrivate: false }, take: 1, select: { url: true } },
    },
    take: 50,
    orderBy: { lastActiveAt: 'desc' },
  });

  // Score and rank
  const myProfile: UserProfile = {
    lookingFor: (me.lookingFor ?? []) as string[],
    datingIntentions: (me.datingIntentions ?? []) as string[],
    interests: me.interests ?? [],
    tribes: me.tribes ?? [],
    relationshipStatus: me.relationshipStatus ?? null,
    whereWeCanMeet: (me.whereWeCanMeet ?? []) as string[],
  };

  const scored = candidates.map((c) => ({
    ...c,
    score: compatibilityScore(myProfile, {
      lookingFor: (c.lookingFor ?? []) as string[],
      datingIntentions: (c.datingIntentions ?? []) as string[],
      interests: c.interests ?? [],
      tribes: c.tribes ?? [],
      relationshipStatus: c.relationshipStatus ?? null,
      whereWeCanMeet: (c.whereWeCanMeet ?? []) as string[],
    }),
  })).sort((a, b) => b.score - a.score).slice(0, 10);

  // Generate "why" labels for top 3 only
  const whyLabels: Record<string, string> = {};
  const top3 = scored.slice(0, 3);
  await Promise.all(top3.map(async (c) => {
    try {
      const system = 'In under 10 words, explain why these two people might connect well.';
      const userMsg = `${me.interests?.slice(0, 3).join(', ') || 'unknown interests'} | ${c.interests?.slice(0, 3).join(', ') || 'unknown interests'}`;
      const parsed = await callGeminiJson(system, userMsg, WHY_LABEL_SCHEMA, isWhyLabelResult);
      whyLabels[c.id] = parsed.whyLabel.trim().replace(/^["']|["']$/g, '').slice(0, 60);
    } catch (err) {
      console.error('[ai] top-10 why-label Gemini call failed', err);
      // skip — whyLabel stays null for this candidate
    }
  }));

  const profiles = scored.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    age: c.age,
    isVerified: c.isVerified,
    plan: c.plan !== 'free' ? c.plan : null,
    profilePhoto: c.photos[0]?.url ?? null,
    compatibilityScore: c.score,
    whyLabel: whyLabels[c.id] ?? null,
  }));

  const payload = { profiles };
  await redis.set(cacheKey, JSON.stringify(payload), 'EX', TOP10_TTL);

  const refreshesAt = new Date(Date.now() + TOP10_TTL * 1000).toISOString();
  res.status(200).json({ ...payload, refreshesAt });
}

// ── AI Profile Optimizer ──────────────────────────────────

export async function getProfileOptimizer(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  await requireAiFeature(userId, 'profileOptimizer');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true, age: true, bio: true, interests: true, lookingFor: true,
      datingIntentions: true, tribes: true, tags: true, profileCompletenessScore: true,
      photos: { where: { isPrivate: false }, select: { id: true }, take: 10 },
      prompts: { select: { prompt: true, answer: true }, take: 6 },
    },
  });
  if (!user) throw Errors.notFound();

  const profileSummary = {
    firstName: user.firstName,
    age: user.age,
    bio: user.bio,
    interests: user.interests,
    lookingFor: user.lookingFor,
    datingIntentions: user.datingIntentions,
    photoCount: user.photos.length,
    promptCount: user.prompts.length,
    prompts: user.prompts,
  };

  const system = `You are a dating profile coach. Analyze this profile and return specific, actionable improvements.
Respond ONLY with JSON: { "profileScore": number (0-100), "suggestions": [{"section": string, "issue": string, "recommendation": string}] }
Sections: bio, photos, interests, lookingFor, prompts.
Be specific and encouraging. Max 5 suggestions.`;

  const userMsg = `Profile: ${JSON.stringify(profileSummary)}`;

  interface OptimizerResult {
    profileScore: number;
    suggestions: Array<{ section: string; issue: string; recommendation: string }>;
  }

  let result: OptimizerResult;
  try {
    const raw = await callClaude(system, userMsg);
    result = safeParseJson<OptimizerResult>(raw, {
      profileScore: Math.round(user.profileCompletenessScore),
      suggestions: [],
    });
  } catch {
    result = { profileScore: Math.round(user.profileCompletenessScore), suggestions: [] };
  }

  res.status(200).json(result);
}
