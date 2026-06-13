import { create } from 'zustand';
import type { GridQuery } from '../services/api';

/**
 * Discovery filter state shared between the Filters modal and the Browse grid.
 * Spec-backed grid params: onlineOnly, ageMin/Max, heightMin/Max, bodyType,
 * tribes, tags, lookingFor, sort, radius.
 * Plan-gated extras (verifiedOnly, activeLast5Min, activeLast30Min,
 * highReplyRate, recentlyJoined) are brief-specified and sent as extra query
 * params; gated to Premium+/Gold+ in the UI.
 */
export interface Filters {
  onlineOnly?: boolean;
  ageMin?: number;
  ageMax?: number;
  heightMin?: number;
  heightMax?: number;
  bodyType?: string;
  tribes?: string[];
  tags?: string[];
  lookingFor?: string[];
  sort?: 'distance' | 'fresh';
  radius?: number;
  verifiedOnly?: boolean;
  activeLast5Min?: boolean;
  activeLast30Min?: boolean;
  highReplyRate?: boolean;
  recentlyJoined?: boolean;
}

interface FilterState {
  filters: Filters;
  /** Monotonic counter bumped on apply so the grid knows to refetch. */
  version: number;
  setFilters: (f: Filters) => void;
  apply: (f: Filters) => void;
  reset: () => void;
  /** Build the grid query payload (without lat/lng/limit/offset). */
  toQuery: () => Omit<GridQuery, 'lat' | 'lng' | 'limit' | 'offset'>;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  filters: {},
  version: 0,
  setFilters: (f) => set({ filters: f }),
  apply: (f) => set({ filters: f, version: get().version + 1 }),
  reset: () => set({ filters: {}, version: get().version + 1 }),
  toQuery: () => {
    const f = get().filters;
    return {
      onlineOnly: f.onlineOnly,
      ageMin: f.ageMin,
      ageMax: f.ageMax,
      heightMin: f.heightMin,
      heightMax: f.heightMax,
      bodyType: f.bodyType,
      tribes: f.tribes,
      tags: f.tags,
      lookingFor: f.lookingFor,
      sort: f.sort,
      radius: f.radius,
    };
  },
}));
