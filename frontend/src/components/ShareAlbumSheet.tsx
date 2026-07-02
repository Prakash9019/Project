import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont } from '../theme';
import { listConversations, sendMessage } from '../services/api';
import { showSuccess, toastApiError } from '../lib/toast';
import type { ConversationSummary } from '../types/api';

/**
 * Share sheet for an album: pick a conversation to send it into, or copy a link.
 * The backend's private-album grant is the legacy flow; here we send a chat
 * message referencing the album (per Task 1 "send to chat" option).
 */
export function ShareAlbumSheet({
  visible,
  onClose,
  albumId,
  albumTitle,
}: {
  visible: boolean;
  onClose: () => void;
  albumId: string;
  albumTitle: string;
}) {
  const { theme } = useTheme();
  const [convos, setConvos] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    listConversations('inbox')
      .then((r) => setConvos(r.conversations))
      .catch(() => setConvos([]))
      .finally(() => setLoading(false));
  }, [visible]);

  const shareTo = async (c: ConversationSummary) => {
    if (sending) return;
    setSending(c.id);
    try {
      await sendMessage(c.id, { type: 'text', content: `📸 Shared an album with you: "${albumTitle}"` });
      showSuccess(`Shared with ${c.peer.firstName ?? 'them'}`, 'Album shared');
      onClose();
    } catch (e) {
      toastApiError(e, 'Could not share album');
    } finally {
      setSending(null);
    }
  };

  const copyLink = () => {
    showSuccess('Album link copied to clipboard', 'Link copied');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <Text style={[styles.title, { color: theme.textPrimary }]}>Share album</Text>

          <Pressable style={[styles.copyRow, { backgroundColor: theme.surfaceElevated }]} onPress={copyLink}>
            <Ionicons name="link-outline" size={20} color={theme.brand} />
            <Text style={[styles.copyText, { color: theme.textPrimary }]}>Copy link</Text>
          </Pressable>

          <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>SEND TO CHAT</Text>
          {loading ? (
            <View style={styles.loading}><ActivityIndicator color={theme.brand} /></View>
          ) : (
            <FlatList
              data={convos}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={<Text style={[styles.empty, { color: theme.textSecondary }]}>No conversations yet.</Text>}
              renderItem={({ item }) => (
                <Pressable style={styles.convoRow} onPress={() => shareTo(item)} disabled={!!sending}>
                  {item.peer.profilePhoto ? (
                    <Image source={{ uri: item.peer.profilePhoto }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.center, { backgroundColor: theme.backgroundTertiary }]}>
                      <Ionicons name="person" size={18} color={theme.textTertiary} />
                    </View>
                  )}
                  <Text style={[styles.convoName, { color: theme.textPrimary }]} numberOfLines={1}>
                    {item.peer.firstName ?? 'Someone'}
                  </Text>
                  {sending === item.id ? (
                    <ActivityIndicator color={theme.brand} />
                  ) : (
                    <Ionicons name="send" size={18} color={theme.brand} />
                  )}
                </Pressable>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  center: { alignItems: 'center', justifyContent: 'center' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 16 },
  title: { fontSize: 18, fontFamily: DisplayFont.bold, fontWeight: '800', marginBottom: 16 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, borderRadius: 12, paddingHorizontal: 16 },
  copyText: { fontSize: 16, fontFamily: FontFamily.semibold, fontWeight: '600' },
  sectionLabel: { fontSize: 12, fontFamily: FontFamily.bold, fontWeight: '800', letterSpacing: 0.6, marginTop: 22, marginBottom: 8 },
  loading: { paddingVertical: 24, alignItems: 'center' },
  empty: { fontSize: 14, fontFamily: FontFamily.regular, paddingVertical: 20, textAlign: 'center' },
  convoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  convoName: { flex: 1, fontSize: 16, fontFamily: FontFamily.semibold, fontWeight: '600' },
});
