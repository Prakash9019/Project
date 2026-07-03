import { Request, Response } from 'express';
import * as svc from './rooms.service';
import type {
  ListRoomsQuery,
  ListJoinedQuery,
  ListMessagesQuery,
  SendMessageBody,
  ReactBody,
  ListMembersQuery,
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

export async function getRoom(req: Request, res: Response): Promise<void> {
  const room = await svc.getRoomDetail(req.user!.sub, req.params.roomId);
  res.status(200).json({ room });
}

export async function joinRoom(req: Request, res: Response): Promise<void> {
  const room = await svc.joinRoom(req.user!.sub, req.params.roomId);
  res.status(200).json({ ok: true, room });
}

export async function leaveRoom(req: Request, res: Response): Promise<void> {
  await svc.leaveRoom(req.user!.sub, req.params.roomId);
  res.status(204).send();
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as ListMessagesQuery;
  const result = await svc.listMessages(req.user!.sub, req.params.roomId, { before: q.before, limit: q.limit });
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
