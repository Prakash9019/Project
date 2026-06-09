import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { env } from '../../config/env';
import { Errors } from '../../utils/httpError';
import { todayKey } from '../../utils/crypto';
import { moderation } from '../../adapters/moderation';

const SECONDS_IN_DAY = 86400;

export async function getParticipantConversation(userId: string, conversationId: string) {
  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!convo || (convo.userAId !== userId && convo.userBId !== userId)) {
    throw Errors.notFound('Conversation not found');
  }
  return convo;
}

export function otherParty(convo: { userAId: string; userBId: string }, userId: string): string {
  return convo.userAId === userId ? convo.userBId : convo.userAId;
}

function stable(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Start or resume a conversation.
 * If a conversation already exists: return it.
 * If new: create it in `pending` state (lands in receiver's Requests folder).
 * Replying to a pending conversation promotes it to `active`.
 */
export async function startOrGetConversation(senderId: string, receiverId: string) {
  if (senderId === receiverId) throw Errors.badRequest('Cannot message yourself');

  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: senderId, blockedId: receiverId }, { blockerId: receiverId, blockedId: senderId }] },
  });
  if (blocked) throw Errors.forbidden('You cannot message this user');

  const receiver = await prisma.user.findUnique({ where: { id: receiverId }, include: { settings: true } });
  if (!receiver) throw Errors.notFound('User not found');
  if (receiver.settings?.stealthMode) throw Errors.forbidden('This user is not accepting messages');

  const [userAId, userBId] = stable(senderId, receiverId);

  const existing = await prisma.conversation.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
  if (existing) {
    // If sender is replying to a pending conversation where they are the receiver, promote it.
    if (existing.state === 'pending' && existing.initiatorId !== senderId) {
      return prisma.conversation.update({ where: { id: existing.id }, data: { state: 'active' } });
    }
    if (existing.state === 'dismissed') throw Errors.forbidden('This conversation was dismissed');
    return existing;
  }

  return prisma.conversation.create({
    data: { userAId, userBId, initiatorId: senderId, state: 'pending' },
  });
}

export async function listConversations(userId: string, folder: 'inbox' | 'requests') {
  // inbox = active conversations, requests = pending ones where user is NOT the initiator
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
      state: folder === 'requests' ? 'pending' : 'active',
      ...(folder === 'requests' ? { initiatorId: { not: userId } } : {}),
      // hide thread-deleted conversations for this user
      ...(userId ? {
        AND: [
          { OR: [{ userAId: { not: userId } }, { aDeletedAt: null }] },
          { OR: [{ userBId: { not: userId } }, { bDeletedAt: null }] },
        ]
      } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      userA: { include: { photos: { where: { isPrimary: true }, take: 1 } } },
      userB: { include: { photos: { where: { isPrimary: true }, take: 1 } } },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  return conversations;
}

export async function listMessages(conversationId: string, before: Date | undefined, limit: number) {
  return prisma.message.findMany({
    where: { conversationId, deletedAt: null, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  payload: {
    type: 'text' | 'photo' | 'video' | 'voice' | 'expiring_photo';
    ciphertext?: string;
    mediaUrls?: string[];
    viewOnce?: boolean;
    expiresInSeconds?: number;
  },
) {
  const convo = await getParticipantConversation(senderId, conversationId);

  // ── Expiring-photo daily cap (free tier) ─────────────
  if (payload.type === 'expiring_photo') {
    const capKey = RedisKeys.dailyExpiringPhotoCap(senderId, todayKey());
    const used = Number((await redis.get(capKey)) ?? 0);
    const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { tier: true } });
    const isPaidTier = sender?.tier !== 'free';
    if (!isPaidTier && used >= env.expiringPhoto.freeTierDaily) {
      throw Errors.paymentRequired('Daily expiring photo limit reached. Upgrade to send more.');
    }
    if (!isPaidTier) {
      const next = await redis.incr(capKey);
      if (next === 1) await redis.expire(capKey, SECONDS_IN_DAY);
    }
  }

  // ── Moderation hook ───────────────────────────────────
  let flaggedOffensive = false;
  if (payload.ciphertext && payload.type === 'text') {
    const receiver = await prisma.user.findUnique({
      where: { id: otherParty(convo, senderId) },
      select: { settings: { select: { blockOffensiveLanguage: true } } },
    });
    if (receiver?.settings?.blockOffensiveLanguage) {
      const result = await moderation.classifyText(payload.ciphertext);
      if (result.offensive) flaggedOffensive = true;
    }
  }

  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        conversationId,
        senderId,
        type: payload.type,
        ciphertext: payload.ciphertext,
        mediaUrls: payload.mediaUrls ?? [],
        viewOnce: payload.viewOnce ?? payload.type === 'expiring_photo',
        expiresInSeconds: payload.expiresInSeconds ?? (payload.type === 'expiring_photo' ? env.expiringPhoto.viewSeconds : null),
        flaggedOffensive,
      },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    return msg;
  });

  return { message, convo };
}

