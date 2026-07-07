import { Prisma, RoomCategory } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { Errors, HttpError } from '../../utils/httpError';
import { moderation } from '../../adapters/moderation';
import { signUrl } from '../../utils/signUrl';
import { distanceLabel } from '../../utils/geo';
import { emitToRoom } from '../../realtime/emitter';
import { sendPush } from '../../services/push';
import type { SendMessageBody } from './rooms.schema';

// ── Presence / distance helpers ─────────────────────────────────────────────

/** Which of the given users are currently online (presence heartbeat set). */
export async function presenceSet(userIds: string[]): Promise<Set<string>> {
  const online = new Set<string>();
  if (userIds.length === 0) return online;
  const keys = userIds.map((id) => RedisKeys.presence(id));
  const values = await redis.mget(keys).catch(() => [] as (string | null)[]);
  userIds.forEach((id, i) => {
    if (values[i] != null) online.add(id);
  });
  return online;
}

/** Distance in meters from the viewer to each target, via the shared geo index. */
export async function distanceMap(viewerId: string, targetIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const others = targetIds.filter((id) => id !== viewerId);
  if (others.length === 0) return map;
  const pipeline = redis.pipeline();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const id of others) (pipeline as any).geodist(RedisKeys.geoUsers, viewerId, id, 'm');
  const results = await pipeline.exec().catch(() => null);
  if (!results) return map;
  others.forEach((id, i) => {
    const [, dist] = results[i] ?? [];
    if (dist != null) map.set(id, Number(dist));
  });
  return map;
}

// ── Serializers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function primaryPhotoPath(user: any): string | null {
  const primary = (user.photos ?? []).find((p: any) => p.isPrimary) ?? user.photos?.[0];
  return primary?.url ?? null;
}

/**
 * Compact sender/member card. Never exposes phone, email, exact location or
 * firebaseUid. `username` is always the firstName (NearMe has no username field).
 */
export async function buildUserCard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any,
  opts: { online: boolean; distanceMeters?: number },
) {
  return {
    id: user.id,
    firstName: user.firstName ?? user.name ?? null,
    username: user.firstName ?? user.name ?? null,
    age: user.age ?? null,
    isVerified: user.isVerified ?? false,
    planBadge: user.plan && user.plan !== 'free' ? user.plan : null,
    distanceLabel: opts.distanceMeters != null ? distanceLabel(opts.distanceMeters) : null,
    profilePhotoUrl: await signUrl(primaryPhotoPath(user)),
    isOnline: opts.online,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeRoom(room: any, isJoined: boolean, onlineCount?: number) {
  return {
    id: room.id,
    name: room.name,
    description: room.description ?? null,
    category: room.category,
    city: room.city ?? null,
    state: room.state ?? null,
    country: room.country,
    isOfficial: room.isOfficial,
    isVerifiedOnly: room.isVerifiedOnly,
    coverImageUrl: room.coverImageUrl ?? null,
    memberCount: room.memberCount,
    onlineCount: onlineCount ?? room.onlineCount,
    lastActivityAt: room.lastActivityAt,
    rules: room.rules ?? null,
    isJoined,
    createdAt: room.createdAt,
  };
}

const PHOTO_INCLUDE = { photos: { where: { isPrimary: true }, take: 1 } } as const;

// ── Room membership guard ────────────────────────────────────────────────────

export async function assertRoomMember(userId: string, roomId: string) {
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!member) throw new HttpError(403, 'not_a_room_member', 'You must join this room first');
  return member;
}

async function getRoomOrThrow(roomId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || !room.isActive) throw Errors.notFound('Room not found');
  return room;
}

// ── Live online count for a room ─────────────────────────────────────────────

async function computeOnlineCount(roomId: string): Promise<number> {
  const members = await prisma.roomMember.findMany({
    where: { roomId },
    select: { userId: true },
    take: 1000,
  });
  const online = await presenceSet(members.map((m) => m.userId));
  return online.size;
}

// ── Discover / list ──────────────────────────────────────────────────────────

