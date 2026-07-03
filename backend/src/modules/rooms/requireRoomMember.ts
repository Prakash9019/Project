import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { HttpError } from '../../utils/httpError';
import type { RoomMember } from '@prisma/client';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      roomMember?: RoomMember;
    }
  }
}

/**
 * Ensures the authenticated user is a member of :roomId. Attaches req.roomMember.
 * Responds 403 `not_a_room_member` otherwise. Must run after requireAuth.
 */
export async function requireRoomMember(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = req.user!.sub;
  const roomId = req.params.roomId;
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!member) {
    return next(new HttpError(403, 'not_a_room_member', 'You must join this room first'));
  }
  req.roomMember = member;
  next();
}
