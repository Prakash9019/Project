import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, FontSize } from '../../theme';

/**
 * "Editing message" bar shown above the composer input while an edit is staged.
 * Shared by inbox + group chat via ChatComposer.
 */
export function EditBar({ content, onCancel }: { content: string; onCancel: () => void }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.surfaceElevated }]}>
      <Ionicons name="create-outline" size={16} color={theme.planGold} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.planGold }]} numberOfLines={1}>
          Editing message
        </Text>
        <Text style={[styles.content, { color: theme.textSecondary }]} numberOfLines={1}>
          {content}
        </Text>
      </View>
      <Pressable onPress={onCancel} hitSlop={8}>
        <Ionicons name="close" size={18} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 12,
    opacity: 0.95,
  },
  title: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold, marginBottom: 1 },
  content: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
});
