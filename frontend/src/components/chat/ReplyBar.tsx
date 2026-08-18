import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, FontSize } from '../../theme';

/**
 * "Replying to …" bar shown above the composer input while a reply is staged.
 * Shared by inbox + group chat via ChatComposer. Mirrors the sent-message quote
 * (image thumbnail / voice icon) so a media reply reads as more than a label.
 */
export function ReplyBar({
  senderName,
  content,
  kind = 'text',
  thumbUrl,
  onCancel,
}: {
  senderName: string;
  content: string;
  kind?: 'image' | 'voice' | 'text';
  thumbUrl?: string | null;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.surfaceElevated, borderLeftColor: theme.brand }]}>
      {kind === 'image' && thumbUrl ? (
        <Image source={{ uri: thumbUrl }} style={styles.thumb} />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.brand }]} numberOfLines={1}>
          Replying to {senderName}
        </Text>
        <View style={styles.contentRow}>
          {kind === 'voice' ? <Ionicons name="mic" size={13} color={theme.textSecondary} /> : null}
          <Text style={[styles.content, { color: theme.textSecondary }]} numberOfLines={1}>
            {content}
          </Text>
        </View>
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
  thumb: { width: 34, height: 34, borderRadius: 6 },
  title: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold, marginBottom: 1 },
  contentRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  content: { flexShrink: 1, fontSize: FontSize.sm, fontFamily: FontFamily.regular },
});
