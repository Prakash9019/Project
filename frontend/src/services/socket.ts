import { io, Socket } from 'socket.io-client';
import { BASE_URL } from './config';
import { getAccessToken } from './auth';

let socket: Socket | null = null;
let socketToken: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// The server's online-presence key expires after ONLINE_WINDOW_SECONDS (120s
// default) unless refreshed — refresh well under that so a live socket is
// never mistaken for offline mid-session (e.g. a message stuck on single tick
// because `sendMessage`'s peer-online check found an expired presence key).
const HEARTBEAT_INTERVAL_MS = 45_000;

function startHeartbeat(s: Socket): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  s.emit('heartbeat');
  heartbeatTimer = setInterval(() => s.emit('heartbeat'), HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

/**
 * Connect (or reuse) the Socket.IO singleton. The server joins room
 * `user:<id>` on connect (per spec), so all events for the user arrive here.
 */
export async function connectSocket(): Promise<Socket | null> {
  const token = await getAccessToken();
  if (!token) return null;

  if (socket && socketToken !== token) {
    socket.disconnect();
    socket = null;
    socketToken = null;
  }

  if (socket?.connected) return socket;

  if (!socket) {
    socket = io(BASE_URL, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
    });
    socketToken = token;
    socket.on('connect', () => startHeartbeat(socket!));
    socket.on('disconnect', stopHeartbeat);
  } else {
    socket.auth = { token };
    socketToken = token;
    socket.connect();
  }
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  stopHeartbeat();
  socket?.disconnect();
  socket = null;
  socketToken = null;
}

/** Emit a typing indicator for a conversation. */
export function emitTyping(conversationId: string, userId: string, isTyping: boolean): void {
  socket?.emit('typing', { conversationId, userId, isTyping });
}

/* ─────────────────────── Dating Rooms (Groups) ─────────────────────── */

/** Join a room's socket channel to receive live messages/typing. */
export function emitRoomJoin(roomId: string): void {
  socket?.emit('room:join', { roomId });
}

/** Leave a room's socket channel. */
export function emitRoomLeave(roomId: string): void {
  socket?.emit('room:leave', { roomId });
}

/** Broadcast a typing indicator within a room. */
export function emitRoomTyping(roomId: string, isTyping: boolean): void {
  socket?.emit('room:typing', { roomId, isTyping });
}

/** Report that this device received a room message (delivery receipt). */
export function emitRoomMessageDelivered(roomId: string, messageId: string): void {
  socket?.emit('room:message_delivered', { roomId, messageId });
}
