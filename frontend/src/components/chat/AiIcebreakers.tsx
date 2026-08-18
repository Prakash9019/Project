import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme, FontFamily, FontSize } from '../../theme';

/**
 * AI-generated opening-message suggestions shown in the empty-conversation
 * state (Platinum, opt-in). Tapping one fills the composer — it never sends.
 */
export function AiIcebreakers({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  const { theme } = useTheme();
  if (!suggestions.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textTertiary }]}>Try starting with...</Text>
      {suggestions.map((s, i) => (
        <Pressable
          key={i}
          onPress={() => onSelect(s)}
          style={[styles.chip, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
        >
          <Text style={[styles.chipText, { color: theme.textPrimary }]} numberOfLines={2}>
            {s}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, gap: 8, width: '100%', alignItems: 'center' },
  label: { fontSize: FontSize.xs, fontFamily: FontFamily.medium, marginBottom: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '90%',
  },
  chipText: { fontSize: FontSize.sm, fontFamily: FontFamily.medium, textAlign: 'center' },
});
