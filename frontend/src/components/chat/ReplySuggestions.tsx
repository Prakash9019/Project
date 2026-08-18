import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, FontSize } from '../../theme';

/**
 * AI-generated quick-reply chips shown above the composer input (Platinum,
 * opt-in). Tapping a chip fills the composer — it never sends automatically.
 */
export function ReplySuggestions({
  suggestions,
  onSelect,
  onDismiss,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  if (!suggestions.length) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {suggestions.map((s, i) => (
          <Pressable
            key={i}
            onPress={() => onSelect(s)}
            style={[styles.chip, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          >
            <Text style={[styles.chipText, { color: theme.textPrimary }]} numberOfLines={1}>
              {s}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable onPress={onDismiss} hitSlop={8} style={styles.dismiss}>
        <Ionicons name="close" size={16} color={theme.textTertiary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 6, gap: 4 },
  row: { gap: 8, paddingRight: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 220,
  },
  chipText: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },
  dismiss: { padding: 4 },
});