export async function consumeExpiringPhoto(messageId: string, viewerId: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) throw Errors.notFound('Message not found');
  if (msg.type !== 'expiring_photo') throw Errors.badRequest('Not an expiring photo');
  if (msg.senderId === viewerId) throw Errors.badRequest('Sender cannot consume their own expiring photo');
  if (msg.viewedAt) throw Errors.conflict('Already viewed');
  return prisma.message.update({ where: { id: messageId }, data: { viewedAt: new Date() } });
}

export async function unsendMessage(messageId: string, senderId: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) throw Errors.notFound('Message not found');
  if (msg.senderId !== senderId) throw Errors.forbidden('You can only unsend your own messages');
  if (msg.deletedAt) throw Errors.conflict('Already deleted');
  return prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
}

export async function deleteMessageForSelf(messageId: string, userId: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) throw Errors.notFound('Message not found');
  // Soft-delete for self — mark deletedAt (same field; full delete-for-everyone is unsend)
  if (msg.senderId !== userId) throw Errors.forbidden('Cannot delete others\' messages');
  return prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
}

export async function deleteThread(conversationId: string, userId: string) {
  const convo = await getParticipantConversation(userId, conversationId);
  const isA = convo.userAId === userId;
  await prisma.conversation.update({
    where: { id: conversationId },
    data: isA ? { aDeletedAt: new Date() } : { bDeletedAt: new Date() },
  });
}

export async function markRead(conversationId: string, readerId: string) {
  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: readerId }, readAt: null, deletedAt: null },
    data: { readAt: new Date() },
  });
}

export async function dismissConversation(conversationId: string, userId: string) {
  const convo = await getParticipantConversation(userId, conversationId);
  if (convo.initiatorId === userId) throw Errors.forbidden('Initiator cannot dismiss their own request');
  if (convo.state !== 'pending') throw Errors.conflict('Not a pending conversation');
  return prisma.conversation.update({ where: { id: conversationId }, data: { state: 'dismissed' } });
}

// Saved phrases

export async function listSavedPhrases(userId: string) {
  return prisma.savedPhrase.findMany({ where: { userId }, orderBy: { order: 'asc' } });
}

export async function createSavedPhrase(userId: string, text: string) {
  const count = await prisma.savedPhrase.count({ where: { userId } });
  if (count >= 20) throw Errors.badRequest('Maximum 20 saved phrases');
  return prisma.savedPhrase.create({ data: { userId, text, order: count } });
}

export async function deleteSavedPhrase(phraseId: string, userId: string) {
  const phrase = await prisma.savedPhrase.findFirst({ where: { id: phraseId, userId } });
  if (!phrase) throw Errors.notFound('Phrase not found');
  await prisma.savedPhrase.delete({ where: { id: phraseId } });
}
