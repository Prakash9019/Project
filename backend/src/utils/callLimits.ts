import { prisma } from '../config/prisma';
import { env } from '../config/env';

export interface CallLimits {
  audioMinutesUsed: number;
  audioMinutesLimit: number;
  videoMinutesUsed: number;
  videoMinutesLimit: number;
}

/**
 * Free-tier daily call-minute usage + limit (base + active top-up add-ons), for
 * the live in-call countdown. Returns null for paid plans (unlimited).
 * Read-only: mirrors checkFreeCallLimit's UTC-midnight reset without persisting.
 */
export async function getCallLimits(userId: string, plan: string): Promise<CallLimits | null> {
  if (plan !== 'free') return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      dailyAudioMinutesUsed: true,
      dailyVideoMinutesUsed: true,
      dailyCallMinutesResetDate: true,
    },
  });
  if (!user) return null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const stale = !user.dailyCallMinutesResetDate || user.dailyCallMinutesResetDate < today;
  const audioUsed = stale ? 0 : user.dailyAudioMinutesUsed;
  const videoUsed = stale ? 0 : user.dailyVideoMinutesUsed;

  const topups = await prisma.addOnPurchase.findMany({
    where: {
      userId,
      addOnType: { in: ['audio_call_topup', 'video_call_topup'] as never[] },
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { audioMinutesAdded: true, videoMinutesAdded: true },
  });
  const audioAdded = topups.reduce((s, t) => s + (t.audioMinutesAdded ?? 0), 0);
  const videoAdded = topups.reduce((s, t) => s + (t.videoMinutesAdded ?? 0), 0);

  return {
    audioMinutesUsed: audioUsed,
    audioMinutesLimit: env.calls.freeTierAudioMinPerDay + audioAdded,
    videoMinutesUsed: videoUsed,
    videoMinutesLimit: env.calls.freeTierVideoMinPerDay + videoAdded,
  };
}
