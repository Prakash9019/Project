import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { env } from '../../config/env';
import { Errors } from '../../utils/httpError';
import { HttpError } from '../../utils/httpError';
import { todayKey } from '../../utils/crypto';
import { moderation } from '../../adapters/moderation';
import { callFlags as computeCallFlags } from '../../utils/callFlags';
import { emitToConversation } from '../../realtime/emitter';
import { signUrl, signUrls } from '../../utils/signUrl';

const SECONDS_IN_DAY = 86400;
const FREE_TIER_INTERACTION_LIMIT = 20;
const PREMIUM_EXPIRING_PHOTO_DAILY = 10;
const EDIT_WINDOW_MS = 5 * 60 * 1000;

export async function getParticipantConversation(userId: string, conversationId: string) {
  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!convo || (convo.userAId !== userId && convo.userBId !== userId)) {
    throw Errors.notFound('Conversation not found');
  }
  return convo;
}

/** Return convo, also checking the requesting user hasn't hidden/deleted this thread. */
export async function getVisibleConversation(userId: string, conversationId: string) {
  const convo = await getParticipantConversation(userId, conversationId);
  const isA = convo.userAId === userId;
  if (isA ? convo.aIsHidden : convo.bIsHidden) throw Errors.notFound('Conversation not found');
  if (isA ? convo.aDeletedAt !== null : convo.bDeletedAt !== null) throw Errors.notFound('Conversation not found');
  return convo;
}

export function otherParty(convo: { userAId: string; userBId: string }, userId: string): string {
  return convo.userAId === userId ? convo.userBId : convo.userAId;
}

function stable(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function isActivePlan(plan: string, planExpiresAt: Date | null): boolean {
  if (plan === 'free') return false;
  if (!planExpiresAt) return true;
  return planExpiresAt > new Date();
}

export function isPaidPlan(plan: string, planExpiresAt: Date | null): boolean {
  return isActivePlan(plan, planExpiresAt);
}

/** Serialize a message for API responses — never exposes originalContent, moderationFlagged, deletedAt. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeMessage(msg: any) {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    type: msg.type,
    content:    msg.isUnsent ? null : msg.content,
    ciphertext: msg.isUnsent ? null : msg.ciphertext,
    mediaUrls:  msg.mediaUrls ?? [],
    mediaUrl:   msg.mediaUrl ?? null,
    viewOnce:   msg.viewOnce,
    viewedAt:   msg.viewedAt ?? null,
    expiresInSeconds: msg.expiresInSeconds,
    expiresAfterView: msg.expiresAfterView ?? (msg.type === 'expiring_photo'),
    isUnsent:   msg.isUnsent ?? false,
    unsentAt:   msg.unsentAt ?? null,
    isEdited:   msg.isEdited ?? false,
    editedAt:   msg.editedAt ?? null,
    translatedContent: msg.translatedContent ?? null,
    deliveredAt: msg.deliveredAt ?? null,
    readAt:     msg.readAt ?? null,
    createdAt:  msg.createdAt,
  };
}

function isExpiringViewOnce(msg: { type: string; viewOnce?: boolean }) {
  return msg.type === 'expiring_photo' || (msg.type === 'photo' && msg.viewOnce);
}

/** Sign media URLs and redact view-once content for recipients who haven't opened yet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function serializeMessageForViewer(msg: any, viewerId: string) {
  const base = serializeMessage(msg);
  const isRecipient = msg.senderId !== viewerId;
  const hideMedia = isExpiringViewOnce(msg) && isRecipient && !msg.viewedAt;

  const rawUrls: string[] = hideMedia ? [] : (msg.mediaUrls ?? []);
  const signed = (await signUrls(rawUrls)).filter((u): u is string => !!u);
  const mediaUrl = signed[0] ?? (hideMedia ? null : await signUrl(msg.mediaUrl));

  return { ...base, mediaUrls: signed, mediaUrl };
}

/** Free-tier lifetime interaction cap, plus any active chat-pack bonuses. */
async function getEffectiveInteractionLimit(userId: string): Promise<number> {
  const activePacks = await prisma.addOnPurchase.findMany({
    where: {
      userId,
      addOnType: { in: ['chat_pack_s', 'chat_pack_m', 'chat_pack_l'] },
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { chatSlotsAdded: true },
  });
  const bonus = activePacks.reduce((sum, p) => sum + (p.chatSlotsAdded ?? 0), 0);
  return FREE_TIER_INTERACTION_LIMIT + bonus;
}

/** Record a unique interaction for the free-tier lifetime cap. No-op for paid users. */
async function recordInteraction(actorId: string, targetId: string, type: 'message' | 'like'): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { plan: true, planExpiresAt: true } });
  if (!user || isActivePlan(user.plan, user.planExpiresAt)) return;

  const existing = await prisma.userInteraction.findUnique({
    where: { actorId_targetId: { actorId, targetId } },
    select: { id: true },
  });
  if (existing) return;

  const effectiveLimit = await getEffectiveInteractionLimit(actorId);
  const count = await prisma.userInteraction.count({ where: { actorId } });
  if (count >= effectiveLimit) {
    throw new HttpError(403, 'interaction_limit_reached',
      `You've reached your limit of ${effectiveLimit} people. Purchase a chat pack or upgrade to connect with more.`,
      { limit: effectiveLimit });
  }

  await prisma.userInteraction.create({ data: { actorId, targetId, interactionType: type } });
}

