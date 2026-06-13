import { io, Socket } from 'socket.io-client';
import { BASE_URL } from './config';
import { getAccessToken } from './auth';

let socket: Socket | null = null;

/**
 * Connect (or reuse) the Socket.IO singleton. The server joins room
 * `user:<id>` on connect (per spec), so all events for the user arrive here.
 */
export async function connectSocket(): Promise<Socket | null> {
  if (socket?.connected) return socket;
  const token = await getAccessToken();
  if (!token) return null;
  if (!socket) {
    socket = io(BASE_URL, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
    });
  } else {
    socket.auth = { token };
    socket.connect();
  }
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Emit a typing indicator for a conversation. */
export function emitTyping(conversationId: string, userId: string, isTyping: boolean): void {
  socket?.emit('typing', { conversationId, userId, isTyping });
}
