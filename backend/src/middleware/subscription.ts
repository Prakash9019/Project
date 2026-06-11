import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';

export type EffectivePlan = 'free' | 'premium' | 'gold' | 'platinum';

export interface EffectiveLimits {
  plan: EffectivePlan;
  bioChars: number;
  gridProfiles: number | null;    // null = unlimited
  interactionCap: number | null;  // null = unlimited
  pinChats: number;
  messageTemplates: number;
  albums: { maxAlbums: number | null; maxPhotosPerAlbum: number };
  callAudioMinPerDay: number | null;
  callVideoMinPerDay: number | null;
  expiringPhotosPerDay: number | null;
  voiceClipSec: number | null;
  videoClipSec: number | null;
  readReceipts: boolean;
  typingIndicator: boolean;
  incognitoMode: boolean;
  travelMode: boolean;
  whoViewedMe: boolean;
  aiFeatures: boolean;
  exploreAccess: boolean;
  callHistoryAccess: boolean;
  profileViewsAccess: boolean;
}

type PlanLimitsMap = Record<EffectivePlan, Omit<EffectiveLimits, 'plan'>>;

const PLAN_LIMITS: PlanLimitsMap = {
  free: {
    bioChars: 150,
    gridProfiles: 100,
    interactionCap: 20,
    pinChats: 0,
    messageTemplates: 0,
    albums: { maxAlbums: 1, maxPhotosPerAlbum: 10 },
    callAudioMinPerDay: 5,
    callVideoMinPerDay: 2,
    expiringPhotosPerDay: 5,
    voiceClipSec: null,
    videoClipSec: null,
    readReceipts: false,
    typingIndicator: false,
    incognitoMode: false,
    travelMode: false,
    whoViewedMe: false,
    aiFeatures: false,
    exploreAccess: false,
    callHistoryAccess: false,
    profileViewsAccess: false,
  },
  premium: {
    bioChars: 400,
    gridProfiles: 600,
    interactionCap: null,
    pinChats: 0,
    messageTemplates: 5,
    albums: { maxAlbums: 3, maxPhotosPerAlbum: 30 },
    callAudioMinPerDay: null,
    callVideoMinPerDay: null,
    expiringPhotosPerDay: 10,
    voiceClipSec: 30,
    videoClipSec: 15,
    readReceipts: true,
    typingIndicator: true,
    incognitoMode: false,
    travelMode: false,
    whoViewedMe: false,
    aiFeatures: false,
    exploreAccess: true,
    callHistoryAccess: false,
    profileViewsAccess: false,
  },
  gold: {
    bioChars: 600,
    gridProfiles: null,
    interactionCap: null,
    pinChats: 5,
    messageTemplates: 5,
    albums: { maxAlbums: 5, maxPhotosPerAlbum: 50 },
    callAudioMinPerDay: null,
    callVideoMinPerDay: null,
    expiringPhotosPerDay: null,
    voiceClipSec: 60,
    videoClipSec: 30,
    readReceipts: true,
    typingIndicator: true,
    incognitoMode: true,
    travelMode: true,
    whoViewedMe: true,
    aiFeatures: false,
    exploreAccess: true,
    callHistoryAccess: true,
    profileViewsAccess: true,
  },
  platinum: {
    bioChars: 600,
    gridProfiles: null,
    interactionCap: null,
    pinChats: 10,
    messageTemplates: 10,
    albums: { maxAlbums: null, maxPhotosPerAlbum: 100 },
    callAudioMinPerDay: null,
    callVideoMinPerDay: null,
    expiringPhotosPerDay: null,
    voiceClipSec: 60,
    videoClipSec: 30,
    readReceipts: true,
    typingIndicator: true,
    incognitoMode: true,
    travelMode: true,
    whoViewedMe: true,
    aiFeatures: true,
    exploreAccess: true,
    callHistoryAccess: true,
    profileViewsAccess: true,
  },
};

export function computeEffectiveLimits(plan: string, planExpiresAtUnix?: number | null): EffectiveLimits {
  // Lazy expiry eval: if JWT says plan expires in the past, treat as free
  let effectivePlan = plan;
  if (planExpiresAtUnix && planExpiresAtUnix * 1000 < Date.now()) {
    effectivePlan = 'free';
  }
  const p: EffectivePlan = (effectivePlan as EffectivePlan) in PLAN_LIMITS
    ? (effectivePlan as EffectivePlan)
    : 'free';
  return { plan: p, ...PLAN_LIMITS[p] };
}

/** Fire-and-forget: write plan downgrade to DB when JWT shows an expired plan. */
export function maybePersistExpiry(userId: string, jwtPlan: string, planExpiresAtUnix: number | null): void {
  if (!planExpiresAtUnix || planExpiresAtUnix * 1000 >= Date.now()) return;
  if (jwtPlan === 'free') return; // already free
  // Async write — do not block the request
  prisma.user.update({
    where: { id: userId },
    data: { plan: 'free', planExpiresAt: null },
  }).catch(() => {});
}

/** Attaches req.effectiveLimits after requireAuth. Reads plan from JWT claim; lazily evaluates expiry. */
export function attachEffectiveLimits(req: Request, _res: Response, next: NextFunction): void {
  if (req.user) {
    const claims = req.user as { plan?: string; planExpiresAt?: number | null; sub?: string };
    req.effectiveLimits = computeEffectiveLimits(claims.plan ?? 'free', claims.planExpiresAt);
    // If the plan expired per JWT timestamp, persist the downgrade in the background
    if (claims.sub && claims.plan && claims.planExpiresAt) {
      maybePersistExpiry(claims.sub, claims.plan, claims.planExpiresAt);
    }
  }
  next();
}

/** Throws 403 if user's effective plan is below required tier. */
export function requirePlan(...allowedPlans: EffectivePlan[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const plan = req.effectiveLimits?.plan ?? 'free';
    if (!allowedPlans.includes(plan as EffectivePlan)) {
      const err = Object.assign(new Error('This feature requires a higher plan'), {
        status: 403, code: 'plan_required', details: { required: allowedPlans, current: plan },
      });
      return next(err);
    }
    next();
  };
}
