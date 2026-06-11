import Bull from 'bull';
import { prisma } from '../config/prisma';
import { emitToUser } from '../realtime/emitter';
import { callWatchdogQueue, scheduledCallQueue, dailyResetQueue, subscriptionExpiryQueue, CallWatchdogJob, ScheduledCallJob } from './queue';

// ── Call watchdog — end free-tier call when daily limit reached ──────────────

callWatchdogQueue.process(async (job: Bull.Job<CallWatchdogJob>) => {
  const { callId, callerId, calleeId } = job.data;

  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || call.status === 'ended' || call.status === 'declined' || call.status === 'missed') {
    return; // already finished
  }

  const now = new Date();
  const durationSeconds = call.answeredAt
    ? Math.round((now.getTime() - call.answeredAt.getTime()) / 1000)
    : 0;

  await prisma.call.update({
    where: { id: callId },
    data: { status: 'ended', endedAt: now, endReason: 'time_limit_reached', durationSeconds, durationSec: durationSeconds },
  });

  const payload = { callId, durationSec: durationSeconds, endReason: 'time_limit_reached' };
  emitToUser(callerId, 'call:end', payload);
  emitToUser(calleeId, 'call:end', payload);
});

// ── Scheduled call notification — fire 5 min before scheduled time ──────────

scheduledCallQueue.process(async (job: Bull.Job<ScheduledCallJob>) => {
  const { callerId, calleeId, type, callId } = job.data;
  // Fire push notifications to both parties
  // FCM integration can be added here — emit socket event as fallback
  const payload = { callId, type, message: 'Your scheduled call starts in 5 minutes' };
  emitToUser(callerId, 'call:reminder', payload);
  emitToUser(calleeId, 'call:reminder', payload);
});

// ── Daily reset — reset free-tier call minutes at UTC midnight ───────────────

dailyResetQueue.process(async () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await prisma.user.updateMany({
    where: { plan: 'free' },
    data: { dailyAudioMinutesUsed: 0, dailyVideoMinutesUsed: 0, dailyCallMinutesResetDate: today },
  });
});

// ── Subscription expiry — downgrade expired plans at 01:00 UTC ──────────────

subscriptionExpiryQueue.process(async () => {
  const now = new Date();

  // Downgrade users whose paid plan has expired
  await prisma.user.updateMany({
    where: {
      plan: { not: 'free' },
      planExpiresAt: { lt: now, not: null },
    },
    data: { plan: 'free', planExpiresAt: null },
  });

  // Mark subscriptions as inactive
  await prisma.subscription.updateMany({
    where: { active: true, expiresAt: { lt: now } },
    data: { active: false },
  });

  // Unpin chats for newly-downgraded users (free allows 0 pins)
  // Reset all pins for users now on free plan
  await prisma.conversation.updateMany({
    where: {
      OR: [
        { userA: { plan: 'free' }, aPinned: true },
        { userB: { plan: 'free' }, bPinned: true },
      ],
    },
    data: { aPinned: false, bPinned: false },
  });
});

export function startProcessors(): void {
  // Processors are registered by importing this module
}
