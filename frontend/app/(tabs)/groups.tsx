import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  ScrollView,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { useTheme, FontFamily, DisplayFont, FontSize, spacing, radius } from '../../src/theme';
import {
  listRooms,
  listJoinedRooms,
  joinRoom,
  listRoomInvites,
  acceptRoomInvite,
  declineRoomInvite,
} from '../../src/services/api';
import { CATEGORY_FILTERS, categoryMeta, relativeTime } from '../../src/lib/rooms';
import { toastApiError, showSuccess } from '../../src/lib/toast';
import { connectSocket } from '../../src/services/socket';
import { useGroupsStore } from '../../src/store/groupsStore';
import { GroupCard } from '../../src/components/rooms/GroupCard';
import {
  RoomFilterSheet,
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverFilters,
} from '../../src/components/rooms/RoomFilterSheet';
import type {
  RoomCard,
  JoinedRoomCard,
  RoomCategory,
  RoomInviteCard,
  RoomInviteReceivedEvent,
} from '../../src/types/api';

type Tab = 'mine' | 'discover' | 'invites';
const PAGE = 20;

export default function Groups() {
  const { theme } = useTheme();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('mine');

  // ── My Groups state ──
  // Sourced from the shared groups store (not local state) so this list stays
  // live with the same socket-driven unread counts the tab-bar badge uses —
  // otherwise a message arriving while this screen is open/mounted wouldn't
  // show up until the next full refetch.
  const joined = useGroupsStore((st) => st.rooms);
  const setJoinedRooms = useGroupsStore((st) => st.setRooms);
  const addRoomToStore = useGroupsStore((st) => st.addRoom);
  const [loadingMine, setLoadingMine] = useState(true);
  const [mineQuery, setMineQuery] = useState('');

  // ── Discover state ──
  const [rooms, setRooms] = useState<RoomCard[]>([]);
  const [loadingDiscover, setLoadingDiscover] = useState(true);
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [category, setCategory] = useState<RoomCategory | null>(null);
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_DISCOVER_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  // ── Invites state ──
  const [invites, setInvites] = useState<RoomInviteCard[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [actingInviteId, setActingInviteId] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Loaders ──
  const loadJoined = useCallback(async () => {
    try {
      const j = await listJoinedRooms();
      setJoinedRooms(j.rooms);
    } catch (e) {
      toastApiError(e, 'Could not load your rooms');
    } finally {
      setLoadingMine(false);
    }
  }, [setJoinedRooms]);

  const loadDiscover = useCallback(
    async (reset: boolean, currentCount: number) => {
      const offset = reset ? 0 : currentCount;
      try {
        const res = await listRooms({
          category: category ?? undefined,
          city: filters.city.trim() || undefined,
          search: discoverQuery.trim() || undefined,
          limit: PAGE,
          offset,
        });
        setHasMore(res.rooms.length === PAGE);
        setRooms((prev) => (reset ? res.rooms : [...prev, ...res.rooms]));
      } catch (e) {
        toastApiError(e, 'Could not load rooms');
      } finally {
        setLoadingDiscover(false);
      }
    },
    [category, filters.city, discoverQuery],
  );

  const loadInvites = useCallback(async () => {
    try {
      const res = await listRoomInvites();
      setInvites(res.invites);
    } catch (e) {
      toastApiError(e, 'Could not load invites');
    } finally {
      setLoadingInvites(false);
    }
  }, []);

  // Reload all lists on focus.
  useFocusEffect(
    useCallback(() => {
      loadJoined();
      loadDiscover(true, 0);
      loadInvites();
    }, [loadJoined, loadDiscover, loadInvites]),
  );

  // Live invite delivery: append the new invite and land on the Invites tab badge.
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const socket = await connectSocket();
      if (!socket) return;
      const onInvite = (p: RoomInviteReceivedEvent) => {
        setInvites((prev) => {
          if (prev.some((i) => i.id === p.inviteId)) return prev;
          const card: RoomInviteCard = {
            id: p.inviteId,
            room: { id: p.roomId, name: p.roomName, coverImageUrl: null, memberCount: 0, category: 'city_dating' },
            inviter: { id: '', firstName: p.inviterName, profilePhotoUrl: p.inviterPhoto, isVerified: false },
            createdAt: new Date().toISOString(),
          };
          return [card, ...prev];
        });
        // Refetch to fill in accurate room/inviter details.
        loadInvites();
      };
      socket.on('room_invite:received', onInvite);
      cleanup = () => { socket.off('room_invite:received', onInvite); };
    })();
    return () => cleanup();
  }, [loadInvites]);

  // Debounced Discover reload when query / category / city change.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setLoadingDiscover(true);
      loadDiscover(true, 0);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [discoverQuery, category, filters.city, loadDiscover]);

  useEffect(() => {
    return () => {
      if (switchTimer.current) clearTimeout(switchTimer.current);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadJoined(), loadDiscover(true, 0), loadInvites()]);
    setRefreshing(false);
  };

  // ── Invite actions ──
  const handleAcceptInvite = async (invite: RoomInviteCard) => {
    if (actingInviteId) return;
    setActingInviteId(invite.id);
    try {
      await acceptRoomInvite(invite.id);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      // Optimistically add to My Groups.
      const joinedCard: JoinedRoomCard = {
        id: invite.room.id,
        name: invite.room.name,
        description: null,
        category: invite.room.category,
        city: null,
        state: null,
        country: 'India',
        isOfficial: false,
        isVerifiedOnly: false,
        coverImageUrl: invite.room.coverImageUrl,
        memberCount: invite.room.memberCount,
        onlineCount: 0,
        lastActivityAt: new Date().toISOString(),
        rules: null,
        isJoined: true,
        createdAt: new Date().toISOString(),
        unreadCount: 0,
        role: 'member',
      };
      addRoomToStore(joinedCard);
      showSuccess(`You joined ${invite.room.name}!`);
      switchTimer.current = setTimeout(() => setTab('mine'), 600);
    } catch (e) {
      toastApiError(e, 'Could not accept invite');
    } finally {
      setActingInviteId(null);
    }
  };

  const handleDeclineInvite = async (invite: RoomInviteCard) => {
    if (actingInviteId) return;
    setActingInviteId(invite.id);
    try {
      await declineRoomInvite(invite.id);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      showSuccess('Invite declined');
    } catch (e) {
      toastApiError(e, 'Could not decline invite');
    } finally {
      setActingInviteId(null);
    }
  };

  const onEndReached = async () => {
    if (tab !== 'discover' || loadingMore || !hasMore || loadingDiscover) return;
    setLoadingMore(true);
    await loadDiscover(false, rooms.length);
    setLoadingMore(false);
  };

  // ── Join (optimistic, no refetch) ──
  const handleJoin = async (room: RoomCard) => {
    if (joiningId) return;
    setJoiningId(room.id);
    try {
      const res = await joinRoom(room.id);
      // Optimistic: remove from Discover, add to My Groups.
      setRooms((prev) => prev.filter((r) => r.id !== room.id));
      const joinedCard: JoinedRoomCard = {
        ...res.room,
        isJoined: true,
        unreadCount: 0,
        role: 'member',
      };
      addRoomToStore(joinedCard);
      // Auto-switch to My Groups after the pulse.
      switchTimer.current = setTimeout(() => setTab('mine'), 600);
    } catch (e) {
      toastApiError(e, 'Could not join room');
    } finally {
      setJoiningId(null);
    }
  };

  const openRoom = (roomId: string, unread = 0) =>
    router.push(`/rooms/${roomId}${unread > 0 ? `?unread=${unread}` : ''}` as Href);

  // ── Client-side filtering ──
  const filteredJoined = useMemo(() => {
    const q = mineQuery.trim().toLowerCase();
    if (!q) return joined;
    return joined.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q),
    );
  }, [joined, mineQuery]);

  const sortedRooms = useMemo(() => {
    let list = rooms.filter((r) => r.memberCount >= filters.memberFloor);
    if (filters.sort === 'members') list = [...list].sort((a, b) => b.memberCount - a.memberCount);
    else if (filters.sort === 'recent')
      list = [...list].sort(
        (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
      );
    else if (filters.sort === 'trending')
      list = [...list].sort((a, b) => b.onlineCount - a.onlineCount || b.memberCount - a.memberCount);
    return list;
  }, [rooms, filters.memberFloor, filters.sort]);

  const filtersActive =
    filters.city.trim() !== '' || filters.sort !== 'trending' || filters.memberFloor !== 0;

  // ── UI ──
  const TabButton = ({ value, label, count, dot }: { value: Tab; label: string; count?: number; dot?: boolean }) => {
    const active = tab === value;
    return (
      <Pressable style={styles.tabBtn} onPress={() => setTab(value)}>
        <View style={styles.tabLabelRow}>
          <Text style={[styles.tabText, { color: active ? theme.textPrimary : theme.textTertiary }]}>
            {label}
            {count ? ` ${count}` : ''}
          </Text>
          {dot && <View style={[styles.tabDot, { backgroundColor: theme.warning }]} />}
        </View>
        {active && <View style={[styles.tabUnderline, { backgroundColor: theme.textPrimary }]} />}
      </Pressable>
    );
  };

  const query = tab === 'mine' ? mineQuery : discoverQuery;
  const setQuery = tab === 'mine' ? setMineQuery : setDiscoverQuery;

  const SearchRow = (
    <View style={styles.searchRow}>
      <View style={[styles.searchBar, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tab === 'mine' ? 'Search your groups' : 'Search rooms or city'}
          placeholderTextColor={theme.textTertiary}
          style={[styles.searchInput, { color: theme.textPrimary }]}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
          </Pressable>
        ) : null}
      </View>
      {tab === 'discover' ? (
        <Pressable
          onPress={() => setFilterOpen(true)}
          style={[
            styles.filterBtn,
            { backgroundColor: filtersActive ? theme.brand : theme.backgroundSecondary, borderColor: theme.border },
          ]}
        >
          <Ionicons name="options-outline" size={20} color={filtersActive ? '#fff' : theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );

  const DiscoverChips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      {CATEGORY_FILTERS.map((c) => {
        const active = category === c.value;
        return (
          <Pressable
            key={c.label}
            onPress={() => setCategory(c.value)}
            style={[
              styles.filterChip,
              { backgroundColor: active ? theme.brand : theme.surfaceElevated, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.filterChipText, { color: active ? '#fff' : theme.textSecondary }]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const loading = tab === 'mine' ? loadingMine : loadingDiscover;
  const data = tab === 'mine' ? filteredJoined : sortedRooms;

  const renderEmpty = () => {
    if (tab === 'mine') {
      if (mineQuery.trim()) {
        return <Text style={[styles.empty, { color: theme.textTertiary }]}>No groups match your search</Text>;
      }
      return (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>
            You haven't joined any rooms yet
          </Text>
          <Pressable onPress={() => setTab('discover')}>
            <Text style={[styles.emptyLink, { color: theme.brand }]}>Discover rooms near you</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <Text style={[styles.empty, { color: theme.textTertiary }]}>
        No rooms found — try a different search or category
      </Text>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <Text style={[styles.header, { color: theme.textPrimary }]}>Groups</Text>

      <View style={styles.tabs}>
        <TabButton value="mine" label="My Groups" />
        <TabButton value="discover" label="Discover" />
        <TabButton value="invites" label="Invites" count={invites.length || undefined} dot={invites.length > 0} />
      </View>

      {tab !== 'invites' ? (
        <View style={styles.controls}>
          {SearchRow}
          {tab === 'discover' ? DiscoverChips : null}
        </View>
      ) : null}

      {tab === 'invites' ? (
        loadingInvites ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.brand} />
          </View>
        ) : (
          <FlatList
            key="invites"
            data={invites}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <InviteCard
                invite={item}
                theme={theme}
                acting={actingInviteId === item.id}
                onAccept={() => handleAcceptInvite(item)}
                onDecline={() => handleDeclineInvite(item)}
              />
            )}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl }}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="mail-outline" size={64} color={theme.textTertiary} />
                <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>No pending group invites</Text>
                <Text style={[styles.emptySub, { color: theme.textTertiary }]}>
                  When someone invites you to a group, it will appear here
                </Text>
              </View>
            }
          />
        )
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : (
        <FlatList
          key={tab}
          data={data}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <GroupCard
              room={item}
              variant={tab === 'mine' ? 'joined' : 'discover'}
              joining={joiningId === item.id}
              onPress={() => openRoom(item.id, (item as JoinedRoomCard).unreadCount ?? 0)}
              onJoin={() => handleJoin(item as RoomCard)}
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: tab === 'mine' ? spacing.xs : 0,
            paddingBottom: spacing.xxxl,
          }}
          ItemSeparatorComponent={() =>
            tab === 'mine' ? (
              <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />
            ) : (
              <View style={{ height: spacing.md }} />
            )
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={theme.brand} style={{ marginTop: spacing.lg }} /> : null
          }
          ListEmptyComponent={renderEmpty()}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <RoomFilterSheet
        visible={filterOpen}
        value={filters}
        onClose={() => setFilterOpen(false)}
        onApply={setFilters}
      />
    </SafeAreaView>
  );
}

/** A single pending room invite with fade-out on Accept/Decline. */
function InviteCard({
  invite,
  theme,
  acting,
  onAccept,
  onDecline,
}: {
  invite: RoomInviteCard;
  theme: ReturnType<typeof useTheme>['theme'];
  acting: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const fadeOut = (action: () => void) => {
    Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => action());
  };
  const cat = categoryMeta(theme, invite.room.category);
  const inviterName = invite.inviter.firstName ?? 'Someone';

  return (
    <Animated.View style={[styles.inviteCard, { backgroundColor: theme.surface, opacity }]}>
      {invite.room.coverImageUrl ? (
        <Image source={{ uri: invite.room.coverImageUrl }} style={styles.inviteCover} contentFit="cover" transition={120} cachePolicy="memory-disk" />
      ) : (
        <View style={[styles.inviteCover, { backgroundColor: cat.color + '26', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name={cat.icon} size={24} color={cat.color} />
        </View>
      )}
      <View style={styles.inviteBody}>
        <Text style={[styles.inviteRoomName, { color: theme.textPrimary }]} numberOfLines={1}>{invite.room.name}</Text>
        <Text style={[styles.inviteSub, { color: theme.textSecondary }]} numberOfLines={1}>
          {inviterName} invited you to join
        </Text>
        <Text style={[styles.inviteTime, { color: theme.textTertiary }]}>{relativeTime(invite.createdAt)}</Text>
      </View>
      <View style={styles.inviteActions}>
        <Pressable
          onPress={() => fadeOut(onDecline)}
          disabled={acting}
          style={[styles.inviteDecline, { borderColor: theme.error }]}
        >
          <Text style={[styles.inviteDeclineText, { color: theme.error }]}>Decline</Text>
        </Pressable>
        <Pressable onPress={() => fadeOut(onAccept)} disabled={acting}>
          <LinearGradient
            colors={theme.gradientWarm}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inviteAccept}
          >
            {acting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.inviteAcceptText}>Accept</Text>}
          </LinearGradient>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { fontSize: FontSize.xxl, fontFamily: DisplayFont.bold, paddingHorizontal: spacing.xl, paddingTop: 8, paddingBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: spacing.xxxl, fontFamily: FontFamily.regular, fontSize: FontSize.md, paddingHorizontal: spacing.xl },
  emptyState: { alignItems: 'center', marginTop: spacing.xxxl * 1.5, gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.semibold, textAlign: 'center' },
  emptySub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, textAlign: 'center' },
  emptyLink: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },

  tabs: { flexDirection: 'row', marginBottom: 2 },
  tabBtn: { flex: 1, alignItems: 'center', paddingBottom: 10 },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 4 },
  tabText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  tabDot: { width: 7, height: 7, borderRadius: 4 },
  tabUnderline: { height: 2, width: '70%', marginTop: 8, borderRadius: 2 },

  // ── Invite card ──
  inviteCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg },
  inviteCover: { width: 56, height: 56, borderRadius: 28 },
  inviteBody: { flex: 1, minWidth: 0 },
  inviteRoomName: { fontSize: FontSize.lg, fontFamily: DisplayFont.medium },
  inviteSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 2 },
  inviteTime: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  inviteActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inviteDecline: { height: 34, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  inviteDeclineText: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  inviteAccept: { height: 34, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  inviteAcceptText: { fontSize: FontSize.sm, fontFamily: FontFamily.bold, color: '#fff' },

  controls: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 44, borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.regular },
  filterBtn: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  // Indent the My Groups divider past the 56px avatar + row gap so it reads as a list.
  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: 56 + spacing.md },

  chipsRow: { gap: spacing.sm, paddingVertical: spacing.md },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  filterChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
});
