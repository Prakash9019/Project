import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { Errors } from '../../utils/httpError';

export const callHistoryQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/** GET /api/v1/calls — recent call history (both placed and received). */
export async function callHistory(req: Request, res: Response): Promise<void> {
  const { limit, offset } = req.query as unknown as z.infer<typeof callHistoryQuerySchema>;
  const userId = req.user!.sub;

  const calls = await prisma.call.findMany({
    where: { OR: [{ callerId: userId }, { calleeId: userId }] },
    orderBy: { startedAt: 'desc' },
    skip: offset,
    take: limit,
    include: {
      caller: { select: { id: true, name: true, photos: { where: { isPrimary: true }, take: 1 } } },
      callee: { select: { id: true, name: true, photos: { where: { isPrimary: true }, take: 1 } } },
    },
  });

  res.status(200).json({
    calls: calls.map((c) => ({
      id: c.id,
      type: c.type,
      status: c.status,
      direction: c.callerId === userId ? 'outgoing' : 'incoming',
      peer: c.callerId === userId ? c.callee : c.caller,
      startedAt: c.startedAt,
      answeredAt: c.answeredAt,
      endedAt: c.endedAt,
      durationSec: c.durationSec,
    })),
  });
}

/** GET /api/v1/calls/ice-config — STUN/TURN configuration for WebRTC clients. */
export async function iceConfig(_req: Request, res: Response): Promise<void> {
  const iceServers = [
    { urls: env.webrtc.stunUrls },
    ...(env.webrtc.turnUrl ? [{
      urls: env.webrtc.turnUrl,
      username: env.webrtc.turnUsername,
      credential: env.webrtc.turnCredential,
    }] : []),
  ];
  res.status(200).json({ iceServers });
}