export async function listRooms(
  userId: string,
  opts: { category?: RoomCategory; city?: string; search?: string; limit: number; offset: number },
) {
  const where: Prisma.RoomWhereInput = {
    isActive: true,
    // WhatsApp-style Discover: never surface rooms the user has already joined —
    // they live in "My Groups", so they must not appear here or offer "Join" again.
    members: { none: { userId } },
  };
  if (opts.category) where.category = opts.category;
  if (opts.city) where.city = { equals: opts.city, mode: 'insensitive' };
  if (opts.search) {
    where.OR = [
      { name: { contains: opts.search, mode: 'insensitive' } },
      { city: { contains: opts.search, mode: 'insensitive' } },
    ];
  }

  const rooms = await prisma.room.findMany({
    where,
    orderBy: [{ memberCount: 'desc' }, { lastActivityAt: 'desc' }],
    take: opts.limit,
    skip: opts.offset,
  });

  const ranked = await rankByRecommendation(userId, rooms);
  // Joined rooms are already excluded above, so every Discover card is un-joined.
  return ranked.map((r) => serializeRoom(r, false));
}

/**
 * Recommendation ordering (applied only when no explicit category/search filter
 * would make it meaningless): city rooms matching the user's location first,
 * then orientation rooms matching wantToSee, then everything else — while
 * preserving the memberCount/lastActivity ordering within each bucket.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rankByRecommendation(userId: string, rooms: any[]): Promise<any[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { whereAreYouFrom: true, wantToSee: true },
  });
  const userCity = user?.whereAreYouFrom?.toLowerCase() ?? null;
  const wantsSameSex = (user?.wantToSee ?? []).some((w) => w === 'men' || w === 'women');

  const score = (r: { category: RoomCategory; city: string | null }): number => {
    if (userCity && r.category === 'city_dating' && r.city?.toLowerCase() === userCity) return 0;
    if (wantsSameSex && r.category === 'orientation') return 1;
    return 2;
  };
  // Stable sort: keep original (memberCount/lastActivity) order within each bucket.
  return rooms
    .map((r, i) => ({ r, i }))
    .sort((a, b) => score(a.r) - score(b.r) || a.i - b.i)
    .map((x) => x.r);
}

export async function listJoinedRooms(userId: string, opts: { limit: number; offset: number }) {
  const memberships = await prisma.roomMember.findMany({
    where: { userId },
    include: { room: true },
    take: opts.limit,
    skip: opts.offset,
  });
  const active = memberships.filter((m) => m.room.isActive);
  // Sort by room activity desc
  active.sort((a, b) => b.room.lastActivityAt.getTime() - a.room.lastActivityAt.getTime());

  const withUnread = await Promise.all(
    active.map(async (m) => {
      const unreadCount = await unreadCountFor(userId, m.roomId);
      return { ...serializeRoom(m.room, true), unreadCount, role: m.role };
    }),
  );
  return withUnread;
}

async function unreadCountFor(userId: string, roomId: string): Promise<number> {
  const lastRead = await redis.get(RedisKeys.roomLastRead(userId, roomId)).catch(() => null);
  const since = lastRead ? new Date(Number(lastRead)) : null;
  return prisma.roomMessage.count({
    where: {
      roomId,
      isDeleted: false,
      senderId: { not: userId },
      ...(since ? { createdAt: { gt: since } } : {}),
    },
  });
}

export async function markRoomRead(userId: string, roomId: string): Promise<void> {
  // 7-day TTL is ample; a re-read simply refreshes it.
  await redis
    .set(RedisKeys.roomLastRead(userId, roomId), String(Date.now()), 'EX', 7 * 86400)
    .catch(() => {});
}

export async function getRoomDetail(userId: string, roomId: string) {
  const room = await getRoomOrThrow(roomId);
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { role: true },
  });
  const onlineCount = await computeOnlineCount(roomId);
  // myRole/isCreator let the client gate admin-only affordances (pin, edit).
  return {
    ...serializeRoom(room, !!member, onlineCount),
    myRole: member?.role ?? null,
    isCreator: room.creatorId === userId,
  };
}

// ── Join / leave ──────────────────────────────────────────────────────────────

export async function joinRoom(userId: string, roomId: string) {
  const room = await getRoomOrThrow(roomId);

  if (room.isVerifiedOnly) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isVerified: true } });
    if (!user?.isVerified) {
      throw new HttpError(403, 'verified_only_room', 'This room is for verified users only');
    }
  }

  const existing = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });

  if (!existing) {
    await prisma.$transaction([
      prisma.roomMember.create({ data: { roomId, userId, role: 'member' } }),
      prisma.room.update({ where: { id: roomId }, data: { memberCount: { increment: 1 } } }),
    ]);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, name: true } });
    const updated = await prisma.room.findUnique({ where: { id: roomId } });
    emitToRoom(roomId, 'room:member_joined', {
      userId,
      firstName: user?.firstName ?? user?.name ?? null,
      memberCount: updated?.memberCount ?? room.memberCount + 1,
    });
  }

  return getRoomDetail(userId, roomId);
}

export async function leaveRoom(userId: string, roomId: string): Promise<void> {
  const existing = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!existing) return;
  const [, updated] = await prisma.$transaction([
    prisma.roomMember.delete({ where: { roomId_userId: { roomId, userId } } }),
    prisma.room.update({
      where: { id: roomId },
      data: { memberCount: { decrement: 1 } },
    }),
  ]);
  emitToRoom(roomId, 'room:member_left', { userId, memberCount: Math.max(0, updated.memberCount) });
}

// ── Messages ──────────────────────────────────────────────────────────────────

/** Fetch reactions grouped by messageId → [{emoji, count, userReacted}]. */
async function reactionsByMessage(messageIds: string[], viewerId: string) {
  const map = new Map<string, { emoji: string; count: number; userReacted: boolean }[]>();
  if (messageIds.length === 0) return map;
  const reactions = await prisma.roomMessageReaction.findMany({
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
    map.set(
      msgId,
      [...emojiMap.entries()].map(([emoji, v]) => ({ emoji, count: v.count, userReacted: v.userReacted })),
    );
  }
  return map;
}

/** Count delivery receipts per message (how many members received each). */
async function deliveriesByMessage(messageIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (messageIds.length === 0) return map;
  const grouped = await prisma.roomMessageDelivery.groupBy({
    by: ['messageId'],
    where: { messageId: { in: messageIds } },
    _count: { id: true },
  });
  for (const g of grouped) map.set(g.messageId, g._count.id);
  return map;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

interface SerializeMsgCtx {
  viewerId: string;
  online: Set<string>;
  distances: Map<string, number>;
  reactions: Map<string, { emoji: string; count: number; userReacted: boolean }[]>;
  /** messageId → number of OTHER members who have received the message. */
  deliveries: Map<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function serializeMessage(msg: any, ctx: SerializeMsgCtx) {
  const sender = await buildUserCard(msg.sender, {
    online: ctx.online.has(msg.senderId),
    distanceMeters: ctx.distances.get(msg.senderId),
  });
  return {
    id: msg.id,
    roomId: msg.roomId,
    senderId: msg.senderId,
    sender,
    type: msg.type,
    content: msg.isDeleted ? 'Message removed' : msg.content,
    mediaUrl: msg.isDeleted ? null : await signUrl(msg.mediaUrl),
    isPinned: msg.isPinned,
    isDeleted: msg.isDeleted,
    replyTo: msg.replyTo
      ? {
          id: msg.replyTo.id,
          senderFirstName: msg.replyTo.sender?.firstName ?? msg.replyTo.sender?.name ?? null,
          content: msg.replyTo.isDeleted ? 'Message removed' : truncate(msg.replyTo.content, 60),
        }
      : null,
    reactions: ctx.reactions.get(msg.id) ?? [],
    // Group delivery: how many OTHER members have received this. The sender's
    // tick shows double-grey once this is ≥ 1. Groups never show blue (read).
    deliveredCount: ctx.deliveries.get(msg.id) ?? 0,
    createdAt: msg.createdAt,
    editedAt: msg.editedAt ?? null,
  };
}

export async function listMessages(
  userId: string,
  roomId: string,
  opts: { before?: string; limit: number },
) {
  const messages = await prisma.roomMessage.findMany({
    where: {
      roomId,
      ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
    },
    include: {
      sender: { include: PHOTO_INCLUDE },
      replyTo: { include: { sender: { select: { firstName: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: opts.limit + 1,
  });

  const hasMore = messages.length > opts.limit;
  const page = hasMore ? messages.slice(0, opts.limit) : messages;

  const senderIds = [...new Set(page.map((m) => m.senderId))];
  const [online, distances, reactions, deliveries] = await Promise.all([
    presenceSet(senderIds),
    distanceMap(userId, senderIds),
    reactionsByMessage(page.map((m) => m.id), userId),
    deliveriesByMessage(page.map((m) => m.id)),
  ]);
  const ctx: SerializeMsgCtx = { viewerId: userId, online, distances, reactions, deliveries };

  const serialized = await Promise.all(page.map((m) => serializeMessage(m, ctx)));
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  // Mark read on fetch of the newest page (no cursor).
  if (!opts.before) await markRoomRead(userId, roomId);

  return { messages: serialized, hasMore, nextCursor };
}

/**
 * Deterministic room content-rule check, run BEFORE the AI moderation pass.
 * Room rules forbid sharing phone numbers and external links (users must move
 * to in-app private chat, not exchange off-platform contact). This works even
 * when the AI moderation adapter is unavailable or key-less, and catches things
 * an offensiveness classifier never would.
 */
export function violatesRoomContentRules(content: string): boolean {
  // Phone numbers. Collapse only phone-style punctuation ( ) . - + between digits
  // (NOT whitespace — that would merge datetimes/dates into false positives),
  // then look for a 10+ digit run.
  const collapsed = content.replace(/(?<=\d)[().+-]+(?=\d)/g, '');
  if (/\d{10,}/.test(collapsed)) return true;
  // Common space-grouped forms: Indian 5+5 and US 3-3-4.
  if (/\b\d{5}\s\d{5}\b/.test(content)) return true;
  if (/\b\d{3}[\s-]\d{3}[\s-]\d{4}\b/.test(content)) return true;

  // External links: explicit protocol, www., or a bare domain with a common TLD.
  if (/\bhttps?:\/\//i.test(content)) return true;
  if (/\bwww\.\w/i.test(content)) return true;
  if (/\b[a-z0-9][a-z0-9-]*\.(com|net|org|in|io|me|xyz|co|link|gg|ly|app|dev|info|biz|site|online)\b/i.test(content)) {
    return true;
  }
  return false;
}

export async function sendMessage(userId: string, roomId: string, body: SendMessageBody) {
  await getRoomOrThrow(roomId);

  // Deterministic content-rule gate (phone numbers / external links) — enforced
  // regardless of AI availability.
  if (violatesRoomContentRules(body.content)) {
    throw new HttpError(451, 'message_flagged', 'Your message was flagged for review');
  }

  // AI text moderation — reject offensive content (harassment, hate, threats, etc.)
  const verdict = await moderation.classifyText(body.content).catch(() => ({ offensive: false, categories: [], score: 0 }));
  if (verdict.offensive) {
    throw new HttpError(451, 'message_flagged', 'Your message was flagged for review');
  }

  const created = await prisma.roomMessage.create({
    data: {
      roomId,
      senderId: userId,
      content: body.content,
      type: body.type,
      mediaUrl: body.mediaUrl ?? null,
      replyToId: body.replyToId ?? null,
    },
    include: {
      sender: { include: PHOTO_INCLUDE },
      replyTo: { include: { sender: { select: { firstName: true, name: true } } } },
    },
  });

  await prisma.room.update({ where: { id: roomId }, data: { lastActivityAt: new Date() } });

  const [online, distances] = await Promise.all([
    presenceSet([userId]),
    Promise.resolve(new Map<string, number>()),
  ]);
  const card = await serializeMessage(created, {
    viewerId: userId,
    online,
    distances,
    reactions: new Map(),
    deliveries: new Map(),
  });

  emitToRoom(roomId, 'room:message', card);

  // Best-effort batch push to members with room notifications enabled (skip
  // muted members and the sender). FCM topic room-<id> is the production path;
  // the current push service fans out per-member.
  void notifyRoomMembers(roomId, userId, card);

  return card;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyRoomMembers(roomId: string, senderId: string, card: any): Promise<void> {
  try {
    const [room, members] = await Promise.all([
      prisma.room.findUnique({ where: { id: roomId }, select: { name: true } }),
      prisma.roomMember.findMany({
        where: { roomId, isMuted: false, userId: { not: senderId } },
        select: { userId: true },
        take: 1000,
      }),
    ]);
    const title = room?.name ?? 'Room';
    const body = `${card.sender?.firstName ?? 'Someone'}: ${card.content}`;
    await Promise.all(
      members.map((m) =>
        sendPush(m.userId, { title, body, data: { type: 'room_message', roomId } }).catch(() => {}),
      ),
    );
  } catch {
    /* push is best-effort */
  }
}

export async function toggleReaction(userId: string, roomId: string, messageId: string, emoji: string) {
  const msg = await prisma.roomMessage.findFirst({ where: { id: messageId, roomId } });
  if (!msg) throw Errors.notFound('Message not found');

  const existing = await prisma.roomMessageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });

  let added: boolean;
  if (existing) {
    await prisma.roomMessageReaction.delete({ where: { id: existing.id } });
    added = false;
  } else {
    await prisma.roomMessageReaction.create({ data: { messageId, userId, emoji } });
    added = true;
  }

  const count = await prisma.roomMessageReaction.count({ where: { messageId, emoji } });
  emitToRoom(roomId, 'room:message_reaction', { messageId, emoji, count, userId, added });
  return { added, emoji, count };
}

export async function listMembers(
  userId: string,
  roomId: string,
  opts: { limit: number; offset: number; online?: boolean },
) {
  const room = await getRoomOrThrow(roomId);
  const members = await prisma.roomMember.findMany({
    where: { roomId },
    include: { user: { include: PHOTO_INCLUDE } },
    orderBy: { joinedAt: 'asc' },
  });

  const userIds = members.map((m) => m.user.id);
  const [onlineIds, distances] = await Promise.all([
    presenceSet(userIds),
    distanceMap(userId, userIds),
  ]);

  // Sort: online first, then by joined date (already asc from query).
  const sorted = [...members].sort((a, b) => {
    const ao = onlineIds.has(a.userId) ? 0 : 1;
    const bo = onlineIds.has(b.userId) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.joinedAt.getTime() - b.joinedAt.getTime();
  });

  const filtered = opts.online ? sorted.filter((m) => onlineIds.has(m.userId)) : sorted;
  const page = filtered.slice(opts.offset, opts.offset + opts.limit);

  const serialized = await Promise.all(
    page.map(async (m) => ({
      id: m.id,
      role: m.role,
      // True for the member who created the room (tracked via Room.creatorId,
      // separate from the RoomRole enum). Lets the client render a Creator section.
      isCreator: room.creatorId === m.userId,
      joinedAt: m.joinedAt,
      user: await buildUserCard(m.user, {
        online: onlineIds.has(m.userId),
        distanceMeters: distances.get(m.userId),
      }),
    })),
  );
  return { members: serialized, total: filtered.length };
}

export async function toggleMute(userId: string, roomId: string) {
  await getRoomOrThrow(roomId);
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!member) throw new HttpError(403, 'not_a_room_member', 'You must join this room first');
  const updated = await prisma.roomMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { isMuted: !member.isMuted },
  });
  return { muted: updated.isMuted };
}

export async function reportRoom(userId: string, roomId: string, reason: string, details?: string) {
  await getRoomOrThrow(roomId);
  await prisma.roomReport.create({ data: { roomId, reporterId: userId, reason, details: details ?? null } });
  return { ok: true };
}

/** Map a free-text report reason onto the ModerationFlagType enum (defaults to spam). */
function reasonToFlagType(reason: string): 'explicit_sexual' | 'threat' | 'hate_speech' | 'anti_lgbtq' | 'nudity' | 'spam' {
  const r = reason.toLowerCase();
  if (/(threat|violence|kill|harm)/.test(r)) return 'threat';
  if (/(lgbtq|homophob|transphob)/.test(r)) return 'anti_lgbtq';
  if (/(hate|racis|slur)/.test(r)) return 'hate_speech';
  if (/(nud|nsfw)/.test(r)) return 'nudity';
  if (/(sex|explicit|porn)/.test(r)) return 'explicit_sexual';
  return 'spam';
}

export async function reportMessage(userId: string, roomId: string, messageId: string, reason: string) {
  const msg = await prisma.roomMessage.findFirst({ where: { id: messageId, roomId } });
  if (!msg) throw Errors.notFound('Message not found');
  // ModerationFlag has no reporter/reason columns — persist target + mapped flagType.
  await prisma.moderationFlag.create({
    data: {
      targetType: 'room_message',
      targetId: messageId,
      flagType: reasonToFlagType(reason),
    },
  });
  return { ok: true };
}

// ── Admin / creator actions ────────────────────────────────────────────────

/**
 * Authorize a room-management action. Returns the room. Passes when the caller
 * is the room's creator OR holds the `admin` role in the room.
 */
async function assertRoomAdmin(userId: string, roomId: string) {
  const room = await getRoomOrThrow(roomId);
  if (room.creatorId === userId) return room;
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { role: true },
  });
  if (member?.role !== 'admin') {
    throw Errors.forbidden('You must be a room admin to do that');
  }
  return room;
}

export async function updateRoom(
  userId: string,
  roomId: string,
  body: { name?: string; description?: string },
) {
  await assertRoomAdmin(userId, roomId);
  const data: Prisma.RoomUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  const updated = await prisma.room.update({ where: { id: roomId }, data });
  emitToRoom(roomId, 'room:info_updated', { name: updated.name, description: updated.description ?? null });
  return getRoomDetail(userId, roomId);
}

export async function pinMessage(userId: string, roomId: string, messageId: string, pin: boolean) {
  await assertRoomAdmin(userId, roomId);
  const msg = await prisma.roomMessage.findFirst({ where: { id: messageId, roomId } });
  if (!msg) throw Errors.notFound('Message not found');
  await prisma.roomMessage.update({ where: { id: messageId }, data: { isPinned: pin } });
  emitToRoom(roomId, 'room:message_pinned', { messageId, isPinned: pin });
  return { ok: true as const, isPinned: pin };
}

export async function removeMember(userId: string, roomId: string, targetUserId: string): Promise<void> {
  const room = await assertRoomAdmin(userId, roomId);
  if (targetUserId === userId) {
    throw new HttpError(400, 'cannot_remove_self', 'Use the leave endpoint to remove yourself');
  }
  if (room.creatorId && targetUserId === room.creatorId) {
    throw new HttpError(400, 'cannot_remove_creator', 'The room creator cannot be removed');
  }
  const existing = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId: targetUserId } },
  });
  if (!existing) throw Errors.notFound('Member not found');
  await prisma.$transaction([
    prisma.roomMember.delete({ where: { roomId_userId: { roomId, userId: targetUserId } } }),
    prisma.room.update({ where: { id: roomId }, data: { memberCount: { decrement: 1 } } }),
  ]);
  emitToRoom(roomId, 'room:member_removed', { userId: targetUserId });
}

