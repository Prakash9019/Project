import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

/**
 * Lightweight global mirror of the theme mode. The live theme is provided by
 * `ThemeContext`/`useTheme()` (which drives all colors); this store exists so
 * non-React code or stores can read the current mode if needed. Persistence is
 * shared via the same `theme_mode` AsyncStorage key.
 */
export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'dark',
  setMode: (mode) => {
    set({ mode });
    AsyncStorage.setItem('theme_mode', mode);
  },
  toggle: () => get().setMode(get().mode === 'dark' ? 'light' : 'dark'),
}));
