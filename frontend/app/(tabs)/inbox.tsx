import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  TextInput,
  Alert,
} from 'react-native';
import { RemoteImage } from '../../src/components/RemoteImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme, FontFamily, FontSize, DisplayFont } from '../../src/theme';
import { useChatStore } from '../../src/store/chatStore';
import { inboxDateLabel, formatLastMessagePreview } from '../../src/lib/format';
import { showInfo } from '../../src/lib/toast';
import { ListSkeleton } from '../../src/components/Skeleton';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import {
  listAlbums,
  listConversations,
  archiveConversation,
  pinConversation,
  deleteConversationThread,
  type ApiError,
} from '../../src/services/api';
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
  const [seg, setSeg] = useState<'inbox' | 'albums'>('inbox');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [query, setQuery] = useState('');
  const conversations = useChatStore((s) => s.conversations);
  const loading = useChatStore((s) => s.loading);
  const refreshing = useChatStore((s) => s.refreshing);
  const error = useChatStore((s) => s.error);
  const fetchConversations = useChatStore((s) => s.fetchConversations);

  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [viewArchived, setViewArchived] = useState(false);
  const [archivedList, setArchivedList] = useState<ConversationSummary[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  // Guards against a double-tap firing router.push twice before the chat
  // screen has actually mounted and taken focus away from this row.
  const navigatingRef = useRef(false);

  const loadArchived = useCallback(async () => {
    setArchivedLoading(true);
    try {
      const res = await listConversations('inbox', true);
      setArchivedList(res.conversations);
    } catch {
      /* ignore */
    } finally {
      setArchivedLoading(false);
    }
  }, []);

  // ── Multi-select mode (long-press a conversation to enter) ────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isSelecting = selectedIds.size > 0;

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const enterSelection = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedIds((prev) => new Set(prev).add(id));
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Run an action over every selected conversation, then refresh + exit selection.
  const runOnSelected = useCallback(
    async (fn: (id: string) => Promise<unknown>) => {
      const ids = [...selectedIds];
      clearSelection();
      try {
        await Promise.all(ids.map((id) => fn(id).catch(() => {})));
      } finally {
        await fetchConversations('inbox', true);
        if (viewArchived) await loadArchived();
      }
    },
    [selectedIds, clearSelection, fetchConversations, viewArchived, loadArchived],
  );

  // Pin chats is a Gold+ feature (backend throws `plan_required` for free/premium
  // users). runOnSelected swallows per-id errors so bulk actions never partially
  // fail silently on-screen — but that also meant an ineligible user's pin tap did
  // nothing with zero feedback. Detect that specific error and show the upgrade
  // prompt instead of just eating it.
  const [pinUpgradeOpen, setPinUpgradeOpen] = useState(false);
  const pinSelected = useCallback(async () => {
    const ids = [...selectedIds];
    clearSelection();
    let planBlocked = false;
    let limitMessage: string | null = null;
    try {
      await Promise.all(
        ids.map((id) =>
          pinConversation(id, true).catch((e) => {
            const err = e as ApiError;
            if (err.code === 'plan_required') planBlocked = true;
            // Gold+ user already at their plan's pin cap — distinct from not
            // having the feature at all, so show the message, not the paywall.
            else if (err.code === 'pin_limit_reached') limitMessage = err.message ?? 'Pin limit reached';
          }),
        ),
      );
    } finally {
      await fetchConversations('inbox', true);
      if (viewArchived) await loadArchived();
    }
    if (planBlocked) setPinUpgradeOpen(true);
    else if (limitMessage) showInfo(limitMessage, 'Pin limit');
  }, [selectedIds, clearSelection, fetchConversations, viewArchived, loadArchived]);
  const muteSelected = useCallback(() => {
    clearSelection();
    showInfo('Muting chats is coming soon!');
  }, [clearSelection]);
  const archiveSelected = useCallback(
    () => runOnSelected((id) => archiveConversation(id, !viewArchived)),
    [runOnSelected, viewArchived],
  );
  const deleteSelected = useCallback(() => {
    const count = selectedIds.size;
    Alert.alert(
      `Delete ${count} ${count === 1 ? 'chat' : 'chats'}?`,
      'This removes the conversation from your inbox. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => runOnSelected(deleteConversationThread) },
      ],
    );
  }, [selectedIds, runOnSelected]);

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
      navigatingRef.current = false;
      fetchConversations('inbox');
      if (seg === 'albums') loadAlbums();
    }, [fetchConversations, seg, loadAlbums])
  );

  useEffect(() => {
    if (seg === 'albums') loadAlbums();
  }, [seg, loadAlbums]);

  // Note: live message.created → unread updates are handled centrally in the
  // tabs layout (app/(tabs)/_layout.tsx) so the Inbox tab badge stays accurate
  // on every tab and messages are never double-counted. This screen renders
  // straight from the shared chat store, so it reflects those updates live.

  const filtered = useMemo(() => {
    let list = conversations;
    switch (filter) {
      case 'unread': list = list.filter((c) => (c.unreadCount ?? 0) > 0); break;
      case 'pinned': list = list.filter((c) => c.isPinned); break;
      case 'online': list = list.filter((c) => isPeerOnline(c.peer)); break;
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const name = (c.peer.firstName ?? '').toLowerCase();
        const last = typeof c.lastMessage === 'string' ? c.lastMessage : c.lastMessage?.content ?? '';
        return name.includes(q) || last.toLowerCase().includes(q);
      });
    }
    return list;
  }, [conversations, filter, query]);

  const renderRow = ({ item }: { item: ConversationSummary }) => {
    const online = isPeerOnline(item.peer);
    const dateLabel = inboxDateLabel(item.lastMessageAt);
    const unread = item.unreadCount ?? 0;
    const selected = selectedIds.has(item.id);
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          isSelecting && !selected && { opacity: 0.6 },
          pressed && { backgroundColor: theme.backgroundTertiary },
        ]}
        android_ripple={{ color: theme.brand + '33' }}
        onPress={() => {
          if (isSelecting) {
            toggleSelection(item.id);
            return;
          }
          // A row can register a second tap before the chat screen takes focus
          // away from Inbox — without this guard that opens the conversation twice.
          if (navigatingRef.current) return;
          navigatingRef.current = true;
          router.push({ pathname: '/chat/[id]', params: { id: item.id, peerName: item.peer.firstName ?? '', peerPhoto: item.peer.profilePhoto ?? '' } });
        }}
        onLongPress={() => (isSelecting ? toggleSelection(item.id) : enterSelection(item.id))}
      >
        <View>
          {item.peer.profilePhoto ? (
            <RemoteImage source={{ uri: item.peer.profilePhoto }} stableId={item.peer.id} style={[styles.avatar, { backgroundColor: theme.backgroundTertiary }]} contentFit="cover" transition={120} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.backgroundTertiary }]}>
              <Ionicons name="person" size={26} color={theme.textTertiary} />
            </View>
          )}
          {online && !selected && <View style={[styles.onlineDot, { backgroundColor: theme.online, borderColor: theme.background }]} />}
          {selected && (
            <View style={[styles.selectCheck, { backgroundColor: theme.brand, borderColor: theme.background }]}>
              <Ionicons name="checkmark" size={13} color="#fff" />
            </View>
          )}
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
                {/* Cap at 99+ — a raw 3-digit count overflows the 20px pill. */}
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
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
        <RemoteImage source={{ uri: item.coverPhoto.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
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
      {isSelecting ? (
        <View style={styles.selectionBar}>
          <Pressable onPress={clearSelection} hitSlop={10}>
            <Ionicons name="close" size={26} color={theme.textPrimary} />
          </Pressable>
          <Text style={[styles.selectionCount, { color: theme.textPrimary }]}>{selectedIds.size} selected</Text>
          <View style={styles.selectionActions}>
            <Pressable onPress={pinSelected} hitSlop={8}>
              <Ionicons name="pin" size={22} color={theme.textPrimary} />
            </Pressable>
            <Pressable onPress={muteSelected} hitSlop={8}>
              <Ionicons name="notifications-off" size={22} color={theme.textPrimary} />
            </Pressable>
            <Pressable onPress={archiveSelected} hitSlop={8}>
              <Ionicons name={viewArchived ? 'chatbubbles' : 'archive'} size={22} color={theme.textPrimary} />
            </Pressable>
            <Pressable onPress={deleteSelected} hitSlop={8}>
              <Ionicons name="trash" size={22} color={theme.error} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.titleRow}>
          <Pressable onPress={() => setSeg('inbox')}>
            <Text style={[styles.title, { color: seg === 'inbox' ? theme.textPrimary : theme.textTertiary }]}>Inbox</Text>
          </Pressable>
          <Pressable onPress={() => setSeg('albums')}>
            <Text style={[styles.title, { color: seg === 'albums' ? theme.textPrimary : theme.textTertiary }]}>Albums</Text>
          </Pressable>
          {seg === 'inbox' && (
            <Pressable
              style={styles.addAlbum}
              hitSlop={8}
              onPress={() => {
                const next = !viewArchived;
                setViewArchived(next);
                if (next) loadArchived();
              }}
            >
              <Ionicons name={viewArchived ? 'chatbubbles' : 'archive-outline'} size={24} color={viewArchived ? theme.brand : theme.textSecondary} />
            </Pressable>
          )}
          {seg === 'albums' && (
            <Pressable style={styles.addAlbum} onPress={() => router.push('/albums/create')} hitSlop={8}>
              <Ionicons name="add-circle" size={28} color={theme.brand} />
            </Pressable>
          )}
        </View>
      )}

      {seg === 'inbox' && !viewArchived && !isSelecting && (
        <View style={[styles.searchBar, { backgroundColor: theme.surfaceElevated }]}>
          <Ionicons name="search" size={16} color={theme.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search conversations"
            placeholderTextColor={theme.textTertiary}
            style={[styles.searchInput, { color: theme.textPrimary }]}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={theme.textTertiary} />
            </Pressable>
          ) : null}
        </View>
      )}

      {seg === 'inbox' && !viewArchived && !isSelecting && (
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
          data={viewArchived ? archivedList : filtered}
          keyExtractor={(c) => c.id}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: theme.border }]} />}
          renderItem={renderRow}
          refreshControl={
            <RefreshControl
              refreshing={viewArchived ? archivedLoading : refreshing}
              onRefresh={() => (viewArchived ? loadArchived() : fetchConversations('inbox', true))}
              tintColor={theme.brand}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name={viewArchived ? 'archive-outline' : 'chatbubbles-outline'} size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
                {viewArchived ? 'No archived chats' : EMPTY_COPY[filter]}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {viewArchived
                  ? 'Long-press a conversation to archive it.'
                  : filter === 'all'
                    ? (error ?? 'Tap someone on the grid to start chatting.')
                    : 'Try a different filter.'}
              </Text>
            </View>
          }
          contentContainerStyle={(viewArchived ? archivedList : filtered).length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        />
      )}

      <UpgradeModal
        visible={pinUpgradeOpen}
        onClose={() => setPinUpgradeOpen(false)}
        title="Pin chats"
        message="Pinning chats is available on Gold and above. Upgrade to keep your favorite conversations at the top."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: FontSize.xxl, fontFamily: DisplayFont.bold, fontWeight: '800' },
  addAlbum: { marginLeft: 'auto' },

  selectionBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  selectionCount: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, fontWeight: '700' },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: 22, marginLeft: 'auto' },
  selectCheck: { position: 'absolute', left: -2, top: -2, width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  // A horizontal ScrollView stretches to fill its flex-column parent's vertical
  // space unless capped — flexGrow:0 makes it wrap to the chip row's height so
  // the conversation list starts immediately below it.
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, height: 40, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.regular },

  chipsScroll: { flexGrow: 0 },
  chipsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  chip: { height: 36, borderRadius: 999, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold, fontWeight: '600' },

  sep: { height: StyleSheet.hairlineWidth, marginLeft: 80 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, height: 72 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
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
