import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Self } from '../types/api';
import * as authService from '../services/auth';
import { getMe } from '../services/api';
import { disconnectSocket } from '../services/socket';
import { useInterestStore } from './interestStore';
import { useChatStore } from './chatStore';
import { useGridStore } from './gridStore';

/**
 * Wipe all per-user cached data so one account never sees another account's
 * content. These caches are device-global (not keyed by user id) and are
 * surfaced as a fallback whenever an API call fails, so they must be cleared
 * on every session boundary (login + logout).
 */
async function clearUserScopedData(): Promise<void> {
  useInterestStore.getState().reset();
  useChatStore.setState({ conversations: [], error: null });
  useGridStore.setState({ cards: [], total: 0, offset: 0, error: null });
  await AsyncStorage.multiRemove(['cache_conversations_v2', 'cache_grid_cards']).catch(() => {});
}

interface AuthState {
  user: Self | null;
  hydrating: boolean;
  /** Persist tokens + set user after a successful OTP verification. */
  login: (accessToken: string, refreshToken: string, user: Self) => Promise<void>;
  /** Clear tokens + user. */
  logout: () => Promise<void>;
  /** Re-fetch the authenticated user (e.g. on app start, after profile edit). */
  refreshUser: () => Promise<void>;
  /** Update the cached user locally (after PATCH /me etc.). */
  setUser: (user: Self) => void;
  /** Optimistically update the cached user's primary photo (after upload). */
  setPrimaryPhoto: (url: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  hydrating: true,

  login: async (accessToken, refreshToken, user) => {
    disconnectSocket();
    await clearUserScopedData();
    await authService.setTokens(accessToken, refreshToken);
    set({ user, hydrating: false });
  },

  logout: async () => {
    disconnectSocket();
    await clearUserScopedData();
    await authService.clearTokens();
    set({ user: null, hydrating: false });
  },

  refreshUser: async () => {
    try {
      if (!(await authService.isAuthenticated())) {
        set({ user: null, hydrating: false });
        return;
      }
      const user = await getMe();
      set({ user, hydrating: false });
    } catch {
      set({ hydrating: false });
    }
  },

  setUser: (user) => set({ user }),

  setPrimaryPhoto: (url) =>
    set((state) => ({ user: state.user ? { ...state.user, primaryPhotoUrl: url } : null })),
}));
