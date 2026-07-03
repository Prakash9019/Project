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