export async function updateMemberRole(
  userId: string,
  roomId: string,
  targetUserId: string,
  role: 'admin' | 'member',
) {
  const room = await getRoomOrThrow(roomId);
  // Role changes are creator-only.
  if (room.creatorId !== userId) {
    throw Errors.forbidden('Only the room creator can change roles');
  }
  if (room.creatorId && targetUserId === room.creatorId) {
    throw new HttpError(400, 'cannot_change_creator_role', "The creator's role cannot be changed");
  }
  const existing = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId: targetUserId } },
  });
  if (!existing) throw Errors.notFound('Member not found');
  await prisma.roomMember.update({
    where: { roomId_userId: { roomId, userId: targetUserId } },
    data: { role },
  });
  emitToRoom(roomId, 'room:member_role_changed', { userId: targetUserId, role });
  return { ok: true as const, role };
}

export async function updateRoomPhoto(userId: string, roomId: string, photoUrl: string) {
  await assertRoomAdmin(userId, roomId);
  await prisma.room.update({ where: { id: roomId }, data: { coverImageUrl: photoUrl } });
  const signed = await signUrl(photoUrl);
  emitToRoom(roomId, 'room:info_updated', { coverImageUrl: signed });
  return { coverImageUrl: signed };
}

/**
 * Transfer room ownership (creator-only). The outgoing creator is demoted to
 * admin, the target member is promoted to admin, and Room.creatorId is switched
 * (creator status is derived from creatorId, so no RoomRole 'creator' is needed).
 */
