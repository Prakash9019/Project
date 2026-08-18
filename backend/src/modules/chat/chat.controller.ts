import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { emitToUser } from '../../realtime/emitter';
import { translation } from '../../adapters/translation';
import { Errors, HttpError } from '../../utils/httpError';
import { serializeGridCard, signUserPhotos } from '../profile/profile.serializer';
import { sendTypedPush, isMuted } from '../../services/push';
import { updateReplyRate } from '../../utils/replyRate';
import * as svc from './chat.service';

/** One-line push preview for a 1:1 message by type. */
function messagePreview(type: string, content: string | null | undefined): string {
  if (type === 'photo' || type === 'expiring_photo') return '📷 Photo';
  if (type === 'voice' || type === 'voice_note') return '🎤 Voice message';
  if (type === 'video') return '🎥 Video';
  if (type === 'text' && content?.startsWith('📍')) return '📍 Location';
  return (content ?? '').slice(0, 80) || 'New message';
}

export const startConversationSchema = z.object({ userId: z.string().uuid() });

export const sendMessageSchema = z.object({
  type:             z.enum(['text', 'photo', 'video', 'voice', 'expiring_photo', 'voice_note']).default('text'),
  ciphertext:       z.string().max(8192).optional(),
  content:          z.string().max(4096).optional(),
  caption:          z.string().max(1000).optional(),
  mediaUrls:        z.array(z.string().min(1)).max(10).optional(),
  // Video poster frame (R2 object key or hosted URL) — generated client-side
  // with expo-video-thumbnails and stored verbatim.
  thumbnailUrl:     z.string().min(1).max(2048).optional(),
  // Playback length in seconds for voice/video. Capped at 1 hour.
  duration:         z.number().int().min(0).max(3600).optional(),
  viewOnce:         z.boolean().optional(),
  expiresInSeconds: z.number().int().min(1).max(60).optional(),
  replyToId:        z.string().uuid().optional(),
});

export const reactSchema = z.object({ emoji: z.string().min(1).max(10) });

export const editMessageSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const forwardMessageSchema = z.object({
  targetConversationIds: z.array(z.string().uuid()).min(1).max(20),
});

export const listMessagesQuerySchema = z.object({
  before: z.coerce.date().optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(30),
});

export const listConversationsQuerySchema = z.object({
  folder: z.enum(['inbox', 'requests']).default('inbox'),
  archived: z.coerce.boolean().optional(),
});

export const archiveSchema = z.object({ archived: z.boolean() });

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
  const { folder, archived } = req.query as unknown as z.infer<typeof listConversationsQuerySchema>;
  const userId = req.user!.sub;
  const convos = await svc.listConversations(userId, folder, archived ?? false);

  const conversations = await Promise.all(convos.map(async (c) => {
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
      peer: serializeGridCard(await signUserPhotos(peer), 0, false, false),
      ...flags,
    };
  }));
  res.status(200).json({ folder, conversations });
}

// ── Messages ──────────────────────────────────────────────

