import { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont, spacing } from '../../theme';
import { GifPicker, type GifResult } from '../rooms/GifPicker';

export type AttachmentKind =
  | 'gallery'
  | 'camera'
  | 'video'
  | 'document'
  | 'audio'
  | 'location'
  | 'gif'
  // Optional 1:1-only extras — rendered only when listed in the `extras` prop.
  | 'view_once'
  | 'album'
  // Gated by the `canUseTemplates` prop (plan perk) rather than `extras`.
  | 'templates';

type ColorKey = keyof ReturnType<typeof useThemeColors>;
function useThemeColors() {
  return useTheme().theme;
}

type Option = {
  kind: AttachmentKind;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: ColorKey;
  /** Optional item — only rendered when its kind is listed in the `extras` prop. */
  optional?: boolean;
};

// Only fully working attachments are listed here.
const OPTIONS: Option[] = [
  { kind: 'gallery', label: 'Gallery', icon: 'images', color: 'planPremium' },
  { kind: 'camera', label: 'Camera', icon: 'camera', color: 'brand' },
  { kind: 'video', label: 'Video', icon: 'videocam', color: 'info' },
  { kind: 'document', label: 'Document', icon: 'document-text', color: 'brandSecondary' },
  { kind: 'audio', label: 'Audio', icon: 'musical-notes', color: 'rightNow' },
  { kind: 'location', label: 'Location', icon: 'location', color: 'success' },
  { kind: 'gif', label: 'GIF', icon: 'film', color: 'planPlatinum' },
  { kind: 'view_once', label: 'View Once', icon: 'eye-off', color: 'brand', optional: true },
  { kind: 'album', label: 'Album', icon: 'albums', color: 'planGold', optional: true },
  { kind: 'templates', label: 'Saved Replies', icon: 'chatbox-ellipses', color: 'info', optional: true },
];

/** WhatsApp-style attachment grid. Only fully working attachments are shown. */
export function AttachmentSheet({
  visible,
  onClose,
  onPick,
  onGifSelected,
  extras = [],
  canUseTemplates = false,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (kind: AttachmentKind) => void;
  onGifSelected: (gif: GifResult) => void;
  /** Optional 1:1-only kinds to reveal (e.g. 'view_once', 'album'). */
  extras?: AttachmentKind[];
  /** Reveal the "Saved Replies" (message templates) tile when the plan allows it. */
  canUseTemplates?: boolean;
}) {
  const { theme } = useTheme();
  const [gifOpen, setGifOpen] = useState(false);
  const options = OPTIONS.filter((o) => {
    // 'templates' rides on the plan perk, not the per-thread `extras` list.
    if (o.kind === 'templates') return canUseTemplates;
    return !o.optional || extras.includes(o.kind);
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Text style={[styles.title, { color: theme.textPrimary }]}>Share</Text>
          <View style={styles.grid}>
            {options.map((o) => {
              const color = theme[o.color] as string;
              return (
                <Pressable
                  key={o.kind}
                  onPress={() => {
                    if (o.kind === 'gif') {
                      setGifOpen(true);
                      return;
                    }
                    onClose();
                    onPick(o.kind);
                  }}
                  style={styles.option}
                >
                  <View style={[styles.iconCircle, { backgroundColor: color + '22' }]}>
                    <Ionicons name={o.icon} size={26} color={color} />
                  </View>
                  <Text style={[styles.optionLabel, { color: theme.textSecondary }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>

      {/* KLIPY GIF picker (stacked above the attachment sheet) */}
      <GifPicker
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onSelect={(gif) => {
          setGifOpen(false);
          onClose();
          onGifSelected(gif);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: spacing.xxxl, paddingHorizontal: spacing.lg },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: spacing.md },
  title: { fontSize: 18, fontFamily: DisplayFont.bold, marginTop: spacing.lg, marginBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  option: { width: '25%', alignItems: 'center', marginBottom: spacing.xl, gap: 6 },
  iconCircle: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { fontSize: 12, fontFamily: FontFamily.medium },
});
