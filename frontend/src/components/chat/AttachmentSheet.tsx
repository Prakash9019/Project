import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/**
 * WhatsApp-style attachment grid. Only fully working attachments are shown.
 *
 * Built on a plain RN `Modal` rather than `@gorhom/bottom-sheet` — the gorhom
 * BottomSheetModal reliably called `.present()` here (no throw, ref valid) but
 * never actually rendered on Android, with both dynamic sizing and fixed
 * snapPoints. A plain Modal is the proven-working pattern already used by the
 * album/templates/header-menu sheets in `app/chat/[id].tsx`.
 */
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
  const insets = useSafeAreaInsets();
  const [gifOpen, setGifOpen] = useState(false);
  const options = OPTIONS.filter((o) => {
    // 'templates' rides on the plan perk, not the per-thread `extras` list.
    if (o.kind === 'templates') return canUseTemplates;
    return !o.optional || extras.includes(o.kind);
  });

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + spacing.lg }]}
            onPress={() => {}}
          >
            <View style={styles.handle} />
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
                      // Defer the pick callback until this Modal has finished its close
                      // animation. Presenting a second native <Modal> (e.g. LocationPicker,
                      // ImagePreview) in the same tick that this one is dismissing races the
                      // native modal host on iOS/Android — the incoming modal can render but
                      // never receive touches. Same fix as confirmBlock/ReportSheet in
                      // app/profile/[id].tsx.
                      setTimeout(() => onPick(o.kind), 300);
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
      </Modal>

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
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', alignSelf: 'center', marginBottom: spacing.md },
  title: { fontSize: 18, fontFamily: DisplayFont.bold, marginBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  option: { width: '25%', alignItems: 'center', marginBottom: spacing.xl, gap: 6 },
  iconCircle: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { fontSize: 12, fontFamily: FontFamily.medium },
});
