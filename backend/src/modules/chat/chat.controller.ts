import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { emitToUser } from '../../realtime/emitter';
import { translation } from '../../adapters/translation';
import { Errors, HttpError } from '../../utils/httpError';
import { serializeGridCard } from '../profile/profile.serializer';
import { sendPush, isMuted } from '../../services/push';
import { updateReplyRate } from '../../utils/replyRate';
import * as svc from './chat.service';

export const startConversationSchema = z.object({ userId: z.string().uuid() });

export const sendMessageSchema = z.object({
  type:             z.enum(['text', 'photo', 'video', 'voice', 'expiring_photo', 'voice_note']).default('text'),
  ciphertext:       z.string().max(8192).optional(),
  content:          z.string().max(4096).optional(),
  mediaUrls:        z.array(z.string().url()).max(10).optional(),
  viewOnce:         z.boolean().optional(),
  expiresInSeconds: z.number().int().min(1).max(60).optional(),
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const listMessagesQuerySchema = z.object({
  before: z.coerce.date().optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(30),
});

export const listConversationsQuerySchema = z.object({
  folder: z.enum(['inbox', 'requests']).default('inbox'),
});

export const savedPhraseSchema   = z.object({ text: z.string().min(1).max(500) });
export const templateSchema      = z.object({ content: z.string().min(1).max(500) });
export const translateSchema     = z.object({ targetLang: z.string().min(2).max(5).default('en') });
export const templateParamsSchema = z.object({ templateId: z.string().uuid() });

// ── Conversations ─────────────────────────────────────────

export async function startConversation(req: Request, res: Response): Promise<void> {
  const { userId: receiverId } = req.body as z.infer<typeof startConversationSchema>;
  const convo = await svc.startOrGetConversation(req.user!.sub, receiverId);
  const flags = svc.callFlags(convo, req.user!.sub);
  const isNew = convo.state === 'pending' && convo.initiatorId === req.user!.sub;
  res.status(isNew ? 201 : 200).json({ id: convo.id, state: convo.state, ...flags });
}

export async function listConversations(req: Request, res: Response): Promise<void> {
  const { folder } = req.query as unknown as z.infer<typeof listConversationsQuerySchema>;
  const userId = req.user!.sub;
  const convos = await svc.listConversations(userId, folder);

  res.status(200).json({
    folder,
    conversations: convos.map((c) => {
      const isA = c.userAId === userId;
      const peer = isA ? c.userB : c.userA;
      const last = c.messages[0];
      const flags = svc.callFlags(c, userId);

      const lastMessage = last
        ? {
            id: last.id,
            type: last.type,
            content: last.isUnsent ? null : (last.content ? last.content.slice(0, 80) : null),
            senderId: last.senderId,
            createdAt: last.createdAt,
            isUnsent: last.isUnsent ?? false,
          }
        : null;

      return {
        id: c.id,
        state: c.state,
        isInitiator: c.initiatorId === userId,
        isPinned: isA ? c.aPinned : c.bPinned,
        unreadCount: c.unreadCount,
        lastMessageAt: c.lastMessageAt,
        lastMessage,
        peer: serializeGridCard(peer, 0, false, false),
        ...flags,
      };
    }),
  });
}

// ── Messages ──────────────────────────────────────────────

export async function listMessages(req: Request, res: Response): Promise<void> {
  const { conversationId } = req.params;
  const convo = await svc.getVisibleConversation(req.user!.sub, conversationId);
  const { before, limit } = req.query as unknown as z.infer<typeof listMessagesQuerySchema>;
  const { messages, hasMore, nextCursor } = await svc.listMessages(conversationId, before, limit, req.user!.sub);
  const flags = svc.callFlags(convo, req.user!.sub);
  res.status(200).json({ messages, hasMore, nextCursor, ...flags });
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { conversationId } = req.params;
  const payload = req.body as z.infer<typeof sendMessageSchema>;
  const limits = req.effectiveLimits;
  const plan = limits?.plan ?? 'free';

  // Get planExpiresAt for plan checks — load from user record
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { planExpiresAt: true },
  });
  const planExpiresAt = userRecord?.planExpiresAt ?? null;

  const { message, convo, peerId, peerPlan, peerPlanExpiresAt } = await svc.sendMessage(
    conversationId, userId, plan, planExpiresAt, payload,
  );

  // Emit message.created to peer (never include originalContent)
  emitToUser(peerId, 'message.created', {
    id: message.id, conversationId, senderId: userId,
    type: message.type, ciphertext: message.ciphertext, content: message.content,
    mediaUrls: message.mediaUrls, mediaUrl: message.mediaUrl,
    viewOnce: message.viewOnce, expiresInSeconds: message.expiresInSeconds,
    expiresAfterView: message.expiresAfterView, createdAt: message.createdAt,
  });

  // Push notification (non-blocking, skip if muted)
  isMuted(peerId, userId).then((muted) => {
    if (!muted) {
      sendPush(peerId, {
        title: 'New message',
        body: message.type === 'text' ? (message.content?.slice(0, 100) ?? 'sent a message') : `sent a ${message.type}`,
        data: { conversationId, type: 'message' },
      }).catch(() => {});
    }
  }).catch(() => {});

  // Update reply rate for sender (fire-and-forget)
  updateReplyRate(userId).catch(() => {});

  const flags = svc.callFlags({ ...convo }, userId);
  res.status(201).json({ ...message, ...flags });
}