export async function startOrGetConversation(senderId: string, receiverId: string) {
  if (senderId === receiverId) throw Errors.badRequest('Cannot message yourself');

  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: senderId, blockedId: receiverId }, { blockerId: receiverId, blockedId: senderId }] },
    select: { id: true },
  });
  if (blocked) throw Errors.forbidden('You cannot message this user');

  const receiver = await prisma.user.findUnique({ where: { id: receiverId }, include: { settings: true } });
  if (!receiver) throw Errors.notFound('User not found');
  if (receiver.settings?.stealthMode) throw Errors.forbidden('This user is not accepting messages');

  const [userAId, userBId] = stable(senderId, receiverId);

  const existing = await prisma.conversation.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
  if (existing) {
    if (existing.state === 'dismissed') throw Errors.forbidden('This conversation was dismissed');
    if (existing.state === 'pending' && existing.initiatorId !== senderId) {
      return prisma.conversation.update({ where: { id: existing.id }, data: { state: 'active' } });
    }
    return existing;
  }

  await recordInteraction(senderId, receiverId, 'message');

  return prisma.conversation.create({
    data: { userAId, userBId, initiatorId: senderId, state: 'pending' },
  });
}

export { computeCallFlags as callFlags };

export async function listConversations(userId: string, folder: 'inbox' | 'requests') {
  const visibility = {
    OR: [
      { userAId: userId, aIsHidden: false, aDeletedAt: null },
      { userBId: userId, bIsHidden: false, bDeletedAt: null },
    ],
  };

  const conversations = await prisma.conversation.findMany({
    where: {
      AND: [
        visibility,
        folder === 'requests'
          ? { state: 'pending', initiatorId: { not: userId } }
          : {
              OR: [
                { state: 'active' },
                // Initiator's outbound threads (e.g. first message from profile view)
                {
                  state: 'pending',
                  initiatorId: userId,
                  messages: { some: { deletedAt: null } },
                },
              ],
            },
      ],
    },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      userA: {
        include: {
          photos: { where: { isPrimary: true, isPrivate: false }, take: 1 },
          settings: true,
          cityProfiles: { where: { isActive: true }, take: 1 },
        },
      },
      userB: {
        include: {
          photos: { where: { isPrimary: true, isPrivate: false }, take: 1 },
          settings: true,
          cityProfiles: { where: { isActive: true }, take: 1 },
        },
      },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  // Unread counts — single groupBy query, no N+1
  const convoIds = conversations.map((c) => c.id);
  const unreadGroups = convoIds.length
    ? await prisma.message.groupBy({
        by: ['conversationId'],
        where: {
          conversationId: { in: convoIds },
          senderId: { not: userId },
          readAt: null,
          deletedAt: null,
          isUnsent: false,
        },
        _count: { id: true },
      })
    : [];
  const unreadByConvoId = new Map(unreadGroups.map((r) => [r.conversationId, r._count.id]));

  // Pinned-first sort (aPinned/bPinned depends on which side the user is on)
  conversations.sort((a, b) => {
    const pinnedA = a.userAId === userId ? a.aPinned : a.bPinned;
    const pinnedB = b.userAId === userId ? b.aPinned : b.bPinned;
    if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;
    const latA = a.lastMessageAt?.getTime() ?? 0;
    const latB = b.lastMessageAt?.getTime() ?? 0;
    return latB - latA;
  });

  return conversations.map((c) => ({
    ...c,
    unreadCount: unreadByConvoId.get(c.id) ?? 0,
  }));
}

export async function listMessages(conversationId: string, before: Date | undefined, limit: number, viewerId: string) {
  const raw = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = raw.length > limit;
  const slice = hasMore ? raw.slice(0, limit) : raw;
  const nextCursor = hasMore ? slice[slice.length - 1].createdAt.toISOString() : null;
  const messages = await Promise.all(slice.map((m) => serializeMessageForViewer(m, viewerId)));

  return { messages, hasMore, nextCursor };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  plan: string,
  planExpiresAt: Date | null,
  payload: {
    type: 'text' | 'photo' | 'video' | 'voice' | 'expiring_photo' | 'voice_note';
    ciphertext?: string;
    content?: string;
    mediaUrls?: string[];
    viewOnce?: boolean;
    expiresInSeconds?: number;
  },
) {
  // 1. Participant + hidden check
  const convo = await getVisibleConversation(senderId, conversationId);
  const peerId = otherParty(convo, senderId);

  // Load peer for pre-send checks
  const peer = await prisma.user.findUnique({
    where: { id: peerId },
    select: {
      pauseIncomingMessages: true,
      requireProfileCompletenessToMessage: true,
      plan: true,
      planExpiresAt: true,
    },
  });

  // 2. pauseIncomingMessages: only blocks NEW conversations (state=pending, no prior messages from sender)
  if (peer?.pauseIncomingMessages && convo.state === 'pending') {
    const priorFromSender = await prisma.message.count({
      where: { conversationId, senderId, deletedAt: null },
    });
    if (priorFromSender === 0) {
      throw new HttpError(403, 'messaging_paused', 'This user is not accepting new messages right now.');
    }
  }

  // 3. requireProfileCompletenessToMessage
  if (peer?.requireProfileCompletenessToMessage) {
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { profileCompletenessScore: true },
    });
    if ((sender?.profileCompletenessScore ?? 0) < 40) {
      throw new HttpError(403, 'profile_incomplete_to_message',
        'Complete your profile to send messages to this user.');
    }
  }

  // 4. AI text moderation (text messages only)
  const textContent = payload.content ?? payload.ciphertext;
  if (payload.type === 'text' && textContent) {
    const result = await moderation.classifyText(textContent);
    if (result.offensive) {
      // Create auditable flagged message + moderation record, then reject
      await prisma.$transaction(async (tx) => {
        const flaggedMsg = await tx.message.create({
          data: {
            conversationId,
            senderId,
            type: payload.type,
            ciphertext: payload.ciphertext,
            content: payload.content,
            mediaUrls: payload.mediaUrls ?? [],
            moderationFlagged: true,
            flaggedOffensive: true,
          },
        });
        await tx.moderationFlag.create({
          data: {
            targetType: 'message',
            targetId: flaggedMsg.id,
            flagType: (result.categories[0] as never) ?? 'hate_speech',
          },
        });
      });
      throw new HttpError(451, 'message_flagged', 'Your message was flagged for review.');
    }
  }

  // 5. Free-tier interaction cap
  const isPaid = isActivePlan(plan, planExpiresAt);
  if (!isPaid) {
    await recordInteraction(senderId, peerId, 'message');
  }

  // 6. Expiring photo cap
  if (payload.type === 'expiring_photo') {
    if (!isPaid) {
      throw new HttpError(403, 'plan_required', 'Expiring photos require a Premium or higher plan.', { requiredPlan: 'premium' });
    }
    if (plan === 'premium' || (plan !== 'free' && plan !== 'gold' && plan !== 'platinum')) {
      // Premium: max 10/day
      const capKey = RedisKeys.dailyExpiringPhotoCap(senderId, todayKey());
      const used = Number((await redis.get(capKey)) ?? 0);
      if (used >= PREMIUM_EXPIRING_PHOTO_DAILY) {
        throw new HttpError(402, 'daily_expiring_photo_limit',
          `Daily limit of ${PREMIUM_EXPIRING_PHOTO_DAILY} expiring photos reached.`);
      }
      const next = await redis.incr(capKey);
      if (next === 1) await redis.expire(capKey, SECONDS_IN_DAY);
    }
    // gold/platinum: unlimited — no cap check
  }

  // Track whether this message first sets the reply flag
  const isA = convo.userAId === senderId;
  const wasFirstReply = isA ? !convo.aHasReplied : !convo.bHasReplied;
  const replyUpdate = isA ? { aHasReplied: true } : { bHasReplied: true };

  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        conversationId,
        senderId,
        type: payload.type,
        ciphertext: payload.ciphertext,
        content: payload.content,
        mediaUrls: payload.mediaUrls ?? [],
        viewOnce: payload.viewOnce ?? payload.type === 'expiring_photo',
        expiresAfterView: payload.type === 'expiring_photo',
        expiresInSeconds: payload.expiresInSeconds ?? (payload.type === 'expiring_photo' ? env.expiringPhoto.viewSeconds : null),
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        state: convo.state === 'pending' ? 'active' : convo.state,
        ...replyUpdate,
      },
    });

    return msg;
  });

  // Delivery: if the recipient currently has a live socket (presence heartbeat),
  // the message is delivered the moment it's created (double-grey tick).
  let delivered = false;
  const peerOnline = await redis.get(RedisKeys.presence(peerId)).catch(() => null);
  if (peerOnline) {
    const now = new Date();
    await prisma.message.update({ where: { id: message.id }, data: { deliveredAt: now } }).catch(() => {});
    message.deliveredAt = now;
    delivered = true;
  }

  // Emit call.enabled to both when reply flag first becomes true
  if (wasFirstReply) {
    const updatedConvo = { ...convo, ...replyUpdate };
    if (computeCallFlags(updatedConvo, convo.userAId).audioCallEnabled
      || computeCallFlags(updatedConvo, convo.userBId).audioCallEnabled) {
      emitToConversation([convo.userAId, convo.userBId], 'call.enabled',
        { conversationId, audioCallEnabled: true, videoCallEnabled: true });
    }
  }

  return {
    message: await serializeMessageForViewer(message, senderId),
    convo: { ...convo, ...replyUpdate },
    peerId,
    delivered,
    peerPlan: peer?.plan ?? 'free',
    peerPlanExpiresAt: peer?.planExpiresAt ?? null,
  };
}

