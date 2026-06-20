import { create } from 'zustand';
import type { Self } from '../types/api';
import * as authService from '../services/auth';
import { getMe } from '../services/api';

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
    await authService.setTokens(accessToken, refreshToken);
    set({ user, hydrating: false });
  },

  logout: async () => {
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
