import { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont, spacing } from '../../theme';
import { GifPicker, type GifResult } from './GifPicker';

export type AttachmentKind =
  | 'camera'
  | 'gallery'
  | 'video'
  | 'document'
  | 'location'
  | 'audio'
  | 'gif';

type Option = {
  kind: AttachmentKind;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: keyof ReturnType<typeof useThemeColors>;
};

// helper so the color key is typed against the theme
function useThemeColors() {
  return useTheme().theme;
}

// Only fully working attachments are listed here.
const OPTIONS: Option[] = [
  { kind: 'camera', label: 'Camera', icon: 'camera', color: 'brand' },
  { kind: 'gallery', label: 'Gallery', icon: 'images', color: 'planPremium' },
  { kind: 'video', label: 'Video', icon: 'videocam', color: 'info' },
  { kind: 'document', label: 'Document', icon: 'document-text', color: 'brandSecondary' },
  { kind: 'location', label: 'Location', icon: 'location', color: 'success' },
  { kind: 'audio', label: 'Audio', icon: 'musical-notes', color: 'rightNow' },
  { kind: 'gif', label: 'GIF', icon: 'film', color: 'planPlatinum' },
];

/** WhatsApp-style attachment grid (3 per row). */
export function AttachmentSheet({
  visible,
  onClose,
  onPick,
  onGifSelected,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (kind: AttachmentKind) => void;
  onGifSelected: (gif: GifResult) => void;
}) {
  const { theme } = useTheme();
  const [gifOpen, setGifOpen] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Text style={[styles.title, { color: theme.textPrimary }]}>Share</Text>
          <View style={styles.grid}>
            {OPTIONS.map((o) => {
              const color = theme[o.color] as string;
              return (
                <Pressable
                  key={o.kind}
                  onPress={() => {
                    // GIF opens the KLIPY picker stacked above this sheet.
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
                    <Ionicons name={o.icon} size={28} color={color} />
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
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: spacing.xxxl, paddingHorizontal: spacing.xl },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: spacing.md },
  title: { fontSize: 18, fontFamily: DisplayFont.bold, marginTop: spacing.lg, marginBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  option: { width: '33.33%', alignItems: 'center', marginBottom: spacing.xl, gap: 8 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { fontSize: 13, fontFamily: FontFamily.medium },
});
