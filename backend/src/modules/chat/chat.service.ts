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

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Fetch reactions grouped by messageId → [{emoji, count, userReacted}]. */
async function reactionsByMessage(messageIds: string[], viewerId: string) {
  const map = new Map<string, { emoji: string; count: number; userReacted: boolean }[]>();
  if (messageIds.length === 0) return map;
  const reactions = await prisma.messageReaction.findMany({
    where: { messageId: { in: messageIds } },
    select: { messageId: true, emoji: true, userId: true },
  });
  const grouped = new Map<string, Map<string, { count: number; userReacted: boolean }>>();
  for (const r of reactions) {
    if (!grouped.has(r.messageId)) grouped.set(r.messageId, new Map());
    const emojiMap = grouped.get(r.messageId)!;
    const cur = emojiMap.get(r.emoji) ?? { count: 0, userReacted: false };
    cur.count += 1;
    if (r.userId === viewerId) cur.userReacted = true;
    emojiMap.set(r.emoji, cur);
  }
  for (const [msgId, emojiMap] of grouped) {
    map.set(msgId, [...emojiMap.entries()].map(([emoji, v]) => ({ emoji, count: v.count, userReacted: v.userReacted })));
  }
  return map;
}

/**
 * Reply-quote preview for a message.
 *
 * Carries `type` + media so the client can render a real thumbnail (photo/video)
 * or a voice affordance for the quoted message WITHOUT having to find the
 * original in its loaded page — quoted thumbnails now work even when the
 * original sits far outside the paginated window.
 *
 * Media URLs are passed in already-signed by the caller: the sync
 * `serializeMessage` has no way to await `signUrl`, so it passes null and only
 * the viewer-aware `serializeMessageForViewer` resolves them. Raw R2 keys are
 * never emitted.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function replyPreview(replyTo: any, signedMediaUrl: string | null, signedThumbnailUrl: string | null) {
  if (!replyTo) return null;
  return {
    id: replyTo.id,
    senderId: replyTo.senderId,
    content: replyTo.isUnsent ? 'message removed' : truncate(replyTo.content ?? '', 60),
    type: replyTo.type,
    mediaUrl: replyTo.isUnsent ? null : signedMediaUrl,
    thumbnailUrl: replyTo.isUnsent ? null : signedThumbnailUrl,
    duration: replyTo.isUnsent ? null : (replyTo.duration ?? null),
  };
}

/** Serialize a message for API responses — never exposes originalContent, moderationFlagged, deletedAt. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeMessage(msg: any, reactions?: { emoji: string; count: number; userReacted: boolean }[]) {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    type: msg.type,
    content:    msg.isUnsent ? null : msg.content,
    caption:    msg.isUnsent ? null : (msg.caption ?? null),
    ciphertext: msg.isUnsent ? null : msg.ciphertext,
    mediaUrls:  msg.mediaUrls ?? [],
    mediaUrl:   msg.mediaUrl ?? null,
    // Video poster frame; signed by serializeMessageForViewer.
    thumbnailUrl: msg.thumbnailUrl ?? null,
    // Playback length in seconds (voice / video).
    duration:   msg.duration ?? null,
    viewOnce:   msg.viewOnce,
    viewedAt:   msg.viewedAt ?? null,
    expiresInSeconds: msg.expiresInSeconds,
    expiresAfterView: msg.expiresAfterView ?? (msg.type === 'expiring_photo'),
    isUnsent:   msg.isUnsent ?? false,
    unsentAt:   msg.unsentAt ?? null,
    isPinned:   msg.isPinned ?? false,
    isStarred:  msg.isStarred ?? false,
    isEdited:   msg.isEdited ?? false,
    editedAt:   msg.editedAt ?? null,
    isForwarded: msg.isForwarded ?? false,
    translatedContent: msg.translatedContent ?? null,
    deliveredAt: msg.deliveredAt ?? null,
    readAt:     msg.readAt ?? null,
    replyToId:  msg.replyToId ?? null,
    // Media in the quote is resolved (signed) by serializeMessageForViewer.
    replyTo: replyPreview(msg.replyTo, null, null),
    reactions: reactions ?? [],
    createdAt:  msg.createdAt,
  };
}

function isExpiringViewOnce(msg: { type: string; viewOnce?: boolean }) {
  return msg.type === 'expiring_photo' || (msg.type === 'photo' && msg.viewOnce);
}

/** Sign media URLs and redact view-once content for recipients who haven't opened yet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function serializeMessageForViewer(
  msg: any,
  viewerId: string,
  reactions?: { emoji: string; count: number; userReacted: boolean }[],
) {
  const base = serializeMessage(msg, reactions);
  const isRecipient = msg.senderId !== viewerId;
  const hideMedia = isExpiringViewOnce(msg) && isRecipient && !msg.viewedAt;

  const rawUrls: string[] = hideMedia ? [] : (msg.mediaUrls ?? []);
  const signed = (await signUrls(rawUrls)).filter((u): u is string => !!u);
  const mediaUrl = signed[0] ?? (hideMedia ? null : await signUrl(msg.mediaUrl));
  const thumbnailUrl = hideMedia ? null : await signUrl(msg.thumbnailUrl);

  // The quoted message's own media is signed here too, so a reply to a photo or
  // video renders its thumbnail without the client re-deriving anything. A quote
  // of a view-once photo deliberately carries no media (it would leak the
  // one-shot image into every reply that references it).
  const quoted = msg.replyTo;
  const quoteHidden = quoted ? isExpiringViewOnce(quoted) : false;
  const replyTo = quoted
    ? replyPreview(
        quoted,
        quoteHidden ? null : await signUrl((quoted.mediaUrls ?? [])[0] ?? quoted.mediaUrl),
        quoteHidden ? null : await signUrl(quoted.thumbnailUrl),
      )
    : null;

  return { ...base, mediaUrls: signed, mediaUrl, thumbnailUrl, replyTo };
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

export async function archiveConversation(conversationId: string, userId: string, archived: boolean) {
  const convo = await getParticipantConversation(userId, conversationId);
  const isA = convo.userAId === userId;
  const stamp = archived ? new Date() : null;
  return prisma.conversation.update({
    where: { id: conversationId },
    data: isA ? { aArchivedAt: stamp } : { bArchivedAt: stamp },
  });
}

export async function listConversations(userId: string, folder: 'inbox' | 'requests', archived = false) {
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

  // Archived filter (per viewer side). Default inbox hides archived threads.
  const isViewerArchived = (c: (typeof conversations)[number]) =>
    (c.userAId === userId ? c.aArchivedAt : c.bArchivedAt) != null;
  const visible = conversations.filter((c) => (archived ? isViewerArchived(c) : !isViewerArchived(c)));

  return visible.map((c) => ({
    ...c,
    unreadCount: unreadByConvoId.get(c.id) ?? 0,
  }));
}

export async function listMessages(conversationId: string, before: Date | undefined, limit: number, viewerId: string) {
  // Determine which side the viewer is on so per-side "delete for me" flags apply.
  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userAId: true, disappearingMessages: true },
  });
  const isA = convo?.userAId === viewerId;

  // Disappearing-messages cutoff (filter only — no destructive delete).
  const cutoff = disappearingCutoff(convo?.disappearingMessages ?? null);

  const raw = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      ...(isA ? { deletedByA: false } : { deletedByB: false }),
      ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: { replyTo: true },
  });

  const hasMore = raw.length > limit;
  const slice = hasMore ? raw.slice(0, limit) : raw;
  const nextCursor = hasMore ? slice[slice.length - 1].createdAt.toISOString() : null;
  const reactionsByMsg = await reactionsByMessage(slice.map((m) => m.id), viewerId);
  const starredRows = await prisma.starredMessage.findMany({
    where: { userId: viewerId, messageId: { in: slice.map((m) => m.id) } },
    select: { messageId: true },
  });
  const starredSet = new Set(starredRows.map((s) => s.messageId));
  const messages = await Promise.all(
    slice.map(async (m) => ({
      ...(await serializeMessageForViewer(m, viewerId, reactionsByMsg.get(m.id))),
      isStarred: starredSet.has(m.id),
    })),
  );

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
    caption?: string;
    mediaUrls?: string[];
    /** Video poster frame (R2 key or hosted URL), generated client-side. */
    thumbnailUrl?: string;
    /** Playback length in seconds (voice / video). */
    duration?: number;
    viewOnce?: boolean;
    expiresInSeconds?: number;
    replyToId?: string;
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

  // Validate replyToId belongs to this conversation, if provided
  if (payload.replyToId) {
    const target = await prisma.message.findFirst({
      where: { id: payload.replyToId, conversationId },
      select: { id: true },
    });
    if (!target) throw Errors.badRequest('Reply target message not found in this conversation');
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
        caption: payload.caption ?? null,
        mediaUrls: payload.mediaUrls ?? [],
        thumbnailUrl: payload.thumbnailUrl ?? null,
        duration: payload.duration ?? null,
        viewOnce: payload.viewOnce ?? payload.type === 'expiring_photo',
        expiresAfterView: payload.type === 'expiring_photo',
        expiresInSeconds: payload.expiresInSeconds ?? (payload.type === 'expiring_photo' ? env.expiringPhoto.viewSeconds : null),
        replyToId: payload.replyToId,
      },
      include: { replyTo: true },
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

