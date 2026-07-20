import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { Errors, HttpError } from '../../utils/httpError';
import { callFlags } from '../../utils/callFlags';
import { isBlocked } from '../../utils/blocks';
import { generateAgoraToken, makeChannelName } from '../../adapters/agora';
import { emitToUser } from '../../realtime/emitter';
import { sendTypedPush, isMuted } from '../../services/push';
import { callWatchdogQueue, scheduledCallQueue } from '../../jobs/queue';

// ── Schemas ──────────────────────────────────────────────

export const callHistoryQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const initiateCallSchema = z.object({
  conversationId: z.string().uuid(),
  type: z.enum(['audio', 'video']),
});

export const updateCallSchema = z.object({
  status: z.enum(['answered', 'declined', 'ended', 'missed']),
  endReason: z.enum(['normal', 'timeout', 'no_answer', 'error', 'time_limit_reached']).optional(),
});

export const scheduleCallSchema = z.object({
  conversationId: z.string().uuid(),
  type: z.enum(['audio', 'video']),
  scheduledAt: z.string().datetime(),
});

// ── Helpers ──────────────────────────────────────────────

/** Check if free-tier user's daily call minutes are exhausted. */
async function checkFreeCallLimit(
  userId: string,
  type: 'audio' | 'video',
  plan: string,
): Promise<void> {
  if (plan !== 'free') return; // paid users have no limit

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyAudioMinutesUsed: true, dailyVideoMinutesUsed: true, dailyCallMinutesResetDate: true },
  });
  if (!user) return;

  // Reset counters if last reset was before today UTC
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const needsReset = !user.dailyCallMinutesResetDate || user.dailyCallMinutesResetDate < today;
  if (needsReset) {
    await prisma.user.update({
      where: { id: userId },
      data: { dailyAudioMinutesUsed: 0, dailyVideoMinutesUsed: 0, dailyCallMinutesResetDate: today },
    });
    return; // just reset — usage is 0
  }

  // Check active top-up add-ons
  const topupAddOnType = type === 'audio' ? 'audio_call_topup' : 'video_call_topup';
  const topups = await prisma.addOnPurchase.findMany({
    where: { userId, addOnType: topupAddOnType, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { audioMinutesAdded: true, videoMinutesAdded: true },
  });

  const addOnMinutes = topups.reduce((sum, t) => {
    const v = type === 'audio' ? t.audioMinutesAdded : t.videoMinutesAdded;
    return sum + (v ?? 0);
  }, 0);

  const baseLimit = type === 'audio' ? env.calls.freeTierAudioMinPerDay : env.calls.freeTierVideoMinPerDay;
  const effectiveLimit = baseLimit + addOnMinutes;
  const used = type === 'audio' ? user.dailyAudioMinutesUsed : user.dailyVideoMinutesUsed;

  if (used >= effectiveLimit) {
    throw new HttpError(402, 'daily_call_limit_reached',
      `Daily ${type} call limit reached. Upgrade or purchase a top-up to continue.`,
      { limitMinutes: effectiveLimit, usedMinutes: used },
    );
  }
}

/** Schedule the server-side call watchdog to end a free-tier call when time runs out. */
async function scheduleCallWatchdog(
  callId: string,
  callerId: string,
  calleeId: string,
  type: 'audio' | 'video',
  plan: string,
): Promise<string | null> {
  if (plan !== 'free') return null;

  const user = await prisma.user.findUnique({
    where: { id: callerId },
    select: { dailyAudioMinutesUsed: true, dailyVideoMinutesUsed: true },
  });
  if (!user) return null;

  const baseLimit = type === 'audio' ? env.calls.freeTierAudioMinPerDay : env.calls.freeTierVideoMinPerDay;
  const used = type === 'audio' ? user.dailyAudioMinutesUsed : user.dailyVideoMinutesUsed;
  const remainingMs = (baseLimit - used) * 60 * 1000;
  if (remainingMs <= 0) return null;

  const job = await callWatchdogQueue.add(
    { callId, callerId, calleeId, type },
    { delay: remainingMs, jobId: `watchdog-${callId}` },
  );
  return String(job.id);
}

/** Cancel a call watchdog job if it exists. */
async function cancelCallWatchdog(callId: string): Promise<void> {
  const job = await callWatchdogQueue.getJob(`watchdog-${callId}`).catch(() => null);
  if (job) await job.remove().catch(() => {});
}

// ── Handlers ─────────────────────────────────────────────

