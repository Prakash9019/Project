import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { AppTheme } from '../theme';
import type { RoomCategory } from '../types/api';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Category → theme color, human label, and icon (Ionicons name). */
export function categoryMeta(theme: AppTheme, category: RoomCategory): {
  color: string;
  label: string;
  icon: IoniconName;
} {
  switch (category) {
    case 'city_dating':
      return { color: theme.brand, label: 'City Dating', icon: 'location' };
    case 'orientation':
      return { color: theme.planPremium, label: 'Orientation', icon: 'heart' };
    case 'age_group':
      return { color: theme.info, label: 'Age', icon: 'people' };
    case 'relationship_intent':
      return { color: theme.planGold, label: 'Intent', icon: 'sparkles' };
    case 'events':
      return { color: theme.success, label: 'Events', icon: 'calendar' };
    case 'local_meetups':
      return { color: theme.brandSecondary, label: 'Meetups', icon: 'cafe' };
    default:
      return { color: theme.brand, label: 'Room', icon: 'chatbubbles' };
  }
}

/** Chips shown in the Discover section (value null = "All"). */
export const CATEGORY_FILTERS: { label: string; value: RoomCategory | null }[] = [
  { label: 'All', value: null },
  { label: 'City Dating', value: 'city_dating' },
  { label: 'Orientation', value: 'orientation' },
  { label: 'Age', value: 'age_group' },
  { label: 'Intent', value: 'relationship_intent' },
  { label: 'Events', value: 'events' },
  { label: 'Meetups', value: 'local_meetups' },
];

/** "12,432 members" */
export function formatCount(n: number): string {
  return n.toLocaleString('en-IN');
}

/** Relative activity time: "now", "2 min ago", "3 h ago", "Yesterday", "Mon", "12 Jun". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const d = new Date(then);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const days = Math.floor(hr / 24);
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Secondary Discover sort options (client passes to listRooms as-is when supported). */
export const ROOM_SORTS = [
  { label: 'Trending', value: 'trending' },
  { label: 'Recently Active', value: 'recent' },
  { label: 'Most Members', value: 'members' },
  { label: 'Nearby', value: 'nearby' },
] as const;

export type RoomSort = (typeof ROOM_SORTS)[number]['value'];

export const MEMBER_FLOORS = [
  { label: 'Any', value: 0 },
  { label: '100+', value: 100 },
  { label: '1000+', value: 1000 },
  { label: '10000+', value: 10000 },
] as const;