export async function transferOwnership(userId: string, roomId: string, targetUserId: string) {
  const room = await getRoomOrThrow(roomId);
  if (room.creatorId !== userId) {
    throw Errors.forbidden('Only the room creator can transfer ownership');
  }
  if (targetUserId === userId) {
    throw new HttpError(400, 'already_creator', 'You are already the creator');
  }
  const target = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId: targetUserId } },
    select: { id: true },
  });
  if (!target) throw Errors.notFound('Target user is not a member of this room');

  await prisma.$transaction([
    prisma.roomMember.update({
      where: { roomId_userId: { roomId, userId } },
      data: { role: 'admin' },
    }),
    prisma.roomMember.update({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      data: { role: 'admin' },
    }),
    prisma.room.update({ where: { id: roomId }, data: { creatorId: targetUserId } }),
  ]);

  emitToRoom(roomId, 'room:ownership_transferred', { newCreatorId: targetUserId });
  return { ok: true as const, newCreatorId: targetUserId };
}

/** Delete a room and all of its child records (creator-only). */
export async function deleteRoom(userId: string, roomId: string): Promise<void> {
  const room = await getRoomOrThrow(roomId);
  if (room.creatorId !== userId) {
    throw Errors.forbidden('Only the room creator can delete the room');
  }
  const messageIds = await prisma.roomMessage.findMany({
    where: { roomId },
    select: { id: true },
  });
  const ids = messageIds.map((m) => m.id);
  await prisma.$transaction([
    prisma.roomMessageReaction.deleteMany({ where: { messageId: { in: ids } } }),
    prisma.roomMessageDelivery.deleteMany({ where: { messageId: { in: ids } } }),
    // Clear self-referential reply links before deleting the messages themselves,
    // so the replyToId FK can't block the bulk delete.
    prisma.roomMessage.updateMany({ where: { roomId }, data: { replyToId: null } }),
    prisma.roomMessage.deleteMany({ where: { roomId } }),
    prisma.roomMember.deleteMany({ where: { roomId } }),
    prisma.roomReport.deleteMany({ where: { roomId } }),
    prisma.roomMute.deleteMany({ where: { roomId } }),
    prisma.room.delete({ where: { id: roomId } }),
  ]);
  emitToRoom(roomId, 'room:deleted', { roomId });
}

export async function deleteMessage(userId: string, roomId: string, messageId: string): Promise<void> {
  const msg = await prisma.roomMessage.findFirst({ where: { id: messageId, roomId } });
  if (!msg) throw Errors.notFound('Message not found');

  if (msg.senderId !== userId) {
    const member = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { role: true },
    });
    const isMod = member?.role === 'moderator' || member?.role === 'admin';
    if (!isMod) throw Errors.forbidden('You cannot delete this message');
  }

  await prisma.roomMessage.update({
    where: { id: messageId },
    data: { isDeleted: true, content: 'Message removed' },
  });
  emitToRoom(roomId, 'room:message_deleted', { messageId });
}
