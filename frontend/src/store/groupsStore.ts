import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { JoinedRoomCard } from '../types/api';
import { listJoinedRooms } from '../services/api';

const CACHE_KEY = 'cache_joined_rooms_v1';

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
  /** Replace the full room list (e.g. after the Groups screen's own fetch). */
  setRooms: (rooms: JoinedRoomCard[]) => void;
  /** Prepend a newly-joined/accepted room, replacing any existing entry with the same id. */
  addRoom: (room: JoinedRoomCard) => void;
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
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(res.rooms)).catch(() => {});
    } catch {
      // best-effort — fall back to the last cached list so the tab badge
      // doesn't stay empty for the whole session on a failed fetch.
      if (get().rooms.length === 0) {
        const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
        if (cached) set({ rooms: JSON.parse(cached) as JoinedRoomCard[] });
      }
    }
  },

  setRooms: (rooms) => set({ rooms }),

  addRoom: (room) => {
    const rest = get().rooms.filter((r) => r.id !== room.id);
    set({ rooms: [room, ...rest] });
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
