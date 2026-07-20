import { Request, Response } from 'express';
import * as svc from './rooms.service';
import type {
  ListRoomsQuery,
  ListJoinedQuery,
  ListMessagesQuery,
  ListMediaQuery,
  SendMessageBody,
  ReactBody,
  ListMembersQuery,
  UpdateRoomBody,
  PinMessageBody,
  UpdateMemberRoleBody,
  UpdateRoomPhotoBody,
  TransferOwnershipBody,
  CreateRoomBody,
  BulkAddMembersBody,
} from './rooms.schema';

export async function listRooms(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as ListRoomsQuery;
  const rooms = await svc.listRooms(req.user!.sub, {
    category: q.category,
    city: q.city,
    search: q.search,
    limit: q.limit,
    offset: q.offset,
  });
  res.status(200).json({ rooms });
}

export async function listJoined(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as ListJoinedQuery;
  const rooms = await svc.listJoinedRooms(req.user!.sub, { limit: q.limit, offset: q.offset });
  res.status(200).json({ rooms });
}

export async function createRoom(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateRoomBody;
  const room = await svc.createRoom(req.user!.sub, body);
  res.status(201).json({ room });
}

export async function bulkAddMembers(req: Request, res: Response): Promise<void> {
  const { userIds } = req.body as BulkAddMembersBody;
  const result = await svc.bulkAddMembers(req.user!.sub, req.params.roomId, userIds);
  res.status(200).json(result);
}

export async function getRoom(req: Request, res: Response): Promise<void> {
  const room = await svc.getRoomDetail(req.user!.sub, req.params.roomId);
  res.status(200).json({ room });
}

export async function joinRoom(req: Request, res: Response): Promise<void> {
  const room = await svc.joinRoom(req.user!.sub, req.params.roomId);
  res.status(200).json({ ok: true, room });
}

export async function getRoomByCode(req: Request, res: Response): Promise<void> {
  const room = await svc.getRoomByCode(req.user!.sub, req.params.code);
  res.status(200).json({ room });
}

export async function joinRoomByCode(req: Request, res: Response): Promise<void> {
  const room = await svc.joinRoomByCode(req.user!.sub, req.params.code);
  res.status(200).json({ ok: true, room });
}

export async function leaveRoom(req: Request, res: Response): Promise<void> {
  await svc.leaveRoom(req.user!.sub, req.params.roomId);
  res.status(204).send();
}

export async function inviteOrAddMember(req: Request, res: Response): Promise<void> {
  const result = await svc.inviteOrAddMember(req.user!.sub, req.params.roomId, req.params.userId);
  res.status(result.status).json(result.body);
}

export async function listInvites(req: Request, res: Response): Promise<void> {
  const result = await svc.listInvites(req.user!.sub);
  res.status(200).json(result);
}

export async function acceptInvite(req: Request, res: Response): Promise<void> {
  const result = await svc.acceptInvite(req.user!.sub, req.params.inviteId);
  res.status(200).json(result);
}

export async function declineInvite(req: Request, res: Response): Promise<void> {
  const result = await svc.declineInvite(req.user!.sub, req.params.inviteId);
  res.status(200).json(result);
}

export async function cancelInvite(req: Request, res: Response): Promise<void> {
  await svc.cancelInvite(req.user!.sub, req.params.inviteId);
  res.status(204).send();
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as ListMessagesQuery;
  const result = await svc.listMessages(req.user!.sub, req.params.roomId, { before: q.before, limit: q.limit });
  res.status(200).json(result);
}

export async function listMedia(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as ListMediaQuery;
  const result = await svc.listRoomMedia(req.user!.sub, req.params.roomId, {
    type: q.type,
    cursor: q.cursor,
    limit: q.limit,
  });
  res.status(200).json(result);
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const body = req.body as SendMessageBody;
  const message = await svc.sendMessage(req.user!.sub, req.params.roomId, body);
  res.status(201).json(message);
}

export async function reactToMessage(req: Request, res: Response): Promise<void> {
  const { emoji } = req.body as ReactBody;
  const result = await svc.toggleReaction(req.user!.sub, req.params.roomId, req.params.messageId, emoji);
  res.status(200).json(result);
}

export async function listMessageReactions(req: Request, res: Response): Promise<void> {
  const reactions = await svc.listMessageReactions(req.user!.sub, req.params.roomId, req.params.messageId);
  res.status(200).json({ reactions });
}

export async function listMembers(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as ListMembersQuery;
  const result = await svc.listMembers(req.user!.sub, req.params.roomId, {
    limit: q.limit,
    offset: q.offset,
    online: q.online,
  });
  res.status(200).json(result);
}

export async function muteRoom(req: Request, res: Response): Promise<void> {
  const result = await svc.toggleMute(req.user!.sub, req.params.roomId);
  res.status(200).json(result);
}

export async function reportRoom(req: Request, res: Response): Promise<void> {
  const { reason, details } = req.body as { reason: string; details?: string };
  const result = await svc.reportRoom(req.user!.sub, req.params.roomId, reason, details);
  res.status(200).json(result);
}

export async function reportMessage(req: Request, res: Response): Promise<void> {
  const { reason } = req.body as { reason: string };
  const result = await svc.reportMessage(req.user!.sub, req.params.roomId, req.params.messageId, reason);
  res.status(200).json(result);
}

export async function deleteMessage(req: Request, res: Response): Promise<void> {
  await svc.deleteMessage(req.user!.sub, req.params.roomId, req.params.messageId);
  res.status(204).send();
}

export async function updateRoom(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateRoomBody;
  const room = await svc.updateRoom(req.user!.sub, req.params.roomId, body);
  res.status(200).json({ room });
}

export async function pinMessage(req: Request, res: Response): Promise<void> {
  const { pin } = req.body as PinMessageBody;
  const result = await svc.pinMessage(req.user!.sub, req.params.roomId, req.params.messageId, pin);
  res.status(200).json(result);
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  await svc.removeMember(req.user!.sub, req.params.roomId, req.params.userId);
  res.status(204).send();
}

export async function updateMemberRole(req: Request, res: Response): Promise<void> {
  const { role } = req.body as UpdateMemberRoleBody;
  const result = await svc.updateMemberRole(req.user!.sub, req.params.roomId, req.params.userId, role);
  res.status(200).json(result);
}

export async function updateRoomPhoto(req: Request, res: Response): Promise<void> {
  const { photoUrl } = req.body as UpdateRoomPhotoBody;
  const result = await svc.updateRoomPhoto(req.user!.sub, req.params.roomId, photoUrl);
  res.status(200).json(result);
}

export async function transferOwnership(req: Request, res: Response): Promise<void> {
  const { userId } = req.body as TransferOwnershipBody;
  const result = await svc.transferOwnership(req.user!.sub, req.params.roomId, userId);
  res.status(200).json(result);
}

export async function deleteRoom(req: Request, res: Response): Promise<void> {
  await svc.deleteRoom(req.user!.sub, req.params.roomId);
  res.status(204).send();
}
