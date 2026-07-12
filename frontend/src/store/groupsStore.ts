import { create } from 'zustand';
import type { JoinedRoomCard } from '../types/api';
import { listJoinedRooms } from '../services/api';

/**
 * Joined Dating Rooms with their unread counts, mirrored client-side so the
 * Groups tab can show an unread badge and room toasts can resolve a room's
 * name from its id. Seeded from GET /api/rooms/joined (unreadCount comes from
 * the server's Redis lastread), then kept live by the room:message socket
 * event (increment) and room-open (reset).
 */
interface GroupsState {
  rooms: JoinedRoomCard[];
  fetchJoinedRooms: () => Promise<void>;
  /** Bump a room's unread when a new message arrives while not viewing it. */
  applyIncomingRoomMessage: (roomId: string) => void;
  /** Clear a room's unread (called when the user opens it). */
  markRoomRead: (roomId: string) => void;
  /** Resolve a room's display name from its id (falls back to 'Group'). */
  roomName: (roomId: string) => string;
}

export const useGroupsStore = create<GroupsState>((set, get) => ({
  rooms: [],

  fetchJoinedRooms: async () => {
    try {
      const res = await listJoinedRooms();
      set({ rooms: res.rooms });
    } catch {
      /* best-effort — badge just stays at its last value */
    }
  },

  applyIncomingRoomMessage: (roomId) => {
    const rooms = get().rooms;
    const idx = rooms.findIndex((r) => r.id === roomId);
    if (idx === -1) {
      // Unknown room (e.g. joined on another device) — refresh the list.
      get().fetchJoinedRooms().catch(() => {});
      return;
    }
    set({
      rooms: rooms.map((r) =>
        r.id === roomId ? { ...r, unreadCount: (r.unreadCount ?? 0) + 1 } : r,
      ),
    });
  },

  markRoomRead: (roomId) => {
    set({
      rooms: get().rooms.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)),
    });
  },

  roomName: (roomId) => get().rooms.find((r) => r.id === roomId)?.name ?? 'Group',
}));
