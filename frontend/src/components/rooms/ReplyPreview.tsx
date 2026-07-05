import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily } from '../../theme';

/**
 * Quoted reply preview. Rendered in the input bar (with a cancel X) and inside
 * message bubbles (tap to scroll to the original). Colors adapt for own bubbles.
 */
export function ReplyPreview({
  senderName,
  content,
  onCancel,
  onPress,
  onGradient,
  compact,
}: {
  senderName: string | null | undefined;
  content: string;
  onCancel?: () => void;
  onPress?: () => void;
  onGradient?: boolean; // true = rendered on a brand gradient (own bubble)
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const barColor = onGradient ? '#fff' : theme.brand;
  const nameColor = onGradient ? '#fff' : theme.brand;
  const textColor = onGradient ? '#ffffffcc' : theme.textSecondary;
  const bg = onGradient ? 'rgba(255,255,255,0.15)' : theme.backgroundTertiary;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.wrap, { backgroundColor: bg, borderLeftColor: barColor }, compact && styles.compact]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: nameColor }]} numberOfLines={1}>
          {senderName ?? 'Reply'}
        </Text>
        <Text style={[styles.content, { color: textColor }]} numberOfLines={1}>
          {content}
        </Text>
      </View>
      {onCancel ? (
        <Pressable onPress={onCancel} hitSlop={8}>
          <Ionicons name="close" size={20} color={theme.textTertiary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  compact: { paddingVertical: 4, marginBottom: 4 },
  name: { fontSize: 13, fontFamily: FontFamily.semibold },
  content: { fontSize: 13, fontFamily: FontFamily.regular, marginTop: 1 },
});
