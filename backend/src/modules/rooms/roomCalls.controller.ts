import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { Errors, HttpError } from '../../utils/httpError';
import { generateAgoraToken, makeChannelName } from '../../adapters/agora';
import { emitToRoom } from '../../realtime/emitter';

// Group (Dating Room) audio/video calling — extends the existing 1:1
// Call/Agora architecture to rooms. Authorization is membership-only
// (requireRoomMember, applied at the route level), matching how room chat
// itself is gated — Dating Rooms have no block-based restriction between
// members today, so calls don't add one either.

export const initiateRoomCallSchema = z.object({
  type: z.enum(['audio', 'video']),
});

export const updateRoomCallSchema = z.object({
  action: z.enum(['leave', 'end']),
});

const CALLER_SELECT = {
  id: true,
  firstName: true,
  name: true,
  photos: { where: { isPrimary: true }, take: 1 },
} as const;

function participantCard(user: { id: string; firstName: string | null; name: string | null; photos: { url: string }[] }) {
  return {
    id: user.id,
    name: user.firstName ?? user.name,
    photo: user.photos[0]?.url ?? null,
  };
}

/** POST /api/rooms/:roomId/calls — start a group call, or join the room's already-active call. */
export async function initiateRoomCall(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { roomId } = req.params;
  const { type } = req.body as z.infer<typeof initiateRoomCallSchema>;

  const existing = await prisma.roomCall.findFirst({
    where: { roomId, status: 'ongoing' },
    include: { initiator: { select: CALLER_SELECT } },
  });

  if (existing) {
    // A call is already live in this room — treat this as a join, not a new invite.
    await prisma.roomCallParticipant.upsert({
      where: { callId_userId: { callId: existing.id, userId } },
      update: { leftAt: null },
      create: { callId: existing.id, userId },
    });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: CALLER_SELECT });
    if (user) emitToRoom(roomId, 'room:call.participant_joined', { callId: existing.id, participant: participantCard(user) });

    res.status(200).json({
      id: existing.id,
      roomId,
      type: existing.type,
      agoraChannelName: existing.agoraChannelName,
      agoraToken: existing.agoraToken,
      initiatorId: existing.initiatorId,
    });
    return;
  }

  const agoraChannelName = makeChannelName(`room-${roomId}`);
  const agoraToken = generateAgoraToken(agoraChannelName);

  const call = await prisma.roomCall.create({
    data: {
      roomId,
      initiatorId: userId,
      type,
      agoraChannelName,
      agoraToken,
      participants: { create: { userId } },
    },
    include: { initiator: { select: CALLER_SELECT } },
  });

  emitToRoom(roomId, 'room:call.invite', {
    callId: call.id,
    roomId,
    initiatorId: userId,
    initiatorName: call.initiator.firstName ?? call.initiator.name,
    initiatorPhoto: call.initiator.photos[0]?.url ?? null,
    type,
    agoraChannelName,
    agoraToken,
  });

  res.status(201).json({
    id: call.id,
    roomId,
    type: call.type,
    agoraChannelName,
    agoraToken,
    initiatorId: userId,
  });
}

/** POST /api/rooms/:roomId/calls/:callId/join — join an already-active group call. */
export async function joinRoomCall(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { roomId, callId } = req.params;

  const call = await prisma.roomCall.findUnique({ where: { id: callId } });
  if (!call || call.roomId !== roomId) throw Errors.notFound('Call not found');
  if (call.status !== 'ongoing') throw new HttpError(410, 'call_ended', 'This call has already ended');

  await prisma.roomCallParticipant.upsert({
    where: { callId_userId: { callId, userId } },
    update: { leftAt: null },
    create: { callId, userId },
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: CALLER_SELECT });
  if (user) emitToRoom(roomId, 'room:call.participant_joined', { callId, participant: participantCard(user) });

  res.status(200).json({
    id: call.id,
    roomId,
    type: call.type,
    agoraChannelName: call.agoraChannelName,
    agoraToken: call.agoraToken,
    initiatorId: call.initiatorId,
  });
}

/** GET /api/rooms/:roomId/calls/active — the room's currently-live call, if any (for late joiners). */
export async function getActiveRoomCall(req: Request, res: Response): Promise<void> {
  const { roomId } = req.params;
  const call = await prisma.roomCall.findFirst({
    where: { roomId, status: 'ongoing' },
    include: {
      initiator: { select: CALLER_SELECT },
      participants: {
        where: { leftAt: null },
        include: { user: { select: CALLER_SELECT } },
      },
    },
  });

  if (!call) {
    res.status(200).json({ call: null });
    return;
  }

  res.status(200).json({
    call: {
      id: call.id,
      roomId,
      type: call.type,
      agoraChannelName: call.agoraChannelName,
      agoraToken: call.agoraToken,
      initiatorId: call.initiatorId,
      startedAt: call.startedAt,
      participants: call.participants.map((p) => participantCard(p.user)),
    },
  });
}

/** PATCH /api/rooms/:roomId/calls/:callId — leave, or (initiator only) end, a group call. */
export async function updateRoomCall(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { roomId, callId } = req.params;
  const { action } = req.body as z.infer<typeof updateRoomCallSchema>;

  const call = await prisma.roomCall.findUnique({ where: { id: callId } });
  if (!call || call.roomId !== roomId) throw Errors.notFound('Call not found');
  if (call.status !== 'ongoing') {
    res.status(200).json({ id: call.id, status: call.status });
    return;
  }

  if (action === 'end') {
    if (call.initiatorId !== userId) {
      throw Errors.forbidden('Only the call initiator can end the call for everyone');
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.roomCall.update({ where: { id: callId }, data: { status: 'ended', endedAt: now, endReason: 'ended_by_host' } }),
      prisma.roomCallParticipant.updateMany({ where: { callId, leftAt: null }, data: { leftAt: now } }),
    ]);
    emitToRoom(roomId, 'room:call.end', { callId, endReason: 'ended_by_host' });
    res.status(200).json({ id: callId, status: 'ended' });
    return;
  }

  // action === 'leave'
  const now = new Date();
  await prisma.roomCallParticipant.updateMany({ where: { callId, userId, leftAt: null }, data: { leftAt: now } });
  emitToRoom(roomId, 'room:call.participant_left', { callId, userId });

  const remaining = await prisma.roomCallParticipant.count({ where: { callId, leftAt: null } });
  if (remaining === 0) {
    await prisma.roomCall.update({ where: { id: callId }, data: { status: 'ended', endedAt: now, endReason: 'all_left' } });
    emitToRoom(roomId, 'room:call.end', { callId, endReason: 'all_left' });
    res.status(200).json({ id: callId, status: 'ended' });
    return;
  }

  res.status(200).json({ id: callId, status: 'ongoing' });
}