export async function editMessage(
  messageId: string,
  senderId: string,
  content: string,
) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.senderId !== senderId) throw Errors.notFound('Message not found');
  if (msg.isUnsent) throw Errors.forbidden('Cannot edit an unsent message');

  // 5-minute edit window
  const age = Date.now() - msg.createdAt.getTime();
  if (age > EDIT_WINDOW_MS) {
    throw new HttpError(403, 'edit_window_expired', 'Messages can only be edited within 5 minutes.');
  }

  // Moderation check on new content
  const result = await moderation.classifyText(content);
  if (result.offensive) {
    throw new HttpError(451, 'message_flagged', 'Your edited message was flagged for review.');
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      content,
      // Preserve the first (original) version only
      originalContent: msg.originalContent ?? msg.content,
      isEdited: true,
      editedAt: new Date(),
    },
  });
  return serializeMessage(updated);
}

export async function unsendMessage(messageId: string, senderId: string, plan: string, planExpiresAt: Date | null) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) throw Errors.notFound('Message not found');
  if (msg.senderId !== senderId) throw Errors.forbidden('You can only unsend your own messages');
  if (msg.isUnsent) throw new HttpError(409, 'already_unsent', 'Message already unsent');

  const paidPlan = isActivePlan(plan, planExpiresAt);
  const isGoldPlus = paidPlan && (plan === 'gold' || plan === 'platinum');
  const isPremium = paidPlan && plan === 'premium';

  if (!paidPlan) {
    throw Errors.forbidden('Unsending messages requires a Premium or higher plan');
  }

  // Premium: only before read; Gold+: anytime
  if (isPremium && !isGoldPlus && msg.readAt !== null) {
    throw new HttpError(403, 'already_read',
      'Message already read. Upgrade to Gold to unsend after read.');
  }

  return prisma.message.update({
    where: { id: messageId },
    data: { isUnsent: true, unsentAt: new Date(), content: null },
  });
}

