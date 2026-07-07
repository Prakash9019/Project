import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { redis, RedisKeys } from '../config/redis';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { bindIo, userRoom, emitToUser, emitToRoom, roomChannel } from './emitter';
import { getParticipantConversation, otherParty } from '../modules/chat/chat.service';
import { activeWsConnections } from '../config/metrics';

export function initSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigin, methods: ['GET', 'POST'] },
  });
  bindIo(io);

  // Auth handshake: client connects with `{ auth: { token } }`.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));
    try {
      const claims = verifyAccessToken(token);
      socket.data.userId = claims.sub;
      socket.data.plan = claims.plan ?? 'free';
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId: string = socket.data.userId;
    socket.join(userRoom(userId));
    activeWsConnections.inc();

    // ── Dating Rooms: auto-join socket channels for every room the user is in ──
    prisma.roomMember
      .findMany({ where: { userId }, select: { roomId: true } })
      .then((memberships) => {
        for (const m of memberships) socket.join(roomChannel(m.roomId));
      })
      .catch(() => { /* rooms optional */ });
    await redis.set(RedisKeys.presence(userId), '1', 'EX', env.grid.onlineWindowSeconds);
    await prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }).catch(() => {});

    // ── Delivery backfill: mark any 1:1 messages this user hadn't received yet
    // as delivered, and notify each sender (double-grey tick). ──
    prisma.message
      .findMany({
        where: {
          deliveredAt: null,
          readAt: null,
          isUnsent: false,
          deletedAt: null,
          senderId: { not: userId },
          conversation: { OR: [{ userAId: userId }, { userBId: userId }] },
        },
        select: { id: true, senderId: true, conversationId: true },
        take: 500,
      })
      .then(async (msgs) => {
        if (msgs.length === 0) return;
        await prisma.message.updateMany({
          where: { id: { in: msgs.map((m) => m.id) } },
          data: { deliveredAt: new Date() },
        });
        for (const m of msgs) {
          emitToUser(m.senderId, 'message.status_update', {
            conversationId: m.conversationId,
            messageId: m.id,
            status: 'delivered',
          });
        }
      })
      .catch(() => { /* delivery backfill is best-effort */ });

    // ── Live location ───────────────────────────────────────
    socket.on('location:update', async (payload: { lat: number; lng: number }) => {
      const { lat, lng } = payload ?? {};
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      await redis.geoadd(RedisKeys.geoUsers, lng, lat, userId);
      await redis.set(RedisKeys.presence(userId), '1', 'EX', env.grid.onlineWindowSeconds);
    });

    // ── Typing indicator (Premium+ only) ───────────────────
    socket.on('typing', async (payload: { conversationId: string; isTyping: boolean }) => {
      // Gate: only relay if the sender has a paid plan (typingIndicator feature)
      const plan: string = socket.data.plan ?? 'free';
      if (plan === 'free') return;
      try {
        const convo = await getParticipantConversation(userId, payload.conversationId);
        emitToUser(otherParty(convo, userId), 'typing', {
          conversationId: payload.conversationId, userId, isTyping: !!payload.isTyping,
        });
      } catch { /* not a participant */ }
    });

    // ── Dating Rooms: join / leave / typing ─────────────────
    socket.on('room:join', async (payload: { roomId: string }) => {
      const roomId = payload?.roomId;
      if (!roomId) return;
      const member = await prisma.roomMember
        .findUnique({ where: { roomId_userId: { roomId, userId } }, select: { id: true } })
        .catch(() => null);
      if (member) socket.join(roomChannel(roomId));
    });

    socket.on('room:leave', (payload: { roomId: string }) => {
      const roomId = payload?.roomId;
      if (roomId) socket.leave(roomChannel(roomId));
    });

    socket.on('room:typing', async (payload: { roomId: string; isTyping: boolean }) => {
      const { roomId, isTyping } = payload ?? {};
      if (!roomId) return;
      const member = await prisma.roomMember
        .findUnique({ where: { roomId_userId: { roomId, userId } }, select: { id: true } })
        .catch(() => null);
      if (!member) return;
      const user = await prisma.user
        .findUnique({ where: { id: userId }, select: { firstName: true, name: true } })
        .catch(() => null);
      socket.to(roomChannel(roomId)).emit('room:typing', {
        userId,
        firstName: user?.firstName ?? user?.name ?? null,
        isTyping: !!isTyping,
      });
    });

    // ── Dating Rooms: message delivery receipt ──────────────
    // A member's socket reports it received a room message; record it once and
    // broadcast so the sender's client can flip to double-grey (delivered).
    socket.on('room:message_delivered', async (payload: { roomId: string; messageId: string }) => {
      const { roomId, messageId } = payload ?? {};
      if (!roomId || !messageId) return;
      const member = await prisma.roomMember
        .findUnique({ where: { roomId_userId: { roomId, userId } }, select: { id: true } })
        .catch(() => null);
      if (!member) return;
      const msg = await prisma.roomMessage
        .findFirst({ where: { id: messageId, roomId }, select: { senderId: true } })
        .catch(() => null);
      // Don't record a delivery for the sender's own message.
      if (!msg || msg.senderId === userId) return;
      const existing = await prisma.roomMessageDelivery
        .findUnique({ where: { messageId_userId: { messageId, userId } }, select: { id: true } })
        .catch(() => null);
      if (existing) return; // already recorded — avoid double-emitting
      await prisma.roomMessageDelivery.create({ data: { messageId, userId } }).catch(() => {});
      emitToRoom(roomId, 'room:message_delivered', { messageId });
    });

    // ── Heartbeat ───────────────────────────────────────────
    socket.on('heartbeat', async () => {
      await redis.set(RedisKeys.presence(userId), '1', 'EX', env.grid.onlineWindowSeconds);
    });

    // ── WebRTC call signaling ───────────────────────────────
    // Client emits call:invite → server creates DB record + relays to callee.
    socket.on('call:invite', async (payload: { calleeId: string; type: 'audio' | 'video'; offer: unknown }) => {
      const { calleeId, type, offer } = payload ?? {};
      if (!calleeId || !type) return;
      try {
        const call = await prisma.call.create({
          data: { callerId: userId, calleeId, type, status: 'ringing' },
        });
        emitToUser(calleeId, 'call:invite', { callId: call.id, callerId: userId, type, offer });
      } catch { /* log in production */ }
    });

    // Callee answers → forward answer SDP to caller, update DB.
    socket.on('call:answer', async (payload: { callId: string; answer: unknown }) => {
      const { callId, answer } = payload ?? {};
      if (!callId) return;
      const call = await prisma.call.findFirst({ where: { id: callId, calleeId: userId } }).catch(() => null);
      if (!call) return;
      await prisma.call.update({ where: { id: callId }, data: { status: 'accepted', answeredAt: new Date() } }).catch(() => {});
      emitToUser(call.callerId, 'call:answer', { callId, answer });
    });

    // ICE candidate relay (bidirectional).
    socket.on('call:ice', async (payload: { callId: string; candidate: unknown; targetId: string }) => {
      const { callId, candidate, targetId } = payload ?? {};
      if (!callId || !targetId) return;
      emitToUser(targetId, 'call:ice', { callId, candidate, fromId: userId });
    });

    // Decline.
    socket.on('call:decline', async (payload: { callId: string }) => {
      const { callId } = payload ?? {};
      if (!callId) return;
      const call = await prisma.call.findFirst({ where: { id: callId, calleeId: userId } }).catch(() => null);
      if (!call) return;
      await prisma.call.update({ where: { id: callId }, data: { status: 'declined', endedAt: new Date() } }).catch(() => {});
      emitToUser(call.callerId, 'call:decline', { callId });
    });

    // End call (either party).
    socket.on('call:end', async (payload: { callId: string }) => {
      const { callId } = payload ?? {};
      if (!callId) return;
      const call = await prisma.call.findFirst({
        where: { id: callId, OR: [{ callerId: userId }, { calleeId: userId }] },
      }).catch(() => null);
      if (!call) return;
      const now = new Date();
      const durationSec = call.answeredAt ? Math.floor((now.getTime() - call.answeredAt.getTime()) / 1000) : null;
      await prisma.call.update({ where: { id: callId }, data: { status: 'ended', endedAt: now, durationSec } }).catch(() => {});
      const peerId = call.callerId === userId ? call.calleeId : call.callerId;
      emitToUser(peerId, 'call:end', { callId, durationSec });
    });

    // ── Disconnect ──────────────────────────────────────────
    socket.on('disconnect', async () => {
      activeWsConnections.dec();
      const sockets = await io.in(userRoom(userId)).fetchSockets();
      if (sockets.length === 0) await redis.del(RedisKeys.presence(userId));
    });
  });

  return io;
}
