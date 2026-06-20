import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { planBadgeColor, planLabel } from '../lib/format';
import type { Plan } from '../types/api';

/**
 * Small colored plan label — Premium (purple), Gold (gold), Platinum (blue).
 * Renders nothing for free / null. Plan colors come from the theme.
 */
export function PlanBadge({ plan, size = 'sm' }: { plan?: Plan | null; size?: 'sm' | 'md' }) {
  const { theme } = useTheme();
  const color = planBadgeColor(theme, plan);
  const label = planLabel(plan);
  if (!color || !label) return null;
  const md = size === 'md';
  return (
    <View style={[styles.plan, { backgroundColor: color, paddingHorizontal: md ? 10 : 7, paddingVertical: md ? 4 : 2 }]}>
      <Text style={[styles.planText, { fontSize: md ? 12 : 10 }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

/** Blue verified checkmark — shown only when verified. */
export function VerifiedBadge({ verified, size = 14 }: { verified?: boolean; size?: number }) {
  const { theme } = useTheme();
  if (!verified) return null;
  return <Ionicons name="checkmark-circle" size={size} color={theme.info} />;
}

/** Green online dot. */
export function OnlineDot({ online, size = 10, ring }: { online?: boolean; size?: number; ring?: boolean }) {
  const { theme } = useTheme();
  if (!online) return null;
  return (
    <View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.online },
        ring && { borderWidth: 2, borderColor: theme.background },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  plan: { borderRadius: 6, alignSelf: 'flex-start' },
  planText: { color: '#fff', fontWeight: '800', letterSpacing: 0.3 },
  dot: {},
});
