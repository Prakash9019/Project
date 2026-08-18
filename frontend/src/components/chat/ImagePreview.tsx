import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, FontFamily, FontSize } from '../../theme';

/**
 * WhatsApp-style image preview shown BEFORE sending. Lets the user review the
 * selected image(s), remove any, and add a single caption that is sent together
 * with each image as ONE message (see backend Message.caption).
 */
export function ImagePreview({
  visible,
  uris,
  onCancel,
  onSend,
}: {
  visible: boolean;
  uris: string[];
  onCancel: () => void;
  onSend: (uris: string[], caption: string) => void;
}) {
  const { theme } = useTheme();
  const [items, setItems] = useState<string[]>(uris);
  const [index, setIndex] = useState(0);
  const [caption, setCaption] = useState('');

  // Reset local state whenever a fresh selection is opened.
  useEffect(() => {
    if (visible) {
      setItems(uris);
      setIndex(0);
      setCaption('');
    }
  }, [visible, uris]);

  const removeCurrent = () => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        onCancel();
        return prev;
      }
      setIndex((i) => Math.min(i, next.length - 1));
      return next;
    });
  };

  // NOTE: do NOT early-return `null` here when `!visible`. That would tear the
  // <Modal> out of the tree the instant the parent flips `visible` to false
  // (see ChatComposer's `handlePreviewSend`, which calls `setPreviewUris(null)`
  // synchronously before awaiting the upload) instead of letting RN's `Modal`
  // play its own native dismiss transition off the `visible` prop. On iOS this
  // abrupt unmount races the tail end of the camera→picker native modal
  // handoff (the same "a modal can't present/dismiss while another is still
  // transitioning" constraint documented in app/chat/[id].tsx's `openForward`)
  // and can leave the app in a stuck/blank state that looks like a reload,
  // with the composer's caption UI gone. `Modal` itself is a no-op host view
  // when `visible` is false, so staying mounted costs nothing.
  const current = items[index];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onCancel} hitSlop={12}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.headerText}>
              {items.length > 1 ? `${index + 1} of ${items.length}` : 'Preview'}
            </Text>
            <Pressable onPress={removeCurrent} hitSlop={12}>
              <Ionicons name="trash-outline" size={24} color="#fff" />
            </Pressable>
          </View>

          {/* Main image */}
          <View style={styles.imageWrap}>
            {current ? (
              <Image source={{ uri: current }} style={styles.image} contentFit="contain" transition={120} />
            ) : null}
          </View>

          {/* Thumbnail strip (multi-select) */}
          {items.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbRow}
            >
              {items.map((uri, i) => (
                <Pressable key={uri + i} onPress={() => setIndex(i)}>
                  <Image
                    source={{ uri }}
                    style={[styles.thumb, i === index && { borderColor: theme.brand, borderWidth: 2 }]}
                    contentFit="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {/* Caption + send */}
          <View style={styles.bottomRow}>
            <View style={styles.captionWrap}>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Add a caption…"
                placeholderTextColor="rgba(255,255,255,0.6)"
                style={styles.captionInput}
                multiline
                maxLength={1000}
              />
            </View>
            <Pressable onPress={() => onSend(items, caption.trim())} hitSlop={6}>
              <LinearGradient
                colors={theme.gradientWarm}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendBtn}
              >
                <Ionicons name="arrow-up" size={22} color="#fff" />
                {items.length > 1 ? (
                  <View style={[styles.countBadge, { backgroundColor: theme.surface }]}>
                    <Text style={[styles.countText, { color: theme.textPrimary }]}>{items.length}</Text>
                  </View>
                ) : null}
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerText: { color: '#fff', fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  thumbRow: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  thumb: { width: 52, height: 52, borderRadius: 8 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  captionWrap: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    maxHeight: 96,
    justifyContent: 'center',
  },
  captionInput: { color: '#fff', fontSize: FontSize.md, fontFamily: FontFamily.regular, maxHeight: 76 },
  sendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  countBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countText: { fontSize: 10, fontFamily: FontFamily.bold },
});
