import type { Server } from 'socket.io';

let io: Server | null = null;

export function bindIo(server: Server): void {
  io = server;
}

/** Per-user room name. Each socket joins `user:<id>` on connect. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

/** Push an event to all of a user's connected devices. No-op if realtime is unavailable. */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

/** Push an event to both participants of a conversation. */
export function emitToConversation(userIds: string[], event: string, payload: unknown): void {
  for (const id of userIds) emitToUser(id, event, payload);
}

/** Socket.IO room name for a Dating Room. Sockets join `room:<id>`. */
export function roomChannel(roomId: string): string {
  return `room:${roomId}`;
}

/** Broadcast an event to everyone currently in a Dating Room's socket channel. */
export function emitToRoom(roomId: string, event: string, payload: unknown): void {
  io?.to(roomChannel(roomId)).emit(event, payload);
}
