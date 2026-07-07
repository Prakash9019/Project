import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme, FontFamily, FontSize, DisplayFont } from '../../src/theme';
import { useChatStore } from '../../src/store/chatStore';
import { useAuthStore } from '../../src/store/authStore';
import { connectSocket } from '../../src/services/socket';
import { inboxDateLabel, formatLastMessagePreview } from '../../src/lib/format';
import { ListSkeleton } from '../../src/components/Skeleton';
import { listAlbums } from '../../src/services/api';
import type { ConversationSummary, AlbumSummary, UserCard } from '../../src/types/api';

type InboxFilter = 'all' | 'unread' | 'pinned' | 'online';
const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'pinned', label: 'Pinned' },
  { key: 'online', label: 'Online' },
];

const EMPTY_COPY: Record<InboxFilter, string> = {
  all: 'No conversations yet',
  unread: 'No unread messages',
  pinned: 'No pinned chats',
  online: 'No one online right now',
};

/** Online = live presence flag, an "online" label, or lastActiveAt within 5 min. */
function isPeerOnline(peer: UserCard): boolean {
  if (peer.activity?.online) return true;
  const la = peer.lastActiveAt;
  if (!la) return false;
  if (la.toLowerCase() === 'online') return true;
  const t = Date.parse(la);
  if (!Number.isNaN(t)) return Date.now() - t < 5 * 60 * 1000;
  return false;
}

export default function Inbox() {
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const tile = (width - 44) / 2;
  const me = useAuthStore((s) => s.user);
  const [seg, setSeg] = useState<'inbox' | 'albums'>('inbox');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const { conversations, loading, refreshing, error, fetchConversations, applyIncomingMessage } =
    useChatStore();

  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);

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

  const filtered = useMemo(() => {
    switch (filter) {
      case 'unread': return conversations.filter((c) => (c.unreadCount ?? 0) > 0);
      case 'pinned': return conversations.filter((c) => c.isPinned);
      case 'online': return conversations.filter((c) => isPeerOnline(c.peer));
      default: return conversations;
    }
  }, [conversations, filter]);

  const renderRow = ({ item }: { item: ConversationSummary }) => {
    const online = isPeerOnline(item.peer);
    const dateLabel = inboxDateLabel(item.lastMessageAt);
    const unread = item.unreadCount ?? 0;
    return (
      <Pressable
        style={styles.row}
        onPress={() =>
          router.push({ pathname: '/chat/[id]', params: { id: item.id, peerName: item.peer.firstName ?? '', peerPhoto: item.peer.profilePhoto ?? '' } })
        }
      >
        <View>
          {item.peer.profilePhoto ? (
            <Image source={{ uri: item.peer.profilePhoto }} style={[styles.avatar, { backgroundColor: theme.backgroundTertiary }]} contentFit="cover" transition={120} cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.avatar, styles.center, { backgroundColor: theme.backgroundTertiary }]}>
              <Ionicons name="person" size={26} color={theme.textTertiary} />
            </View>
          )}
          {online && <View style={[styles.onlineDot, { backgroundColor: theme.online, borderColor: theme.background }]} />}
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <View style={styles.nameWrap}>
              {item.isPinned && <Ionicons name="pin" size={14} color={theme.textTertiary} style={{ marginRight: 4 }} />}
              <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                {item.peer.firstName ?? 'Someone'}
              </Text>
              {item.audioCallEnabled && <Ionicons name="call" size={13} color={theme.textTertiary} style={{ marginLeft: 6 }} />}
              {item.videoCallEnabled && <Ionicons name="videocam" size={14} color={theme.textTertiary} style={{ marginLeft: 4 }} />}
            </View>
            {!!dateLabel && <Text style={[styles.time, { color: theme.textTertiary }]}>{dateLabel}</Text>}
          </View>
          <View style={styles.rowBottom}>
            <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={1}>
              {formatLastMessagePreview(item.lastMessage)}
            </Text>
            {unread > 0 && (
              <View style={[styles.badge, { backgroundColor: theme.brand }]}>
                <Text style={styles.badgeText}>{unread}</Text>
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
          <Pressable style={styles.addAlbum} onPress={() => router.push('/albums/create')} hitSlop={8}>
            <Ionicons name="add-circle" size={28} color={theme.brand} />
          </Pressable>
        )}
      </View>

      {seg === 'inbox' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsRow}
        >
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, { backgroundColor: on ? theme.brand : theme.surfaceElevated }]}
              >
                <Text style={[styles.chipText, { color: on ? theme.textInverse : theme.textSecondary }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {seg === 'albums' ? (
        albumsLoading && albums.length === 0 ? (
          <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
        ) : (
          <FlatList
            key="albums"
            data={albums}
            keyExtractor={(a) => a.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
            contentContainerStyle={{ gap: 12, paddingVertical: 16, flexGrow: albums.length === 0 ? 1 : undefined }}
            refreshControl={<RefreshControl refreshing={albumsLoading} onRefresh={loadAlbums} tintColor={theme.brand} />}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="images-outline" size={48} color={theme.textTertiary} />
                <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No albums yet</Text>
                <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>Create albums and share them in chat.</Text>
                <Pressable style={[styles.cta, { backgroundColor: theme.brand }]} onPress={() => router.push('/albums/create')}>
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
          data={filtered}
          keyExtractor={(c) => c.id}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: theme.border }]} />}
          renderItem={renderRow}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchConversations('inbox', true)} tintColor={theme.brand} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{EMPTY_COPY[filter]}</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {filter === 'all' ? (error ?? 'Tap someone on the grid to start chatting.') : 'Try a different filter.'}
              </Text>
            </View>
          }
          contentContainerStyle={filtered.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: FontSize.xxl, fontFamily: DisplayFont.bold, fontWeight: '800' },
  addAlbum: { marginLeft: 'auto' },

  // A horizontal ScrollView stretches to fill its flex-column parent's vertical
  // space unless capped — flexGrow:0 makes it wrap to the chip row's height so
  // the conversation list starts immediately below it.
  chipsScroll: { flexGrow: 0 },
  chipsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  chip: { height: 36, borderRadius: 999, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold, fontWeight: '600' },

  sep: { height: StyleSheet.hairlineWidth, marginLeft: 80 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, height: 72 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  onlineDot: { position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  rowBody: { flex: 1, gap: 5 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  nameWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  name: { fontSize: FontSize.md, fontFamily: DisplayFont.medium, fontWeight: '600', flexShrink: 1 },
  time: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, flexShrink: 0 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  preview: { fontSize: FontSize.md, fontFamily: FontFamily.regular, flex: 1 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: FontSize.xs, fontFamily: FontFamily.semibold, fontWeight: '700', color: '#fff' },

  emptyTitle: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, fontWeight: '700', marginTop: 4 },
  emptyBody: { fontSize: FontSize.md, fontFamily: FontFamily.regular, textAlign: 'center', lineHeight: 20 },
  cta: { marginTop: 8, height: 46, borderRadius: 999, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold, fontWeight: '700' },

  album: { borderRadius: 14, overflow: 'hidden', justifyContent: 'flex-end' },
  albumShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', backgroundColor: 'rgba(0,0,0,0.45)' },
  albumBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  albumName: { color: '#fff', fontSize: FontSize.md, fontFamily: DisplayFont.bold, fontWeight: '700', flex: 1, textShadowColor: '#000', textShadowRadius: 4 },
  countTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  count: { color: '#fff', fontSize: FontSize.sm, fontFamily: FontFamily.semibold, fontWeight: '700' },
});
