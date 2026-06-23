import { create } from 'zustand';
import { getViews, getReceivedTaps, ApiError, type ProfileViewItem, type TapItem } from '../services/api';
import type { UserCard } from '../types/api';

interface InterestState {
  userId: string | null;
  views: ProfileViewItem[];
  taps: TapItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  fetchInterest: (canSeeViews: boolean, refreshing?: boolean) => Promise<void>;
  reset: () => void;
  bumpView: (item: ProfileViewItem) => void;
  bumpTap: (item: TapItem) => void;
}

function sortViews(list: ProfileViewItem[]) {
  return [...list].sort(
    (a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime()
  );
}

function sortTaps(list: TapItem[]) {
  return [...list].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export const useInterestStore = create<InterestState>((set, get) => ({
  userId: null,
  views: [],
  taps: [],
  loading: false,
  refreshing: false,
  error: null,

  reset: () => set({ userId: null, views: [], taps: [], loading: false, refreshing: false, error: null }),

  fetchInterest: async (canSeeViews, refreshing = false) => {
    set(refreshing ? { refreshing: true, error: null } : { loading: true, error: null });
    try {
      const [v, t] = await Promise.allSettled([getViews(), getReceivedTaps()]);
      const next: Partial<InterestState> = { loading: false, refreshing: false };

      if (v.status === 'fulfilled') {
        next.views = sortViews(v.value.views);
      } else if (canSeeViews) {
        next.error = (v.reason as ApiError)?.message ?? 'Could not load views';
        next.views = [];
      } else {
        next.views = [];
      }

      if (t.status === 'fulfilled') {
        next.taps = sortTaps(t.value.taps);
      } else {
        next.error = next.error ?? (t.reason as ApiError)?.message ?? 'Could not load taps';
        next.taps = [];
      }

      set(next as InterestState);
    } catch (e) {
      set({
        loading: false,
        refreshing: false,
        error: (e as ApiError)?.message ?? 'Could not load interest',
      });
    }
  },

  bumpView: (item) => {
    set((s) => {
      const rest = s.views.filter((v) => v.viewer.id !== item.viewer.id);
      return { views: sortViews([item, ...rest]) };
    });
  },

  bumpTap: (item) => {
    set((s) => {
      const rest = s.taps.filter((t) => t.sender.id !== item.sender.id);
      return { taps: sortTaps([item, ...rest]) };
    });
  },
}));

/** Build a view row from a realtime socket payload. */
export function viewFromSocket(p: {
  viewId?: string;
  viewerCard?: UserCard;
  viewedAt?: string;
}): ProfileViewItem | null {
  const card = p.viewerCard;
  if (!card) return null;
  return {
    id: p.viewId ?? card.id,
    viewer: card,
    viewedAt: p.viewedAt ?? new Date().toISOString(),
  };
}

/** Build a tap row from a realtime socket payload. */
export function tapFromSocket(p: {
  tapId?: string;
  senderCard?: UserCard;
  createdAt?: string;
}): TapItem | null {
  const card = p.senderCard;
  if (!card) return null;
  return {
    id: p.tapId ?? card.id,
    sender: card,
    createdAt: p.createdAt ?? new Date().toISOString(),
  };
}
