import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { Errors } from '../../utils/httpError';
import { emitToUser } from '../../realtime/emitter';
import { checkRepeatOffender } from '../../services/repeatOffender';
import { uuidParam } from '../../utils/validators';
import { invalidateBlockedIds } from '../../utils/blocks';

// ── Schemas ───────────────────────────────────────────────

export const userIdParamSchema = z.object({ userId: z.string().uuid() });

export const reportSchema = z.object({
  reason: z.enum(['spam', 'harassment', 'fake_profile', 'inappropriate_content', 'lgbtq_hate', 'other']),
  details: z.string().max(500).optional(),
});

// ── Helpers ───────────────────────────────────────────────

function stableIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ── Block ─────────────────────────────────────────────────

export async function block(req: Request, res: Response): Promise<void> {
  const blockerId = req.user!.sub;
  const parsedBlockedId = uuidParam.safeParse(req.params.userId);
  if (!parsedBlockedId.success) { res.status(400).json({ error: 'validation_error', message: 'Invalid ID format' }); return; }
  const blockedId = parsedBlockedId.data;
  if (blockerId === blockedId) throw Errors.badRequest('Cannot block yourself');

  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    update: {},
    create: { blockerId, blockedId },
  });

  // Hide conversation for both parties immediately
  const [userAId, userBId] = stableIds(blockerId, blockedId);
  await prisma.conversation.updateMany({
    where: { userAId, userBId },
    data: { aIsHidden: true, bIsHidden: true },
  });

  // Terminate any active call between them — emit call:end to both
  const activeCall = await prisma.call.findFirst({
    where: {
      OR: [
        { callerId: blockerId, calleeId: blockedId },
        { callerId: blockedId, calleeId: blockerId },
      ],
      status: { in: ['ringing', 'accepted', 'ongoing'] },
    },
    select: { id: true, callerId: true, calleeId: true },
  });

  if (activeCall) {
    await prisma.call.update({
      where: { id: activeCall.id },
      data: { status: 'ended', endedAt: new Date(), endReason: 'blocked' },
    });
    const callPayload = { callId: activeCall.id, endReason: 'blocked' };
    emitToUser(activeCall.callerId, 'call:end', callPayload);
    emitToUser(activeCall.calleeId, 'call:end', callPayload);
  }

  // Invalidate blocked IDs cache for both parties
  await Promise.all([
    invalidateBlockedIds(blockerId),
    invalidateBlockedIds(blockedId),
  ]);

  res.status(201).json({ ok: true });
}

// ── Unblock ───────────────────────────────────────────────

export async function unblock(req: Request, res: Response): Promise<void> {
  const blockerId = req.user!.sub;
  const parsedBlockedId = uuidParam.safeParse(req.params.userId);
  if (!parsedBlockedId.success) { res.status(400).json({ error: 'validation_error', message: 'Invalid ID format' }); return; }
  const blockedId = parsedBlockedId.data;
  await prisma.block.deleteMany({ where: { blockerId, blockedId } });

  // Restore conversation visibility
  const [userAId, userBId] = stableIds(blockerId, blockedId);
  await prisma.conversation.updateMany({
    where: { userAId, userBId },
    data: { aIsHidden: false, bIsHidden: false },
  });

  // Invalidate blocked IDs cache for both parties
  await Promise.all([
    invalidateBlockedIds(blockerId),
    invalidateBlockedIds(blockedId),
  ]);

  res.status(204).send();
}

// ── List blocks ───────────────────────────────────────────

export async function listBlocks(req: Request, res: Response): Promise<void> {
  const blocks = await prisma.block.findMany({
    where: { blockerId: req.user!.sub },
    select: { blockedId: true, createdAt: true },
  });
  res.status(200).json({ blocked: blocks });
}

// ── Mute / unmute ─────────────────────────────────────────

export async function mute(req: Request, res: Response): Promise<void> {
  const muterId = req.user!.sub;
  const parsedMutedId = uuidParam.safeParse(req.params.userId);
  if (!parsedMutedId.success) { res.status(400).json({ error: 'validation_error', message: 'Invalid ID format' }); return; }
  const mutedId = parsedMutedId.data;
  if (muterId === mutedId) throw Errors.badRequest('Cannot mute yourself');

  await prisma.mute.upsert({
    where: { muterId_mutedId: { muterId, mutedId } },
    update: {},
    create: { muterId, mutedId },
  });
  res.status(201).json({ ok: true });
}

export async function unmute(req: Request, res: Response): Promise<void> {
  const muterId = req.user!.sub;
  const parsedMutedId = uuidParam.safeParse(req.params.userId);
  if (!parsedMutedId.success) { res.status(400).json({ error: 'validation_error', message: 'Invalid ID format' }); return; }
  const mutedId = parsedMutedId.data;
  await prisma.mute.deleteMany({ where: { muterId, mutedId } });
  res.status(204).send();
}

export async function listMutes(req: Request, res: Response): Promise<void> {
  const mutes = await prisma.mute.findMany({
    where: { muterId: req.user!.sub },
    select: { mutedId: true, createdAt: true },
  });
  res.status(200).json({ muted: mutes });
}

// ── Report ────────────────────────────────────────────────

const LGBTQ_HATE_PRIORITY_TTL = 60 * 60 * 24 * 7; // 7 days in Redis

export async function report(req: Request, res: Response): Promise<void> {
  const reporterId = req.user!.sub;
  const parsedReportedId = uuidParam.safeParse(req.params.userId);
  if (!parsedReportedId.success) { res.status(400).json({ error: 'validation_error', message: 'Invalid ID format' }); return; }
  const reportedId = parsedReportedId.data;
  const { reason, details } = req.body as z.infer<typeof reportSchema>;
  if (reporterId === reportedId) throw Errors.badRequest('Cannot report yourself');

  const newReport = await prisma.report.create({
    data: { reporterId, reportedId, reason, details },
  });

  // Create a ModerationFlag for audit trail
  await prisma.moderationFlag.create({
    data: {
      targetType: 'user',
      targetId: reportedId,
      flagType: reason === 'lgbtq_hate' ? 'anti_lgbtq' : 'hate_speech',
      status: 'pending',
    },
  });

  // lgbtq_hate gets priority queue signal in Redis (admins can read this)
  if (reason === 'lgbtq_hate') {
    await redis.zadd('modqueue:priority', Date.now(), `${newReport.id}:${reportedId}`);
    await redis.expire('modqueue:priority', LGBTQ_HATE_PRIORITY_TTL);
  }

  // Trigger async repeat-offender check (fire-and-forget)
  checkRepeatOffender(reportedId).catch(() => {});

  res.status(201).json({ ok: true });
}

// ── Panic hide ────────────────────────────────────────────

export async function panicHide(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  await prisma.user.update({
    where: { id: userId },
    data: {
      isOnGrid: false,
      pauseIncomingMessages: true,
    },
  });
  // Also remove from Redis geo index so they stop appearing in discovery immediately
  await redis.zrem(RedisKeys.geoUsers, userId);
  res.status(200).json({ ok: true });
}
