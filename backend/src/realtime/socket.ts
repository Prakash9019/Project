import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { redis, RedisKeys } from '../config/redis';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { bindIo, userRoom, emitToUser } from './emitter';
import { getParticipantConversation, otherParty } from '../modules/chat/chat.service';

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
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId: string = socket.data.userId;
    socket.join(userRoom(userId));
    await redis.set(RedisKeys.presence(userId), '1', 'EX', env.grid.onlineWindowSeconds);
    await prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }).catch(() => {});

    // ── Live location ───────────────────────────────────────
    socket.on('location:update', async (payload: { lat: number; lng: number }) => {
      const { lat, lng } = payload ?? {};
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      await redis.geoadd(RedisKeys.geoUsers, lng, lat, userId);
      await redis.set(RedisKeys.presence(userId), '1', 'EX', env.grid.onlineWindowSeconds);
    });

    // ── Typing indicator ────────────────────────────────────
    socket.on('typing', async (payload: { conversationId: string; isTyping: boolean }) => {
      try {
        const convo = await getParticipantConversation(userId, payload.conversationId);
        emitToUser(otherParty(convo, userId), 'typing', {
          conversationId: payload.conversationId, userId, isTyping: !!payload.isTyping,
        });
      } catch { /* not a participant */ }
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
      const sockets = await io.in(userRoom(userId)).fetchSockets();
      if (sockets.length === 0) await redis.del(RedisKeys.presence(userId));
    });
  });

  return io;
}