/** Forward a message into one or more of the caller's other conversations. */
export async function forwardMessage(messageId: string, userId: string, targetConversationIds: string[]) {
  const original = await prisma.message.findUnique({ where: { id: messageId } });
  if (!original) throw Errors.notFound('Message not found');

  const targets = await prisma.conversation.findMany({
    where: {
      id: { in: targetConversationIds },
      OR: [{ userAId: userId }, { userBId: userId }],
    },
  });
  const foundIds = new Set(targets.map((t) => t.id));
  const missing = targetConversationIds.filter((id) => !foundIds.has(id));
  if (missing.length) throw Errors.notFound('One or more target conversations not found');

  const results = [];
  for (const convo of targets) {
    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: convo.id,
          senderId: userId,
          type: original.type,
          content: original.isUnsent ? null : original.content,
          caption: original.caption,
          mediaUrls: original.mediaUrls,
          mediaUrl: original.mediaUrl,
          isForwarded: true,
          forwardedFromId: original.id,
        },
      });
      await tx.conversation.update({
        where: { id: convo.id },
        data: { lastMessageAt: new Date(), state: convo.state === 'pending' ? 'active' : convo.state },
      });
      return msg;
    });
    results.push({
      conversationId: convo.id,
      peerId: otherParty(convo, userId),
      message: serializeMessage(message),
    });
  }
  return results;
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

