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
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useTheme, FontFamily, DisplayFont } from '../theme';
import { listConversations, sendMessage } from '../services/api';
import { showSuccess, toastApiError } from '../lib/toast';
import { useAuthStore } from '../store/authStore';
import type { ConversationSummary } from '../types/api';

/**
 * Share sheet for an album: pick a conversation to send it into, or copy a link.
 * "Send to chat" sends a real `type: 'photo'` message carrying the album's
 * cover as mediaUrls[0] and a structured '📁 albumId|ownerId|title' content
 * string — the same convention chat/[id].tsx already parses for album bubbles
 * (and the same "emoji-prefixed structured content" pattern used for
 * documents/locations, since Message has no metadata/album fields to extend).
 * The recipient's bubble renders a real album card and deep-links into the
 * actual album, which still enforces privacy server-side on open.
 */
export function ShareAlbumSheet({
  visible,
  onClose,
  albumId,
  albumTitle,
  coverPhotoUrl,
}: {
  visible: boolean;
  onClose: () => void;
  albumId: string;
  albumTitle: string;
  /** The album's cover photo URL — required to send a real album card; falls back to a plain text share if absent. */
  coverPhotoUrl?: string | null;
}) {
  const { theme } = useTheme();
  const me = useAuthStore((s) => s.user);
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
    if (sending || !me?.id) return;
    setSending(c.id);
    try {
      const albumContent = `📁 ${albumId}|${me.id}|${albumTitle}`;
      if (coverPhotoUrl) {
        await sendMessage(c.id, { type: 'photo', mediaUrls: [coverPhotoUrl], content: albumContent });
      } else {
        // No cover photo — still send the structured pipe content as a plain
        // text message. chat/[id].tsx recognizes '📁 id|ownerId|title' on
        // `type: 'text'` too (mirroring the location-card convention) and
        // renders a tappable album card without a thumbnail.
        await sendMessage(c.id, { type: 'text', content: albumContent });
      }
      showSuccess(`Shared with ${c.peer.firstName ?? 'them'}`, 'Album shared');
      onClose();
    } catch (e) {
      toastApiError(e, 'Could not share album');
    } finally {
      setSending(null);
    }
  };

  const copyLink = async () => {
    if (!me?.id) {
      toastApiError(null, 'Could not generate album link');
      return;
    }
    try {
      const link = Linking.createURL(`albums/${albumId}`, { queryParams: { ownerId: me.id, title: albumTitle } });
      await Clipboard.setStringAsync(link);
      showSuccess('Album link copied to clipboard', 'Link copied');
      onClose();
    } catch (e) {
      toastApiError(e, 'Could not copy link');
    }
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