export async function editMessage(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  const { content } = req.body as z.infer<typeof editMessageSchema>;

  // Verify participant
  const convo = await svc.getParticipantConversation(req.user!.sub, conversationId);
  const updated = await svc.editMessage(messageId, req.user!.sub, content);

  // Emit to BOTH users
  const peerId = svc.otherParty(convo, req.user!.sub);
  const editPayload = { conversationId, messageId: updated.id, content: updated.content, editedAt: updated.editedAt, isEdited: true };
  emitToUser(req.user!.sub, 'message.edited', editPayload);
  emitToUser(peerId, 'message.edited', editPayload);

  res.status(200).json({ id: updated.id, content: updated.content, isEdited: updated.isEdited, editedAt: updated.editedAt });
}

export async function unsendMessage(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  const userId = req.user!.sub;
  const limits = req.effectiveLimits;
  const plan = limits?.plan ?? 'free';

  const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { planExpiresAt: true } });
  const planExpiresAt = userRecord?.planExpiresAt ?? null;

  const convo = await svc.getParticipantConversation(userId, conversationId);
  const msg = await svc.unsendMessage(messageId, userId, plan, planExpiresAt);

  emitToUser(svc.otherParty(convo, userId), 'message.unsend', { conversationId, messageId });
  res.status(200).json({ id: msg.id, isUnsent: msg.isUnsent, unsentAt: msg.unsentAt });
}

export async function deleteMessageHandler(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  await svc.getParticipantConversation(req.user!.sub, conversationId);
  await svc.deleteMessageForSelf(messageId, req.user!.sub);
  res.status(204).send();
}

export async function consumeExpiringPhoto(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  const convo = await svc.getParticipantConversation(req.user!.sub, conversationId);
  // Verify requesting user is the RECIPIENT
  const msg = await prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true } });
  if (!msg) throw Errors.notFound('Message not found');
  if (msg.senderId === req.user!.sub) throw Errors.forbidden('Sender cannot consume their own expiring photo');
  const updated = await svc.consumeExpiringPhoto(messageId, req.user!.sub);
  emitToUser(svc.otherParty(convo, req.user!.sub), 'message.viewed', {
    conversationId, messageId, viewedAt: updated.viewedAt,
  });
  res.status(200).json({
    ok: true,
    url: updated.url,
    viewedAt: updated.viewedAt,
    expiresInSeconds: updated.expiresInSeconds,
  });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const { conversationId } = req.params;
  const readerId = req.user!.sub;
  const convo = await svc.getParticipantConversation(readerId, conversationId);
  await svc.markRead(conversationId, readerId);

  // Only emit to sender if sender has Premium+ (readReceipts feature)
  const peerId = svc.otherParty(convo, readerId);
  const peerRecord = await prisma.user.findUnique({
    where: { id: peerId },
    select: { plan: true, planExpiresAt: true },
  });
  if (svc.isPaidPlan(peerRecord?.plan ?? 'free', peerRecord?.planExpiresAt ?? null)) {
    emitToUser(peerId, 'message.read', { conversationId, readerId });
  }
  res.status(200).json({ ok: true });
}

