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
  canEdit,
  onClose,
  onReact,
  onOpenEmojiPicker,
  onReply,
  onCopy,
  onForward,
  onPin,
  onStar,
  onEdit,
  onSelect,
  onDeleteForMe,
  onDelete,
  onReport,
  onInfo,
}: {
  message: RoomMessageCard | null;
  isOwn: boolean;
  isAdmin?: boolean;
  /** Own text message, not deleted, within the 5-minute edit window. */
  canEdit?: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onOpenEmojiPicker: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onPin: () => void;
  onStar?: () => void;
  onEdit?: () => void;
  /** Enter multi-select mode starting with this message. */
  onSelect?: () => void;
  /** "Delete for me" — hides the message from the caller's own view only. */
  onDeleteForMe: () => void;
  /** "Delete for everyone" (own messages, or moderator/admin override). */
  onDelete: () => void;
  onReport: () => void;
  onInfo: () => void;
}) {
  const { theme, isDark } = useTheme();
  const isText = message?.type === 'text' && !message.isDeleted;

  const allActions: Action[] = [
    { key: 'reply', label: 'Reply', icon: 'arrow-undo-outline', onPress: onReply, show: true },
    { key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: onCopy, show: !!isText },
    { key: 'forward', label: 'Forward', icon: 'arrow-redo-outline', onPress: onForward, show: true },
    {
      key: 'star',
      label: message?.isStarred ? 'Unstar' : 'Star',
      icon: message?.isStarred ? 'star' : 'star-outline',
      onPress: () => onStar?.(),
      show: !!onStar && !message?.isDeleted,
    },
    {
      key: 'pin',
      label: message?.isPinned ? 'Unpin' : 'Pin',
      icon: 'pin-outline',
      onPress: onPin,
      show: !!isAdmin && !message?.isDeleted,
    },
    { key: 'edit', label: 'Edit', icon: 'create-outline', onPress: () => onEdit?.(), show: !!canEdit },
    { key: 'select', label: 'Select', icon: 'checkmark-circle-outline', onPress: () => onSelect?.(), show: !!onSelect && !message?.isDeleted },
    { key: 'delete_me', label: 'Delete for Me', icon: 'trash-outline', onPress: onDeleteForMe, show: !message?.isDeleted, destructive: true },
    { key: 'delete', label: 'Delete for Everyone', icon: 'trash-bin-outline', onPress: onDelete, show: (isOwn || !!isAdmin) && !message?.isDeleted, destructive: true },
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 8 },
  emojiRow: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 },
  emojiBtn: { paddingHorizontal: 3 },
  emoji: { fontSize: 22 },
  plusBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  menu: { width: 220, borderRadius: 12, paddingVertical: 4 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 9 },
  itemText: { fontSize: 14, fontFamily: FontFamily.medium },
});