export async function deleteMessageForSelf(messageId: string, userId: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) throw Errors.notFound('Message not found');
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
  const now = new Date();
  // A read message is necessarily delivered — backfill deliveredAt for any that
  // weren't marked delivered yet (e.g. recipient was offline at send time).
  await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: readerId },
      deliveredAt: null,
      deletedAt: null,
      isUnsent: false,
    },
    data: { deliveredAt: now },
  });
  await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: readerId },
      readAt: null,
      deletedAt: null,
      isUnsent: false,
    },
    data: { readAt: now },
  });
}

export async function dismissConversation(conversationId: string, userId: string) {
  const convo = await getParticipantConversation(userId, conversationId);
  if (convo.initiatorId === userId) throw Errors.forbidden('Initiator cannot dismiss their own request');
  if (convo.state !== 'pending') throw Errors.conflict('Not a pending conversation');
  return prisma.conversation.update({ where: { id: conversationId }, data: { state: 'dismissed' } });
}

export async function pinConversation(conversationId: string, userId: string) {
  const convo = await getParticipantConversation(userId, conversationId);
  const isA = convo.userAId === userId;
  return prisma.conversation.update({
    where: { id: conversationId },
    data: isA ? { aPinned: true } : { bPinned: true },
  });
}

export async function unpinConversation(conversationId: string, userId: string) {
  const convo = await getParticipantConversation(userId, conversationId);
  const isA = convo.userAId === userId;
  return prisma.conversation.update({
    where: { id: conversationId },
    data: isA ? { aPinned: false } : { bPinned: false },
  });
}