export async function listMessages(req: Request, res: Response): Promise<void> {
  const { conversationId } = req.params;
  const convo = await svc.getVisibleConversation(req.user!.sub, conversationId);
  const { before, limit } = req.query as unknown as z.infer<typeof listMessagesQuerySchema>;
  const { messages, hasMore, nextCursor } = await svc.listMessages(conversationId, before, limit, req.user!.sub);
  const flags = svc.callFlags(convo, req.user!.sub);
  res.status(200).json({ messages, hasMore, nextCursor, ...flags, disappearingMessages: convo.disappearingMessages ?? null });
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { conversationId } = req.params;
  const payload = req.body as z.infer<typeof sendMessageSchema>;
  const limits = req.effectiveLimits;
  const plan = limits?.plan ?? 'free';

  // Get planExpiresAt for plan checks — load from user record (+ firstName for push title)
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { planExpiresAt: true, firstName: true, name: true },
  });
  const planExpiresAt = userRecord?.planExpiresAt ?? null;
  const senderName = userRecord?.firstName ?? userRecord?.name ?? 'Someone';

  const { message, convo, peerId, delivered, peerPlan, peerPlanExpiresAt } = await svc.sendMessage(
    conversationId, userId, plan, planExpiresAt, payload,
  );

  // Emit message.created to peer (never include originalContent)
  emitToUser(peerId, 'message.created', {
    id: message.id, conversationId, senderId: userId,
    type: message.type, ciphertext: message.ciphertext, content: message.content,
    caption: message.caption,
    mediaUrls: message.mediaUrls, mediaUrl: message.mediaUrl,
    thumbnailUrl: message.thumbnailUrl, duration: message.duration,
    viewOnce: message.viewOnce, expiresInSeconds: message.expiresInSeconds,
    expiresAfterView: message.expiresAfterView, createdAt: message.createdAt,
    replyToId: message.replyToId, replyTo: message.replyTo, reactions: message.reactions,
  });

  // If the recipient was online at send time, tell the sender it's delivered
  // (double-grey tick) immediately.
  if (delivered) {
    emitToUser(userId, 'message.status_update', {
      conversationId, messageId: message.id, status: 'delivered',
    });
  }

  // Push notification (non-blocking, skip if muted). Preview varies by type.
  isMuted(peerId, userId).then((muted) => {
    if (!muted) {
      sendTypedPush(peerId, {
        type: 'new_message',
        conversationId,
        senderName,
        preview: messagePreview(message.type, message.content),
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

export async function forwardMessage(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  const { targetConversationIds } = req.body as z.infer<typeof forwardMessageSchema>;
  const userId = req.user!.sub;

  await svc.getParticipantConversation(userId, conversationId);
  const results = await svc.forwardMessage(messageId, userId, targetConversationIds);

  for (const r of results) {
    emitToUser(r.peerId, 'message.created', {
      id: r.message.id, conversationId: r.conversationId, senderId: userId,
      type: r.message.type, ciphertext: r.message.ciphertext, content: r.message.content,
      caption: r.message.caption,
      mediaUrls: r.message.mediaUrls, mediaUrl: r.message.mediaUrl,
      isForwarded: true, createdAt: r.message.createdAt, reactions: r.message.reactions,
    });
  }

  res.status(201).json({ forwarded: results.length });
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

export async function reactToMessage(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  const { emoji } = req.body as z.infer<typeof reactSchema>;
  const userId = req.user!.sub;

  const convo = await svc.getParticipantConversation(userId, conversationId);
  const result = await svc.toggleReaction(userId, conversationId, messageId, emoji);

  const peerId = svc.otherParty(convo, userId);
  const payload = { conversationId, messageId, ...result, userId };
  emitToUser(userId, 'message.reaction', payload);
  emitToUser(peerId, 'message.reaction', payload);

  // Push the reaction to the original message's sender (only when a reaction was
  // added, and never a self-reaction on your own message).
  if (result.added) {
    const [msg, reactor] = await Promise.all([
      prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, name: true } }),
    ]);
    if (msg && msg.senderId !== userId) {
      const reactorName = reactor?.firstName ?? reactor?.name ?? 'Someone';
      isMuted(msg.senderId, userId).then((muted) => {
        if (!muted) {
          sendTypedPush(msg.senderId, { type: 'reaction', conversationId, senderName: reactorName, emoji }).catch(() => {});
        }
      }).catch(() => {});
    }
  }

  res.status(200).json(result);
}

/** DELETE /:conversationId/messages/:messageId — "Delete for me" (per-side hide). */
export async function deleteMessageHandler(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  await svc.deleteMessageForMe(conversationId, messageId, req.user!.sub);
  res.status(204).send();
}

export const pinMessageSchema = z.object({ isPinned: z.boolean() });

/** POST /:conversationId/messages/:messageId/pin — pin/unpin in a 1:1 chat. */
export async function pinMessageHandler(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  const { isPinned } = req.body as z.infer<typeof pinMessageSchema>;
  const convo = await svc.getParticipantConversation(req.user!.sub, conversationId);
  const msg = await svc.setMessagePinned(conversationId, messageId, req.user!.sub, isPinned);
  const payload = { conversationId, messageId, isPinned };
  emitToUser(req.user!.sub, 'message.pinned', payload);
  emitToUser(svc.otherParty(convo, req.user!.sub), 'message.pinned', payload);
  res.status(200).json({ id: msg.id, isPinned: msg.isPinned });
}

export const disappearingSchema = z.object({
  disappearingMessages: z.union([z.enum(['24h', '7d', '90d']), z.null()]),
});

/** PATCH /:conversationId — currently only sets the disappearing-messages window. */
export async function updateConversation(req: Request, res: Response): Promise<void> {
  const { conversationId } = req.params;
  const { disappearingMessages } = req.body as z.infer<typeof disappearingSchema>;
  const convo = await svc.setDisappearingMessages(conversationId, req.user!.sub, disappearingMessages);
  const peerId = svc.otherParty(convo, req.user!.sub);
  const payload = { conversationId, disappearingMessages };
  emitToUser(req.user!.sub, 'conversation.disappearing_updated', payload);
  emitToUser(peerId, 'conversation.disappearing_updated', payload);
  res.status(200).json({ id: convo.id, disappearingMessages: convo.disappearingMessages });
}

/** GET /:conversationId/messages/:messageId/reactions — who reacted, grouped by emoji. */
export async function listMessageReactions(req: Request, res: Response): Promise<void> {
  const { conversationId, messageId } = req.params;
  const reactions = await svc.listMessageReactions(conversationId, messageId, req.user!.sub);
  res.status(200).json({ reactions });
}

// ── Starred messages (mounted at /api/v1/messages) ────────

export const starSchema = z.object({ type: z.enum(['chat', 'room']).default('chat') });

export async function starMessage(req: Request, res: Response): Promise<void> {
  const { messageId } = req.params;
  const { type } = req.body as z.infer<typeof starSchema>;
  await svc.starMessage(req.user!.sub, messageId, type);
  res.status(201).json({ ok: true, messageId });
}

export async function unstarMessage(req: Request, res: Response): Promise<void> {
  const { messageId } = req.params;
  await svc.unstarMessage(req.user!.sub, messageId);
  res.status(204).send();
}

export async function listStarredMessages(req: Request, res: Response): Promise<void> {
  const result = await svc.listStarredMessages(req.user!.sub);
  res.status(200).json(result);
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

export async function archiveConversation(req: Request, res: Response): Promise<void> {
  const { archived } = req.body as z.infer<typeof archiveSchema>;
  const convo = await svc.archiveConversation(req.params.conversationId, req.user!.sub, archived);
  res.status(200).json({ id: convo.id, archived });
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
