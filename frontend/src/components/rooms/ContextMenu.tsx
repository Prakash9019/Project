import { useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme, FontFamily } from '../../theme';
import type { RoomMessageCard } from '../../types/api';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

/** Emoji row (48) + gap + one 41px row per action — matches the 1:1 menu maths. */
const MENU_CHROME_H = 54;
const MENU_ROW_H = 41;

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
 *
 * Positioning mirrors the 1:1 chat menu (`app/chat/[id].tsx`): when the caller
 * passes the long-pressed bubble's `anchorY` (pageY), the menu opens next to
 * that message — above it if the press was in the lower half of the screen,
 * below it otherwise, clamped on-screen — and hugs the sender's side. Without
 * `anchorY` it falls back to the old screen-centered layout.
 */
export function ContextMenu({
  message,
  isOwn,
  isAdmin,
  canEdit,
  anchorY,
  onClose,
  onReact,
  onOpenEmojiPicker,
  onReply,
  onCopy,
  onForward,
  onPin,
  onStar,
  onEdit,
  onSave,
  onShare,
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
  /** pageY of the long-pressed bubble — anchors the menu near the message. */
  anchorY?: number;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onOpenEmojiPicker: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onPin: () => void;
  onStar?: () => void;
  onEdit?: () => void;
  /** "Save to Gallery" — only supplied for image/video messages (parity with 1:1). */
  onSave?: () => void;
  /** "Share" — only supplied for image/video messages (parity with 1:1). */
  onShare?: () => void;
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

  // Entry AND exit are driven here (the Modal is animationType="none").
  // Opacity ONLY — no spring, no scale. A spring scale-in overshoots past 1, which
  // reads as the popup jumping/bouncing; a plain cross-fade just appears.
  const opacity = useSharedValue(0);
  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (!message) return;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 120 });
  }, [message, opacity]);

  /** Fade out, then unmount via the caller's onClose. */
  const dismiss = () => {
    opacity.value = withTiming(0, { duration: 120 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  };

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
    { key: 'save', label: 'Save to Gallery', icon: 'download-outline', onPress: () => onSave?.(), show: !!onSave && !message?.isDeleted },
    { key: 'share', label: 'Share', icon: 'share-outline', onPress: () => onShare?.(), show: !!onShare && !message?.isDeleted },
    { key: 'select', label: 'Select', icon: 'checkmark-circle-outline', onPress: () => onSelect?.(), show: !!onSelect && !message?.isDeleted },
    { key: 'delete_me', label: 'Delete for Me', icon: 'trash-outline', onPress: onDeleteForMe, show: !message?.isDeleted, destructive: true },
    { key: 'delete', label: 'Delete for Everyone', icon: 'trash-bin-outline', onPress: onDelete, show: (isOwn || !!isAdmin) && !message?.isDeleted, destructive: true },
    { key: 'report', label: 'Report', icon: 'flag-outline', onPress: onReport, show: !isOwn },
    { key: 'info', label: 'Info', icon: 'information-circle-outline', onPress: onInfo, show: isOwn },
  ];
  const actions = allActions.filter((a) => a.show);

  // Anchor near the tapped bubble when the caller supplied a pageY; otherwise
  // keep the legacy centered layout.
  const screenH = Dimensions.get('window').height;
  const menuH = MENU_CHROME_H + actions.length * MENU_ROW_H;
  const anchored = anchorY != null && anchorY > 0;
  const showAbove = (anchorY ?? 0) > screenH / 2;
  const rawTop = showAbove ? (anchorY ?? 0) - menuH - 60 : (anchorY ?? 0) + 60;
  const top = Math.max(70, Math.min(rawTop, screenH - menuH - 40));

  return (
    <Modal visible={!!message} transparent animationType="none" onRequestClose={dismiss}>
      <Animated.View style={[styles.fill, overlayStyle]}>
        <Pressable style={styles.fill} onPress={dismiss}>
          <BlurView intensity={28} tint={isDark ? 'dark' : 'light'} style={styles.fill}>
            <Animated.View
              style={[
                anchored
                  ? [
                      styles.anchored,
                      { top },
                      isOwn ? { right: 16, alignItems: 'flex-end' } : { left: 16, alignItems: 'flex-start' },
                    ]
                  : styles.center,
              ]}
            >
              {/* Emoji reaction row */}
              <View style={[styles.emojiRow, { backgroundColor: theme.surface }]}>
                {QUICK_EMOJIS.map((e) => (
                  <Pressable
                    key={e}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      onReact(e);
                    }}
                    style={styles.emojiBtn}
                  >
                    <Text style={styles.emoji}>{e}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={onOpenEmojiPicker}
                  style={[styles.plusBtn, { backgroundColor: theme.surfaceElevated }]}
                >
                  <Ionicons name="add" size={20} color={theme.textSecondary} />
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
            </Animated.View>
          </BlurView>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 6 },
  anchored: { position: 'absolute', gap: 6 },
  emojiRow: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 6, borderRadius: 24 },
  emojiBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  plusBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  menu: { width: 220, borderRadius: 12, paddingVertical: 4, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  itemText: { fontSize: 15, fontFamily: FontFamily.medium },
});