/** Duration → cutoff Date for disappearing messages (null = off). */
export function disappearingCutoff(setting: string | null): Date | null {
  if (!setting) return null;
  const ms = setting === '24h' ? 24 * 3600e3 : setting === '7d' ? 7 * 86400e3 : setting === '90d' ? 90 * 86400e3 : 0;
  if (!ms) return null;
  return new Date(Date.now() - ms);
}

/** "Delete for me" — hide a message from the requesting side only (either party). */
export async function deleteMessageForMe(conversationId: string, messageId: string, userId: string) {
  const convo = await getParticipantConversation(userId, conversationId);
  const msg = await prisma.message.findFirst({ where: { id: messageId, conversationId }, select: { id: true } });
  if (!msg) throw Errors.notFound('Message not found');
  const isA = convo.userAId === userId;
  return prisma.message.update({
    where: { id: messageId },
    data: isA ? { deletedByA: true } : { deletedByB: true },
  });
}

/** Pin / unpin a message in a 1:1 conversation (either participant). */
export async function setMessagePinned(conversationId: string, messageId: string, userId: string, isPinned: boolean) {
  await getParticipantConversation(userId, conversationId);
  const msg = await prisma.message.findFirst({ where: { id: messageId, conversationId }, select: { id: true } });
  if (!msg) throw Errors.notFound('Message not found');
  return prisma.message.update({ where: { id: messageId }, data: { isPinned } });
}

/** Set the disappearing-messages window for a conversation. */
export async function setDisappearingMessages(conversationId: string, userId: string, setting: string | null) {
  await getParticipantConversation(userId, conversationId);
  return prisma.conversation.update({ where: { id: conversationId }, data: { disappearingMessages: setting } });
}

/** Grouped reaction detail: who reacted with each emoji. */
export async function listMessageReactions(conversationId: string, messageId: string, viewerId: string) {
  await getParticipantConversation(viewerId, conversationId);
  const reactions = await prisma.messageReaction.findMany({
    where: { messageId },
    orderBy: { createdAt: 'asc' },
    include: { user: { include: { photos: { where: { isPrimary: true, isPrivate: false }, take: 1 } } } },
  });
  const grouped = new Map<string, { id: string; firstName: string | null; age: number | null; profilePhoto: string | null }[]>();
  for (const r of reactions) {
    if (!grouped.has(r.emoji)) grouped.set(r.emoji, []);
    grouped.get(r.emoji)!.push({
      id: r.user.id,
      firstName: r.user.firstName ?? r.user.name ?? null,
      age: r.user.age ?? null,
      profilePhoto: await signUrl(r.user.photos[0]?.url ?? null),
    });
  }
  return [...grouped.entries()].map(([emoji, users]) => ({ emoji, users }));
}

