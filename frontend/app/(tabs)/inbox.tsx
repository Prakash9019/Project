import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme';
import { useChatStore } from '../../src/store/chatStore';
import { useAuthStore } from '../../src/store/authStore';
import { connectSocket } from '../../src/services/socket';
import { inboxDateLabel, formatLastMessagePreview } from '../../src/lib/format';
import { ListSkeleton } from '../../src/components/Skeleton';
import { OnlineDot } from '../../src/components/badges';
import { listAlbums, createAlbum, ApiError } from '../../src/services/api';
import type { ConversationSummary, AlbumSummary } from '../../src/types/api';

export default function Inbox() {
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const tile = (width - 48) / 2;
  const me = useAuthStore((s) => s.user);
  const [seg, setSeg] = useState<'inbox' | 'albums'>('inbox');
  const { conversations, loading, refreshing, error, fetchConversations, applyIncomingMessage } =
    useChatStore();

  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [albumTitle, setAlbumTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const loadAlbums = useCallback(async () => {
    setAlbumsLoading(true);
    try {
      const res = await listAlbums();
      setAlbums(res.albums);
    } catch {
      /* optional tab */
    } finally {
      setAlbumsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchConversations('inbox');
      if (seg === 'albums') loadAlbums();
    }, [fetchConversations, seg, loadAlbums])
  );

  useEffect(() => {
    if (seg === 'albums') loadAlbums();
  }, [seg, loadAlbums]);

  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const socket = await connectSocket();
      if (!socket) return;
      const onCreated = (p: { conversationId: string; senderId: string; content?: string; type?: string }) => {
        const preview = p.content ?? (p.type ? `[${p.type}]` : 'New message');
        applyIncomingMessage(p.conversationId, preview, p.senderId === me?.id);
      };
      socket.on('message.created', onCreated);
      cleanup = () => socket.off('message.created', onCreated);
    })();
    return () => cleanup();
  }, [me?.id, applyIncomingMessage]);

  const createAlbumNow = async () => {
    if (!albumTitle.trim() || creating) return;
    setCreating(true);
    try {
      await createAlbum(albumTitle.trim());
      setAlbumTitle('');
      setCreateOpen(false);
      loadAlbums();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403) Alert.alert('Limit reached', 'Upgrade your plan for more albums.');
      else Alert.alert('Could not create album', err.message ?? 'Try again.');
    } finally {
      setCreating(false);
    }
  };

  const renderRow = ({ item }: { item: ConversationSummary }) => {
    const online = item.peer.activity?.online ?? item.peer.lastActiveAt?.toLowerCase() === 'online';
    const dateLabel = inboxDateLabel(item.lastMessageAt);
    return (
      <Pressable
        style={styles.row}
        onPress={() =>
          router.push({ pathname: '/chat/[id]', params: { id: item.id, peerName: item.peer.firstName ?? '', peerPhoto: item.peer.profilePhoto ?? '' } })
        }
      >
        <View>
          {item.peer.profilePhoto ? (
            <Image source={{ uri: item.peer.profilePhoto }} style={[styles.thumb, { backgroundColor: theme.backgroundTertiary }]} contentFit="cover" transition={120} cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.thumb, { backgroundColor: theme.backgroundTertiary, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={28} color={theme.textTertiary} />
            </View>
          )}
          {online && <View style={styles.onlineDotPos}><OnlineDot online size={12} ring /></View>}
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
              {item.peer.firstName ?? 'Someone'}
            </Text>
            {!!dateLabel && (
              <Text style={[styles.time, { color: theme.textTertiary }]}>{dateLabel}</Text>
            )}
          </View>
          <View style={styles.rowBottom}>
            <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={1}>
              {formatLastMessagePreview(item.lastMessage)}
            </Text>
            {!!item.unreadCount && item.unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: theme.brand }]}>
                <Text style={[styles.badgeText, { color: theme.textInverse }]}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const renderAlbum = ({ item }: { item: AlbumSummary }) => (
    <Pressable
      style={[styles.album, { width: tile, height: tile * 1.1, backgroundColor: theme.backgroundTertiary }]}
      onPress={() => router.push({ pathname: '/albums/[id]', params: { id: item.id, title: item.title } })}
    >
      {item.coverPhoto ? (
        <Image source={{ uri: item.coverPhoto.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} cachePolicy="memory-disk" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Ionicons name="images" size={32} color={theme.textTertiary} />
        </View>
      )}
      <View style={styles.albumShade} />
      <View style={styles.albumBottom}>
        <Text style={styles.albumName} numberOfLines={1}>{item.title}</Text>
        <View style={styles.countTag}>
          <Ionicons name="images" size={12} color="#fff" />
          <Text style={styles.count}>{item.photoCount}</Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.titleRow}>
        <Pressable onPress={() => setSeg('inbox')}>
          <Text style={[styles.title, { color: seg === 'inbox' ? theme.textPrimary : theme.textTertiary }]}>Inbox</Text>
        </Pressable>
        <Pressable onPress={() => setSeg('albums')}>
          <Text style={[styles.title, { color: seg === 'albums' ? theme.textPrimary : theme.textTertiary }]}>Albums</Text>
        </Pressable>
        {seg === 'albums' && (
          <Pressable style={styles.addAlbum} onPress={() => setCreateOpen(true)} hitSlop={8}>
            <Ionicons name="add-circle" size={28} color={theme.brand} />
          </Pressable>
        )}
      </View>

      {seg === 'albums' ? (
        albumsLoading && albums.length === 0 ? (
          <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
        ) : (
          <FlatList
            key="albums"
            data={albums}
            keyExtractor={(a) => a.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 16, paddingHorizontal: 16 }}
            contentContainerStyle={{ gap: 16, paddingVertical: 16, flexGrow: albums.length === 0 ? 1 : undefined }}
            refreshControl={<RefreshControl refreshing={albumsLoading} onRefresh={loadAlbums} tintColor={theme.brand} />}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="images-outline" size={48} color={theme.textTertiary} />
                <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No albums yet</Text>
                <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>Create albums and share them in chat.</Text>
                <Pressable style={[styles.cta, { backgroundColor: theme.brand }]} onPress={() => setCreateOpen(true)}>
                  <Text style={[styles.ctaText, { color: theme.textInverse }]}>Create album</Text>
                </Pressable>
              </View>
            }
            renderItem={renderAlbum}
          />
        )
      ) : loading && conversations.length === 0 ? (
        <ListSkeleton />
      ) : (
        <FlatList
          key="conversations"
          data={conversations}
          keyExtractor={(c) => c.id}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: theme.border }]} />}
          renderItem={renderRow}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchConversations('inbox', true)} tintColor={theme.brand} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No conversations yet</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {error ?? 'Tap someone on the grid to start chatting.'}
              </Text>
            </View>
          }
          contentContainerStyle={conversations.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        />
      )}

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>New album</Text>
            <TextInput
              value={albumTitle}
              onChangeText={setAlbumTitle}
              placeholder="Album title"
              placeholderTextColor={theme.textTertiary}
              maxLength={50}
              style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.textPrimary }]}
            />
            <Pressable
              style={[styles.cta, { backgroundColor: albumTitle.trim() ? theme.brand : theme.callDisabled }]}
              onPress={createAlbumNow}
              disabled={!albumTitle.trim() || creating}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={[styles.ctaText, { color: theme.textInverse }]}>Create</Text>}
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => setCreateOpen(false)}>
              <Text style={{ color: theme.textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: '800' },
  addAlbum: { marginLeft: 'auto' },
  sep: { height: 1, marginLeft: 92 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  thumb: { width: 60, height: 60, borderRadius: 8 },
  onlineDotPos: { position: 'absolute', left: 2, bottom: 2 },
  rowBody: { flex: 1, gap: 6 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', flex: 1 },
  time: { fontSize: 12, flexShrink: 0 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  preview: { fontSize: 14, flex: 1 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cta: { marginTop: 8, height: 46, borderRadius: 999, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 15, fontWeight: '700' },
  album: { borderRadius: 14, overflow: 'hidden', justifyContent: 'flex-end' },
  albumShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', backgroundColor: 'rgba(0,0,0,0.45)' },
  albumBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  albumName: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1, textShadowColor: '#000', textShadowRadius: 4 },
  countTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  count: { color: '#fff', fontSize: 12, fontWeight: '700' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', borderRadius: 18, padding: 22, alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '800' },
  input: { width: '100%', height: 50, borderRadius: 12, paddingHorizontal: 16, marginTop: 16, fontSize: 16 },
  cancel: { marginTop: 14 },
});
