import { Request, Response } from 'express';
import { z } from 'zod';
import { emitToUser } from '../../realtime/emitter';
import { translation } from '../../adapters/translation';
import { Errors } from '../../utils/httpError';
import * as svc from './chat.service';

export const startConversationSchema = z.object({ userId: z.string().uuid() });

export const sendMessageSchema = z.object({
  type:             z.enum(['text','photo','video','voice','expiring_photo']).default('text'),
  ciphertext:       z.string().max(8192).optional(),
  mediaUrls:        z.array(z.string().url()).max(10).optional(),
  viewOnce:         z.boolean().optional(),
  expiresInSeconds: z.number().int().min(1).max(60).optional(),
});

export const listMessagesQuerySchema = z.object({
  before: z.coerce.date().optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(30),
});

export const listConversationsQuerySchema = z.object({
  folder: z.enum(['inbox','requests']).default('inbox'),
});

export const savedPhraseSchema = z.object({ text: z.string().min(1).max(500) });
export const translateSchema = z.object({ targetLang: z.string().min(2).max(5).default('en') });

export async function startConversation(req: Request, res: Response): Promise<void> {
  const { userId: receiverId } = req.body as z.infer<typeof startConversationSchema>;
  const convo = await svc.startOrGetConversation(req.user!.sub, receiverId);
  res.status(convo ? 200 : 201).json({ id: convo.id, state: convo.state });
}

export async function listConversations(req: Request, res: Response): Promise<void> {
  const { folder } = req.query as unknown as z.infer<typeof listConversationsQuerySchema>;
  const userId = req.user!.sub;
  const convos = await svc.listConversations(userId, folder);
  res.status(200).json({
    folder,
    conversations: convos.map((c) => {
      const isA = c.userAId === userId;
      const other = isA ? c.userB : c.userA;
      const last = c.messages[0];
      return {
        id: c.id,
        state: c.state,
        isInitiator: c.initiatorId === userId,
        peer: { id: other.id, name: other.name, isVerified: other.isVerified, thumbnailUrl: other.photos[0]?.url ?? null },
        lastMessageAt: c.lastMessageAt,
        lastMessage: last ? { id: last.id, type: last.type, ciphertext: last.ciphertext, senderId: last.senderId } : null,
      };
    }),
  });
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  const { conversationId } = req.params;
  await svc.getParticipantConversation(req.user!.sub, conversationId);
  const { before, limit } = req.query as unknown as z.infer<typeof listMessagesQuerySchema>;
  const messages = await svc.listMessages(conversationId, before, limit);
  res.status(200).json({ messages });
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { conversationId } = req.params;
  const payload = req.body as z.infer<typeof sendMessageSchema>;

  const { message, convo } = await svc.sendMessage(conversationId, userId, payload);
  const peerId = svc.otherParty(convo, userId);

  emitToUser(peerId, 'message.created', {
    id: message.id, conversationId, senderId: userId,
    type: message.type, ciphertext: message.ciphertext, mediaUrls: message.mediaUrls,
    viewOnce: message.viewOnce, expiresInSeconds: message.expiresInSeconds,
    createdAt: message.createdAt,
  });

  res.status(201).json(message);
}

export async function unsendMessage(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  const convo = await svc.getParticipantConversation(req.user!.sub, conversationId);
  const msg = await svc.unsendMessage(messageId, req.user!.sub);
  emitToUser(svc.otherParty(convo, req.user!.sub), 'message.unsend', { conversationId, messageId });
  res.status(200).json({ id: msg.id, deletedAt: msg.deletedAt });
}

export async function deleteMessageHandler(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  await svc.getParticipantConversation(req.user!.sub, conversationId);
  await svc.deleteMessageForSelf(messageId, req.user!.sub);
  res.status(204).send();
}

export async function deleteThreadHandler(req: Request, res: Response): Promise<void> {
  const { conversationId } = req.params;
  await svc.deleteThread(conversationId, req.user!.sub);
  res.status(204).send();
}

export async function consumeExpiringPhoto(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  const convo = await svc.getParticipantConversation(req.user!.sub, conversationId);
  const msg = await svc.consumeExpiringPhoto(messageId, req.user!.sub);
  emitToUser(svc.otherParty(convo, req.user!.sub), 'message.viewed', { conversationId, messageId, viewedAt: msg.viewedAt });
  res.status(200).json({ ok: true });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const { conversationId } = req.params;
  const convo = await svc.getParticipantConversation(req.user!.sub, conversationId);
  await svc.markRead(conversationId, req.user!.sub);
  emitToUser(svc.otherParty(convo, req.user!.sub), 'message.read', { conversationId, readerId: req.user!.sub });
  res.status(200).json({ ok: true });
}

export async function dismissConversation(req: Request, res: Response): Promise<void> {
  const { conversationId } = req.params;
  await svc.dismissConversation(conversationId, req.user!.sub);
  res.status(200).json({ ok: true });
}

export async function translateMessage(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  const { targetLang } = req.body as z.infer<typeof translateSchema>;
  await svc.getParticipantConversation(req.user!.sub, conversationId);
  // Note: with true E2E encryption, ciphertext cannot be translated server-side.
  // This endpoint is for non-E2E payloads or a client-relay trusted mode.
  const { prisma } = await import('../../config/prisma');
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || !message.ciphertext) throw Errors.badRequest('No translatable content');
  const result = await translation.translate(message.ciphertext, targetLang);
  res.status(200).json(result);
}

export async function listSavedPhrases(req: Request, res: Response): Promise<void> {
  const phrases = await svc.listSavedPhrases(req.user!.sub);
  res.status(200).json({ phrases });
}

export async function createSavedPhrase(req: Request, res: Response): Promise<void> {
  const { text } = req.body as z.infer<typeof savedPhraseSchema>;
  const phrase = await svc.createSavedPhrase(req.user!.sub, text);
  res.status(201).json(phrase);
}

export async function deleteSavedPhrase(req: Request, res: Response): Promise<void> {
  const { phraseId } = req.params;
  await svc.deleteSavedPhrase(phraseId, req.user!.sub);
  res.status(204).send();
}