export async function deleteThreadHandler(req: Request, res: Response): Promise<void> {
  await svc.deleteThread(req.params.conversationId, req.user!.sub);
  res.status(204).send();
}

export async function dismissConversation(req: Request, res: Response): Promise<void> {
  await svc.dismissConversation(req.params.conversationId, req.user!.sub);
  res.status(200).json({ ok: true });
}

// ── Pinning ───────────────────────────────────────────────

export async function pinConversation(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { conversationId } = req.params;
  const limits = req.effectiveLimits;
  const maxPins = limits?.pinChats ?? 0;

  if (maxPins === 0) {
    throw new HttpError(403, 'plan_required', 'Chat pinning requires Gold or above.',
      { requiredPlan: 'gold' });
  }

  // Count existing pins for this user
  const currentPins = await prisma.conversation.count({
    where: {
      OR: [
        { userAId: userId, aPinned: true },
        { userBId: userId, bPinned: true },
      ],
    },
  });
  if (currentPins >= maxPins) {
    throw new HttpError(403, 'pin_limit_reached',
      `Your plan allows up to ${maxPins} pinned chats.`, { limit: maxPins });
  }

  await svc.pinConversation(conversationId, userId);
  res.status(200).json({ isPinned: true });
}

export async function unpinConversation(req: Request, res: Response): Promise<void> {
  await svc.unpinConversation(req.params.conversationId, req.user!.sub);
  res.status(204).send();
}

// ── Translate ─────────────────────────────────────────────

export async function translateMessage(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  const { targetLang } = req.body as z.infer<typeof translateSchema>;
  const limits = req.effectiveLimits;

  // Premium+ only
  if (!limits || limits.plan === 'free') {
    throw Errors.forbidden('Message translation requires a Premium or higher plan');
  }

  await svc.getParticipantConversation(req.user!.sub, conversationId);
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) throw Errors.notFound('Message not found');

  // Non-E2E only — cannot translate encrypted ciphertext-only messages
  if (!message.content && message.ciphertext) {
    throw Errors.badRequest('Cannot translate end-to-end encrypted messages');
  }
  if (!message.content) throw Errors.badRequest('No translatable content');

  const result = await translation.translate(message.content, targetLang);
  // Persist translated content
  await prisma.message.update({
    where: { id: messageId },
    data: { translatedContent: result.text },
  });
  res.status(200).json(result);
}

// ── Saved Phrases (Premium+) ──────────────────────────────

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
  await svc.deleteSavedPhrase(req.params.phraseId, req.user!.sub);
  res.status(204).send();
}

// ── Message Templates ─────────────────────────────────────

export async function listTemplates(req: Request, res: Response): Promise<void> {
  const templates = await svc.listTemplates(req.user!.sub);
  const limit = req.effectiveLimits?.messageTemplates ?? 0;
  res.status(200).json({ templates, limit });
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  const { content } = req.body as z.infer<typeof templateSchema>;
  const limit = req.effectiveLimits?.messageTemplates ?? 0;
  const template = await svc.createTemplate(req.user!.sub, content, limit);
  res.status(201).json(template);
}

export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  await svc.deleteTemplate(req.params.templateId, req.user!.sub);
  res.status(204).send();
}