export async function consumeExpiringPhoto(messageId: string, viewerId: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) throw Errors.notFound('Message not found');
  if (!isExpiringViewOnce(msg)) throw Errors.badRequest('Not an expiring photo');
  if (msg.senderId === viewerId) throw Errors.forbidden('Sender cannot view their own expiring photo');
  if (msg.viewedAt) throw Errors.conflict('Already viewed');
  const updated = await prisma.message.update({ where: { id: messageId }, data: { viewedAt: new Date() } });
  const path = (updated.mediaUrls ?? [])[0] ?? updated.mediaUrl;
  const url = path ? await signUrl(path) : null;
  return { ...updated, url };
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

// Message templates

export async function listTemplates(userId: string) {
  return prisma.messageTemplate.findMany({ where: { userId }, orderBy: { displayOrder: 'asc' } });
}

export async function createTemplate(userId: string, content: string, limit: number) {
  if (limit === 0) {
    throw new HttpError(403, 'plan_required', 'Message templates require a Premium or higher plan.',
      { requiredPlan: 'premium' });
  }
  const count = await prisma.messageTemplate.count({ where: { userId } });
  if (count >= limit) {
    throw new HttpError(403, 'template_limit_reached',
      `Your plan allows up to ${limit} message templates.`, { limit });
  }
  return prisma.messageTemplate.create({
    data: { userId, content, displayOrder: count },
  });
}

export async function deleteTemplate(templateId: string, userId: string) {
  const template = await prisma.messageTemplate.findFirst({ where: { id: templateId, userId } });
  if (!template) throw Errors.notFound('Template not found');
  await prisma.messageTemplate.delete({ where: { id: templateId } });
}

export { recordInteraction };
