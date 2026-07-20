import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, FontSize } from '../../theme';

/**
 * "Replying to …" bar shown above the composer input while a reply is staged.
 * Shared by inbox + group chat via ChatComposer.
 */
export function ReplyBar({
  senderName,
  content,
  onCancel,
}: {
  senderName: string;
  content: string;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.surfaceElevated, borderLeftColor: theme.brand }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.brand }]} numberOfLines={1}>
          Replying to {senderName}
        </Text>
        <Text style={[styles.content, { color: theme.textSecondary }]} numberOfLines={1}>
          {content}
        </Text>
      </View>
      <Pressable onPress={onCancel} hitSlop={8}>
        <Ionicons name="close" size={20} color={theme.textSecondary} />
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
    borderLeftWidth: 3,
  },
  title: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold, marginBottom: 1 },
  content: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
});