/** POST /api/v1/calls — initiate an audio or video call. */
export async function initiateCall(req: Request, res: Response): Promise<void> {
  const callerId = req.user!.sub;
  const { conversationId, type } = req.body as z.infer<typeof initiateCallSchema>;

  // 1. Verify participant
  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!convo || (convo.userAId !== callerId && convo.userBId !== callerId)) {
    throw Errors.notFound('Conversation not found');
  }

  const calleeId = convo.userAId === callerId ? convo.userBId : convo.userAId;

  // 2. Block check
  if (await isBlocked(callerId, calleeId)) {
    throw Errors.forbidden('You cannot call this user');
  }

  // 3. v3 call gate — calls enabled only when other party has replied
  const flags = callFlags(convo, callerId);
  if (!flags.audioCallEnabled) {
    throw new HttpError(
      403,
      'calls_not_yet_enabled',
      'Calls will be enabled after the other person replies to your message at least once.',
    );
  }

  // 3b. Callee availability toggle — they may have turned off audio/video calls.
  const calleeAvailability = await prisma.user.findUnique({
    where: { id: calleeId },
    select: { audioCallAvailable: true, videoCallAvailable: true },
  });
  if (type === 'audio' && calleeAvailability?.audioCallAvailable === false) {
    throw new HttpError(403, 'calls_disabled', 'This person is not accepting audio calls right now.');
  }
  if (type === 'video' && calleeAvailability?.videoCallAvailable === false) {
    throw new HttpError(403, 'calls_disabled', 'This person is not accepting video calls right now.');
  }

  // 4. Free-tier daily call minute check
  const plan = req.effectiveLimits?.plan ?? 'free';
  await checkFreeCallLimit(callerId, type, plan);

  // 5. Generate Agora channel + token (AGORA_APP_CERTIFICATE stays server-side)
  const agoraChannelName = makeChannelName(conversationId);
  const agoraToken = generateAgoraToken(agoraChannelName);

  // 6. Create Call record
  const call = await prisma.call.create({
    data: { callerId, calleeId, conversationId, type, status: 'initiated', agoraChannelName, agoraToken },
    include: {
      caller: { select: { firstName: true, name: true, photos: { where: { isPrimary: true }, take: 1 } } },
    },
  });

  // 7. Emit call:invite to callee
  const callerPhoto = call.caller.photos[0]?.url ?? null;
  emitToUser(calleeId, 'call:invite', {
    callId: call.id,
    callerId,
    callerName: call.caller.firstName ?? call.caller.name,
    callerPhoto,
    type,
    agoraChannelName,
    agoraToken,
  });

  // 8. Schedule watchdog for free-tier callers
  await scheduleCallWatchdog(call.id, callerId, calleeId, type, plan).catch(() => {});

  res.status(201).json({
    id: call.id,
    agoraChannelName,
    agoraToken,
    type: call.type,
    calleeId,
  });
}

