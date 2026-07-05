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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { useTheme, FontFamily, DisplayFont, spacing, radius } from '../../src/theme';
import { listRooms, listJoinedRooms, joinRoom } from '../../src/services/api';
import { CATEGORY_FILTERS } from '../../src/lib/rooms';
import { toastApiError } from '../../src/lib/toast';
import { GroupCard } from '../../src/components/rooms/GroupCard';
import {
  RoomFilterSheet,
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverFilters,
} from '../../src/components/rooms/RoomFilterSheet';
import type { RoomCard, JoinedRoomCard, RoomCategory } from '../../src/types/api';

type Tab = 'mine' | 'discover';
const PAGE = 20;

export default function Groups() {
  const { theme } = useTheme();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('mine');

  // ── My Groups state ──
  const [joined, setJoined] = useState<JoinedRoomCard[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [mineQuery, setMineQuery] = useState('');

  // ── Discover state ──
  const [rooms, setRooms] = useState<RoomCard[]>([]);
  const [loadingDiscover, setLoadingDiscover] = useState(true);
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [category, setCategory] = useState<RoomCategory | null>(null);
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_DISCOVER_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

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
      setJoined(j.rooms);
    } catch (e) {
      toastApiError(e, 'Could not load your rooms');
    } finally {
      setLoadingMine(false);
    }
  }, []);

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

  // Reload both lists on focus.
  useFocusEffect(
    useCallback(() => {
      loadJoined();
      loadDiscover(true, 0);
    }, [loadJoined, loadDiscover]),
  );

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
    await Promise.all([loadJoined(), loadDiscover(true, 0)]);
    setRefreshing(false);
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
      setJoined((prev) => (prev.some((r) => r.id === room.id) ? prev : [joinedCard, ...prev]));
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
  const TabButton = ({ value, label, count }: { value: Tab; label: string; count?: number }) => {
    const active = tab === value;
    return (
      <Pressable style={styles.tabBtn} onPress={() => setTab(value)}>
        <Text style={[styles.tabText, { color: active ? theme.textPrimary : theme.textTertiary }]}>
          {label}
          {count ? ` ${count}` : ''}
        </Text>
        {active && <View style={[styles.tabUnderline, { backgroundColor: theme.textPrimary }]} />}
      </Pressable>
    );
  };

  const query = tab === 'mine' ? mineQuery : discoverQuery;
  const setQuery = tab === 'mine' ? setMineQuery : setDiscoverQuery;

  const SearchRow = (
    <View style={styles.searchRow}>
      <View style={[styles.searchBar, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
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
            { backgroundColor: filtersActive ? theme.brand : theme.surfaceElevated, borderColor: theme.border },
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
      </View>

      <View style={styles.controls}>
        {SearchRow}
        {tab === 'discover' ? DiscoverChips : null}
      </View>

      {loading ? (
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
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { fontSize: 26, fontFamily: DisplayFont.bold, paddingHorizontal: spacing.xl, paddingTop: 8, paddingBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: spacing.xxxl, fontFamily: FontFamily.regular, fontSize: 15, paddingHorizontal: spacing.xl },
  emptyState: { alignItems: 'center', marginTop: spacing.xxxl * 1.5, gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: 16, fontFamily: FontFamily.semibold, textAlign: 'center' },
  emptyLink: { fontSize: 15, fontFamily: FontFamily.semibold },

  tabs: { flexDirection: 'row', marginBottom: 2 },
  tabBtn: { flex: 1, alignItems: 'center', paddingBottom: 10 },
  tabText: { fontSize: 16, fontFamily: FontFamily.semibold, paddingTop: 4 },
  tabUnderline: { height: 2, width: '70%', marginTop: 8, borderRadius: 2 },

  controls: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 44, borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 15, fontFamily: FontFamily.regular },
  filterBtn: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },

  chipsRow: { gap: spacing.sm, paddingVertical: spacing.md },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  filterChipText: { fontSize: 13, fontFamily: FontFamily.semibold },
});
