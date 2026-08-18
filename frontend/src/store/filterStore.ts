import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GridQuery } from '../services/api';

const PERSIST_KEY = 'grid_filters_v2';

/**
 * Discovery filter state shared between the Filters modal and the Browse grid.
 * Spec-backed grid params: onlineOnly, ageMin/Max, heightMin/Max, bodyType,
 * tribes, tags, lookingFor, sort, radius (meters).
 * Frontend additions (sent as extra query params; documented in backend-spec
 * __frontendSpecAdditions): gender, relationshipIntent, verifiedOnly,
 * activeLast5Min/30Min, highReplyRate, recentlyJoined, advancedFilters (JSON).
 */
export interface AdvancedFilters {
  education?: string[];
  occupation?: string[];
  language?: string[];
  religion?: string[];
  drinking?: string[];
  smoking?: string[];
  relationshipGoal?: string[];
}

export interface Filters {
  onlineOnly?: boolean;
  sort?: 'distance' | 'fresh';
  radius?: number; // meters
  ageMin?: number;
  ageMax?: number;
  heightMin?: number;
  heightMax?: number;
  bodyType?: string[];
  gender?: string[];
  relationshipIntent?: string[];
  lookingFor?: string[];
  tribes?: string[];
  tags?: string[];
  verifiedOnly?: boolean;
  activeLast5Min?: boolean;
  activeLast30Min?: boolean;
  highReplyRate?: boolean;
  recentlyJoined?: boolean;
  advancedFilters?: AdvancedFilters;
}

interface FilterState {
  filters: Filters;
  hydrated: boolean;
  /** Monotonic counter bumped on apply so the grid knows to refetch. */
  version: number;
  apply: (f: Filters) => void;
  reset: () => void;
  /** Restore persisted filters once on app start. */
  hydrate: () => Promise<void>;
  /** Number of active (non-default) filter groups — for the header badge. */
  activeCount: () => number;
  /** Build the grid query payload (without lat/lng/limit/offset). */
  toQuery: () => Omit<GridQuery, 'lat' | 'lng' | 'limit' | 'offset'>;
}

function countActive(f: Filters): number {
  let n = 0;
  if (f.onlineOnly) n++;
  if (f.sort && f.sort !== 'distance') n++;
  if (f.radius) n++;
  if (f.ageMin != null || f.ageMax != null) n++;
  if (f.heightMin != null || f.heightMax != null) n++;
  if (f.bodyType?.length) n++;
  if (f.gender?.length) n++;
  if (f.relationshipIntent?.length) n++;
  if (f.lookingFor?.length) n++;
  if (f.tribes?.length) n++;
  if (f.tags?.length) n++;
  if (f.verifiedOnly) n++;
  if (f.activeLast5Min) n++;
  if (f.activeLast30Min) n++;
  if (f.highReplyRate) n++;
  if (f.recentlyJoined) n++;
  return n;
}

function persist(f: Filters) {
  AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(f)).catch(() => {});
}

export const useFilterStore = create<FilterState>((set, get) => ({
  filters: {},
  hydrated: false,
  version: 0,

  apply: (f) => {
    persist(f);
    set({ filters: f, version: get().version + 1 });
  },

  reset: () => {
    AsyncStorage.removeItem(PERSIST_KEY).catch(() => {});
    set({ filters: {}, version: get().version + 1 });
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(PERSIST_KEY);
      if (raw) set({ filters: JSON.parse(raw) as Filters });
    } catch {
      /* ignore corrupt cache */
    }
    set({ hydrated: true });
  },

  activeCount: () => countActive(get().filters),

  toQuery: () => {
    const f = get().filters;
    return {
      onlineOnly: f.onlineOnly,
      ageMin: f.ageMin,
      ageMax: f.ageMax,
      heightMin: f.heightMin,
      heightMax: f.heightMax,
      bodyType: f.bodyType?.length ? f.bodyType : undefined,
      tribes: f.tribes?.length ? f.tribes : undefined,
      tags: f.tags?.length ? f.tags : undefined,
      lookingFor: f.lookingFor?.length ? f.lookingFor : undefined,
      gender: f.gender?.length ? f.gender : undefined,
      relationshipIntent: f.relationshipIntent?.length ? f.relationshipIntent : undefined,
      sort: f.sort,
      radius: f.radius,
      verifiedOnly: f.verifiedOnly || undefined,
      activeLast5Min: f.activeLast5Min || undefined,
      activeLast30Min: f.activeLast30Min || undefined,
      highReplyRate: f.highReplyRate || undefined,
      recentlyJoined: f.recentlyJoined || undefined,
      // advancedFilters intentionally not sent: education/occupation/language/
      // religion/drinking/smoking/relationshipGoal have no columns on the User
      // model, so the server logs and ignores them. The UI for them is hidden
      // (app/filters.tsx) until the product data model exists.
      advancedFilters: undefined,
    };
  },
}));
