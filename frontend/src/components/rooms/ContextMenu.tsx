import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily } from '../../theme';
import type { RoomMessageCard } from '../../types/api';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

type Action = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  show: boolean;
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * WhatsApp-style long-press context menu with a blurred backdrop, a quick
 * emoji-reaction row, and a list of contextual actions.
 */
export function ContextMenu({
  message,
  isOwn,
  isAdmin,
  onClose,
  onReact,
  onOpenEmojiPicker,
  onReply,
  onCopy,
  onForward,
  onPin,
  onDelete,
  onReport,
  onInfo,
}: {
  message: RoomMessageCard | null;
  isOwn: boolean;
  isAdmin?: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onOpenEmojiPicker: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onPin: () => void;
  onDelete: () => void;
  onReport: () => void;
  onInfo: () => void;
}) {
  const { theme, isDark } = useTheme();
  const isText = message?.type === 'text' && !message.isDeleted;

  const allActions: Action[] = [
    { key: 'reply', label: 'Reply', icon: 'arrow-undo-outline', onPress: onReply, show: true },
    { key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: onCopy, show: !!isText },
    { key: 'forward', label: 'Forward', icon: 'arrow-redo-outline', onPress: onForward, show: true, disabled: true },
    {
      key: 'pin',
      label: message?.isPinned ? 'Unpin' : 'Pin',
      icon: 'pin-outline',
      onPress: onPin,
      show: !!isAdmin && !message?.isDeleted,
    },
    { key: 'delete', label: 'Delete', icon: 'trash-outline', onPress: onDelete, show: isOwn || !!isAdmin, destructive: true },
    { key: 'report', label: 'Report', icon: 'flag-outline', onPress: onReport, show: !isOwn },
    { key: 'info', label: 'Info', icon: 'information-circle-outline', onPress: onInfo, show: isOwn },
  ];
  const actions = allActions.filter((a) => a.show);

  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.fill} onPress={onClose}>
        <BlurView intensity={28} tint={isDark ? 'dark' : 'light'} style={styles.fill}>
          <View style={styles.center}>
            {/* Emoji reaction row */}
            <View style={[styles.emojiRow, { backgroundColor: theme.surface }]}>
              {QUICK_EMOJIS.map((e) => (
                <Pressable key={e} onPress={() => onReact(e)} hitSlop={4} style={styles.emojiBtn}>
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={onOpenEmojiPicker}
                style={[styles.plusBtn, { backgroundColor: theme.surfaceElevated }]}
              >
                <Ionicons name="add" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* Actions */}
            <View style={[styles.menu, { backgroundColor: theme.surface }]}>
              {actions.map((a) => {
                const color = a.destructive ? theme.error : a.disabled ? theme.textTertiary : theme.textPrimary;
                return (
                  <Pressable
                    key={a.key}
                    disabled={a.disabled}
                    onPress={() => {
                      a.onPress();
                    }}
                    style={styles.item}
                  >
                    <Text style={[styles.itemText, { color }]}>
                      {a.label}
                      {a.disabled ? ' (soon)' : ''}
                    </Text>
                    <Ionicons name={a.icon} size={20} color={color} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </BlurView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 12 },
  emojiRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
  emojiBtn: { paddingHorizontal: 4 },
  emoji: { fontSize: 28 },
  plusBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  menu: { width: 240, borderRadius: 14, paddingVertical: 6 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 13 },
  itemText: { fontSize: 15, fontFamily: FontFamily.medium },
});