/** PATCH /api/v1/calls/:callId — update call status. */
export async function updateCall(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { callId } = req.params;
  const { status, endReason } = req.body as z.infer<typeof updateCallSchema>;

  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
    throw Errors.notFound('Call not found');
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { status };

  if (status === 'answered') {
    updateData.answeredAt = now;
  }

  if (status === 'declined') {
    updateData.endedAt = now;
    // Notify caller that callee declined
    emitToUser(call.callerId, 'call:decline', { callId });
  }

  if (status === 'ended') {
    updateData.endedAt = now;
    if (endReason) updateData.endReason = endReason;

    if (call.answeredAt) {
      const durationSeconds = Math.round((now.getTime() - new Date(call.answeredAt).getTime()) / 1000);
      updateData.durationSeconds = durationSeconds;
      updateData.durationSec = durationSeconds;

      // Deduct free-tier call minutes
      const plan = req.effectiveLimits?.plan ?? 'free';
      if (plan === 'free') {
        const minutesUsed = Math.ceil(durationSeconds / 60);
        const field = call.type === 'audio' ? 'dailyAudioMinutesUsed' : 'dailyVideoMinutesUsed';
        await prisma.user.updateMany({
          where: { id: call.callerId, plan: 'free' },
          data: { [field]: { increment: minutesUsed } },
        });
      }
    }

    // Cancel watchdog (call ended normally)
    await cancelCallWatchdog(callId);

    // Notify both parties
    const durationSec = call.answeredAt
      ? Math.round((now.getTime() - new Date(call.answeredAt).getTime()) / 1000)
      : null;
    const endPayload = { callId, durationSec, endReason: endReason ?? 'normal' };
    emitToUser(call.callerId, 'call:end', endPayload);
    emitToUser(call.calleeId, 'call:end', endPayload);
  }

  if (status === 'missed') {
    updateData.endedAt = now;
    // Notify the callee that they missed a call ("X called you"). Skip if muted.
    const caller = await prisma.user.findUnique({
      where: { id: call.callerId },
      select: { firstName: true, name: true },
    });
    const callerName = caller?.firstName ?? caller?.name ?? 'Someone';
    isMuted(call.calleeId, call.callerId).then((muted) => {
      if (!muted && call.conversationId) {
        sendTypedPush(call.calleeId, {
          type: 'missed_call',
          conversationId: call.conversationId,
          callerName,
          callType: call.type as 'audio' | 'video',
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  const updated = await prisma.call.update({ where: { id: callId }, data: updateData });
  res.status(200).json({ id: updated.id, status: updated.status, durationSeconds: updated.durationSeconds ?? null });
}

/** POST /api/v1/calls/schedule — schedule a future call. */
export async function scheduleCall(req: Request, res: Response): Promise<void> {
  const callerId = req.user!.sub;
  const { conversationId, type, scheduledAt: scheduledAtStr } = req.body as z.infer<typeof scheduleCallSchema>;

  const scheduledAt = new Date(scheduledAtStr);
  const minSchedule = new Date(Date.now() + 5 * 60 * 1000);
  if (scheduledAt < minSchedule) {
    throw Errors.validation('Scheduled time must be at least 5 minutes in the future');
  }

  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!convo || (convo.userAId !== callerId && convo.userBId !== callerId)) {
    throw Errors.notFound('Conversation not found');
  }

  // Call gate must be open to schedule
  const flags = callFlags(convo, callerId);
  if (!flags.audioCallEnabled) {
    throw new HttpError(403, 'calls_not_yet_enabled',
      'Calls will be enabled after the other person replies to your message at least once.');
  }

  const calleeId = convo.userAId === callerId ? convo.userBId : convo.userAId;
  const call = await prisma.call.create({
    data: { callerId, calleeId, conversationId, type, status: 'initiated', scheduledAt },
  });

  // Enqueue notification job to fire 5 min before scheduled time
  const notifyAt = scheduledAt.getTime() - 5 * 60 * 1000;
  const delay = notifyAt - Date.now();
  if (delay > 0) {
    await scheduledCallQueue.add(
      { callId: call.id, callerId, calleeId, type },
      { delay, jobId: `scheduled-${call.id}` },
    ).catch(() => {});
  }

  res.status(201).json({ id: call.id, scheduledAt: call.scheduledAt });
}

/** GET /api/v1/calls — recent call history. */
export async function callHistory(req: Request, res: Response): Promise<void> {
  const { limit, offset } = req.query as unknown as z.infer<typeof callHistoryQuerySchema>;
  const userId = req.user!.sub;

  const calls = await prisma.call.findMany({
    where: { OR: [{ callerId: userId }, { calleeId: userId }] },
    orderBy: { startedAt: 'desc' },
    skip: offset,
    take: limit,
    include: {
      caller: { select: { id: true, name: true, firstName: true, photos: { where: { isPrimary: true }, take: 1 } } },
      callee: { select: { id: true, name: true, firstName: true, photos: { where: { isPrimary: true }, take: 1 } } },
    },
  });

  res.status(200).json({
    calls: calls.map((c) => {
      const isOutgoing = c.callerId === userId;
      const peer = isOutgoing ? c.callee : c.caller;
      return {
        id: c.id,
        type: c.type,
        status: c.status,
        direction: isOutgoing ? 'outgoing' : 'incoming',
        durationSeconds: c.durationSeconds ?? c.durationSec ?? null,
        startedAt: c.startedAt,
        answeredAt: c.answeredAt,
        endedAt: c.endedAt,
        endReason: c.endReason ?? null,
        peer: { id: peer.id, firstName: peer.firstName, name: peer.name, profilePhoto: peer.photos[0]?.url ?? null },
      };
    }),
  });
}

/**
 * Coturn `use-auth-secret` (TURN REST API) ephemeral credential.
 * username = "<unix-expiry>:<userId>", credential = base64(HMAC-SHA1(secret, username)).
 */
function makeTurnCredential(userId: string): { username: string; credential: string } {
  const expiry = Math.floor(Date.now() / 1000) + env.webrtc.turnTtlSeconds;
  const username = `${expiry}:${userId}`;
  const credential = crypto
    .createHmac('sha1', env.webrtc.turnSecret)
    .update(username)
    .digest('base64');
  return { username, credential };
}

/** GET /api/v1/calls/ice-config — STUN/TURN config (legacy WebRTC). */
export async function iceConfig(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;

  let turnServer: { urls: string; username: string; credential: string } | null = null;
  if (env.webrtc.turnUrl) {
    if (env.webrtc.turnSecret) {
      // Production: derive short-lived credentials per client from the shared secret.
      turnServer = { urls: env.webrtc.turnUrl, ...makeTurnCredential(userId) };
    } else if (env.webrtc.turnUsername && env.webrtc.turnCredential) {
      // Legacy fallback: static long-term credentials.
      turnServer = {
        urls: env.webrtc.turnUrl,
        username: env.webrtc.turnUsername,
        credential: env.webrtc.turnCredential,
      };
    }
  }

  const iceServers = [
    { urls: env.webrtc.stunUrls },
    ...(turnServer ? [turnServer] : []),
  ];
  res.status(200).json({ iceServers });
}
