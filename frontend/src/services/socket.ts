import { io, Socket } from 'socket.io-client';
import { BASE_URL } from './config';
import { getAccessToken } from './auth';

let socket: Socket | null = null;
let socketToken: string | null = null;

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
  socket?.disconnect();
  socket = null;
  socketToken = null;
}

/** Emit a typing indicator for a conversation. */
export function emitTyping(conversationId: string, userId: string, isTyping: boolean): void {
  socket?.emit('typing', { conversationId, userId, isTyping });
}