// ── Starred messages ─────────────────────────────────────

export async function starMessage(userId: string, messageId: string, type: 'chat' | 'room') {
  return prisma.starredMessage.upsert({
    where: { userId_messageId: { userId, messageId } },
    update: {},
    create: { userId, messageId, type },
  });
}

export async function unstarMessage(userId: string, messageId: string) {
  await prisma.starredMessage.deleteMany({ where: { userId, messageId } });
}

function starredPreview(type: string, content: string | null): string {
  if (type === 'photo' || type === 'image' || type === 'expiring_photo') return '📷 Photo';
  if (type === 'voice' || type === 'voice_note') return '🎤 Voice message';
  if (type === 'video') return '🎥 Video';
  return (content ?? '').slice(0, 120) || 'Message';
}

/** List all of a user's starred messages (both 1:1 and room), newest first. */
export async function listStarredMessages(userId: string) {
  const stars = await prisma.starredMessage.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const chatIds = stars.filter((s) => s.type === 'chat').map((s) => s.messageId);
  const roomIds = stars.filter((s) => s.type === 'room').map((s) => s.messageId);

  const [chatMsgs, roomMsgs] = await Promise.all([
    chatIds.length
      ? prisma.message.findMany({
          where: { id: { in: chatIds } },
          include: {
            sender: { select: { firstName: true, name: true } },
            conversation: {
              include: {
                userA: { select: { id: true, firstName: true, name: true, photos: { where: { isPrimary: true, isPrivate: false }, take: 1 } } },
                userB: { select: { id: true, firstName: true, name: true, photos: { where: { isPrimary: true, isPrivate: false }, take: 1 } } },
              },
            },
          },
        })
      : Promise.resolve([]),
    roomIds.length
      ? prisma.roomMessage.findMany({
          where: { id: { in: roomIds } },
          include: {
            sender: { select: { firstName: true, name: true } },
            room: { select: { id: true, name: true, coverImageUrl: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const chatById = new Map(chatMsgs.map((m) => [m.id, m]));
  const roomById = new Map(roomMsgs.map((m) => [m.id, m]));

  const starred = await Promise.all(
    stars.map(async (s) => {
      if (s.type === 'room') {
        const m = roomById.get(s.messageId);
        if (!m) return null;
        return {
          id: s.id,
          messageId: s.messageId,
          type: 'room' as const,
          roomId: m.room.id,
          conversationId: null,
          title: m.room.name,
          senderName: m.sender.firstName ?? m.sender.name ?? 'Someone',
          preview: starredPreview(m.type, m.content),
          avatarUrl: await signUrl(m.room.coverImageUrl),
          createdAt: m.createdAt,
          starredAt: s.createdAt,
        };
      }
      const m = chatById.get(s.messageId);
      if (!m) return null;
      const peer = m.conversation.userAId === userId ? m.conversation.userB : m.conversation.userA;
      return {
        id: s.id,
        messageId: s.messageId,
        type: 'chat' as const,
        roomId: null,
        conversationId: m.conversationId,
        title: peer.firstName ?? peer.name ?? 'Someone',
        senderName: m.senderId === userId ? 'You' : m.sender.firstName ?? m.sender.name ?? 'Someone',
        preview: starredPreview(m.type, m.content),
        avatarUrl: await signUrl(peer.photos[0]?.url ?? null),
        createdAt: m.createdAt,
        starredAt: s.createdAt,
      };
    }),
  );

  return { starred: starred.filter((s): s is NonNullable<typeof s> => s !== null) };
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

// Reactions

export async function toggleReaction(userId: string, conversationId: string, messageId: string, emoji: string) {
  const msg = await prisma.message.findFirst({ where: { id: messageId, conversationId } });
  if (!msg) throw Errors.notFound('Message not found');

  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });

  let added: boolean;
  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
    added = false;
  } else {
    await prisma.messageReaction.create({ data: { messageId, userId, emoji } });
    added = true;
  }

  const count = await prisma.messageReaction.count({ where: { messageId, emoji } });
  return { added, emoji, count };
}

export { recordInteraction };
