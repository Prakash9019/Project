import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserCard } from '../types/api';
import { getGrid, GridQuery, ApiError } from '../services/api';

const CACHE_KEY = 'cache_grid_cards';

interface GridState {
  cards: UserCard[];
  total: number;
  offset: number;
  limit: number;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string | null;
  /** Fetch the first page (resets the list). */
  fetchGrid: (query: Omit<GridQuery, 'limit' | 'offset'>, refreshing?: boolean) => Promise<void>;
  /** Append the next page (pagination on scroll end). */
  fetchMore: (query: Omit<GridQuery, 'limit' | 'offset'>) => Promise<void>;
  /** Hydrate the grid from the last cached page (offline support). */
  hydrateCache: () => Promise<void>;
}

const PAGE = 20;

export const useGridStore = create<GridState>((set, get) => ({
  cards: [],
  total: 0,
  offset: 0,
  limit: PAGE,
  loading: false,
  loadingMore: false,
  refreshing: false,
  error: null,

  fetchGrid: async (query, refreshing = false) => {
    set(refreshing ? { refreshing: true, error: null } : { loading: true, error: null });
    try {
      const res = await getGrid({ ...query, limit: PAGE, offset: 0 });
      set({
        cards: res.cards,
        total: res.total,
        offset: res.cards.length,
        limit: res.limit,
        loading: false,
        refreshing: false,
      });
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(res.cards)).catch(() => {});
    } catch (e) {
      const err = e as ApiError;
      // Fall back to cache if we have nothing to show.
      if (get().cards.length === 0) {
        const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
        if (cached) {
          const cards = JSON.parse(cached) as UserCard[];
          set({ cards, total: cards.length, offset: cards.length });
        }
      }
      set({ loading: false, refreshing: false, error: err.message ?? 'Failed to load grid' });
    }
  },

  fetchMore: async (query) => {
    const { loadingMore, cards, total } = get();
    if (loadingMore || cards.length >= total) return;
    set({ loadingMore: true });
    try {
      const res = await getGrid({ ...query, limit: PAGE, offset: get().offset });
      set({
        cards: [...get().cards, ...res.cards],
        total: res.total,
        offset: get().offset + res.cards.length,
        loadingMore: false,
      });
    } catch (e) {
      const err = e as ApiError;
      set({ loadingMore: false, error: err.message ?? 'Failed to load more' });
    }
  },

  hydrateCache: async () => {
    if (get().cards.length > 0) return;
    const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
    if (cached) {
      const cards = JSON.parse(cached) as UserCard[];
      set({ cards, total: cards.length, offset: cards.length });
    }
  },
}));
