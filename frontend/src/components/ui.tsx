import React from 'react';
import {
  Text,
  TextProps,
  Pressable,
  PressableProps,
  View,
  ViewStyle,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { colors, font, radius, spacing } from '../theme';

/** Themed text with sensible defaults (white, system sans). */
export function T(props: TextProps & { muted?: boolean; dim?: boolean }) {
  const { style, muted, dim, ...rest } = props;
  return (
    <Text
      {...rest}
      style={[
        { color: muted ? colors.textMuted : dim ? colors.textSecondary : colors.text },
        style,
      ]}
    />
  );
}

/** Pill button — `variant` controls colour. */
export function PillButton({
  label,
  onPress,
  variant = 'yellow',
  style,
  textStyle,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'yellow' | 'purple' | 'dark' | 'pink' | 'outline';
  style?: ViewStyle;
  textStyle?: any;
}) {
  const bg = {
    yellow: colors.yellow,
    purple: colors.purpleBright,
    dark: colors.surfaceElevated,
    pink: colors.pink,
    outline: 'transparent',
  }[variant];
  const fg = variant === 'yellow' ? colors.onYellow : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.divider },
        style,
      ]}
    >
      <Text style={[styles.pillText, { color: fg }, textStyle]}>{label}</Text>
    </Pressable>
  );
}

/** Horizontal filter-chip row. */
export function ChipRow({
  chips,
  activeIndex = -1,
  onSelect,
  leading,
}: {
  chips: string[];
  activeIndex?: number;
  onSelect?: (i: number) => void;
  leading?: React.ReactNode;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {leading}
      {chips.map((c, i) => {
        const active = i === activeIndex;
        return (
          <Pressable
            key={c}
            onPress={() => onSelect?.(i)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const styles = StyleSheet.create({
  pill: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  pillText: {
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as any,
  },
  chipRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  chip: {
    backgroundColor: colors.chip,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 38,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.chipActive },
  chipText: { color: colors.text, fontSize: font.size.md, fontWeight: '600' },
  chipTextActive: { color: colors.black },
});

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.divider }} />;
}
