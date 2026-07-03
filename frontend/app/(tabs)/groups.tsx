import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import { useTheme, FontFamily, DisplayFont, spacing, radius } from '../../src/theme';
import { listRooms, listJoinedRooms, joinRoom } from '../../src/services/api';
import { categoryMeta, CATEGORY_FILTERS, formatCount } from '../../src/lib/rooms';
import { toastApiError } from '../../src/lib/toast';
import type { RoomCard, JoinedRoomCard, RoomCategory } from '../../src/types/api';

const PAGE = 20;

export default function Groups() {
  const { theme } = useTheme();
  const router = useRouter();

  const [joined, setJoined] = useState<JoinedRoomCard[]>([]);
  const [rooms, setRooms] = useState<RoomCard[]>([]);
  const [category, setCategory] = useState<RoomCategory | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const loadDiscover = useCallback(
    async (reset: boolean, currentCount: number) => {
      const offset = reset ? 0 : currentCount;
      try {
        const res = await listRooms({
          category: category ?? undefined,
          search: search.trim() || undefined,
          limit: PAGE,
          offset,
        });
        setHasMore(res.rooms.length === PAGE);
        setRooms((prev) => (reset ? res.rooms : [...prev, ...res.rooms]));
      } catch (e) {
        toastApiError(e, 'Could not load rooms');
      }
    },
    [category, search],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const j = await listJoinedRooms();
      setJoined(j.rooms);
      await loadDiscover(true, 0);
    } finally {
      setLoading(false);
    }
  }, [loadDiscover]);

  // Reload whenever the tab regains focus (unread badges, join state) or the filter changes.
  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    await loadDiscover(false, rooms.length);
    setLoadingMore(false);
  };

  const onSearchSubmit = async () => {
    setLoading(true);
    await loadDiscover(true, 0);
    setLoading(false);
  };

  const handleJoin = async (room: RoomCard) => {
    if (joiningId) return;
    setJoiningId(room.id);
    try {
      await joinRoom(room.id);
      router.push(`/rooms/${room.id}` as Href);
    } catch (e) {
      toastApiError(e, 'Could not join room');
    } finally {
      setJoiningId(null);
    }
  };

  // Cast: expo-router's generated route union lags behind newly added files.
  const openRoom = (roomId: string) => router.push(`/rooms/${roomId}` as Href);

  const ListHeader = (
    <View>
      {/* SECTION 1: MY ROOMS */}
      {joined.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>My Rooms</Text>
          {joined.length > 3 ? (
            <View style={{ gap: spacing.sm }}>
              {joined.map((r) => (
                <JoinedRow key={r.id} room={r} onPress={() => openRoom(r.id)} />
              ))}
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.xl }}
            >
              {joined.map((r) => (
                <JoinedCard key={r.id} room={r} onPress={() => openRoom(r.id)} />
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}

      {/* SECTION 2: DISCOVER */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: joined.length ? spacing.xl : 0 }]}>
        Discover Rooms
      </Text>

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

      <View style={[styles.searchBar, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.textTertiary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={onSearchSubmit}
          returnKeyType="search"
          placeholder="Search rooms or city"
          placeholderTextColor={theme.textTertiary}
          style={[styles.searchInput, { color: theme.textPrimary }]}
        />
        {search.length > 0 ? (
          <Pressable
            onPress={() => {
              setSearch('');
              onSearchSubmit();
            }}
          >
            <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <Text style={[styles.header, { color: theme.textPrimary }]}>Rooms</Text>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <DiscoverCard
              room={item}
              joining={joiningId === item.id}
              onJoin={() => handleJoin(item)}
              onOpen={() => openRoom(item.id)}
            />
          )}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={theme.brand} style={{ marginTop: spacing.lg }} /> : null
          }
          ListEmptyComponent={<Text style={[styles.empty, { color: theme.textTertiary }]}>No rooms found.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

/* ── My Rooms: horizontal card (≤3 joined) ── */
function JoinedCard({ room, onPress }: { room: JoinedRoomCard; onPress: () => void }) {
  const { theme } = useTheme();
  const meta = categoryMeta(theme, room.category);
  return (
    <Pressable onPress={onPress} style={[styles.joinedCard, { backgroundColor: theme.surfaceElevated }]}>
      <View style={[styles.joinedIcon, { backgroundColor: meta.color + '22' }]}>
        <Ionicons name={meta.icon} size={22} color={meta.color} />
        {room.unreadCount > 0 ? <View style={[styles.unreadDot, { backgroundColor: theme.brandSecondary }]} /> : null}
      </View>
      <Text style={[styles.joinedName, { color: theme.textPrimary }]} numberOfLines={2}>
        {room.name}
      </Text>
    </Pressable>
  );
}

/* ── My Rooms: vertical row (>3 joined) ── */
function JoinedRow({ room, onPress }: { room: JoinedRoomCard; onPress: () => void }) {
  const { theme } = useTheme();
  const meta = categoryMeta(theme, room.category);
  return (
    <Pressable onPress={onPress} style={[styles.joinedRow, { backgroundColor: theme.surfaceElevated }]}>
      <View style={[styles.rowIcon, { backgroundColor: meta.color + '22' }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, { color: theme.textPrimary }]} numberOfLines={1}>
          {room.name}
        </Text>
        <Text style={[styles.rowMeta, { color: theme.textTertiary }]}>{formatCount(room.memberCount)} members</Text>
      </View>
      {room.unreadCount > 0 ? (
        <View style={[styles.unreadBadge, { backgroundColor: theme.brandSecondary }]}>
          <Text style={styles.unreadBadgeText}>{room.unreadCount > 99 ? '99+' : room.unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* ── Discover card ── */
function DiscoverCard({
  room,
  joining,
  onJoin,
  onOpen,
}: {
  room: RoomCard;
  joining: boolean;
  onJoin: () => void;
  onOpen: () => void;
}) {
  const { theme } = useTheme();
  const meta = categoryMeta(theme, room.category);
  return (
    <Pressable
      onPress={room.isJoined ? onOpen : undefined}
      style={[styles.card, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
    >
      <View style={[styles.cardIcon, { backgroundColor: meta.color + '22' }]}>
        <Ionicons name={meta.icon} size={26} color={meta.color} />
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardName, { color: theme.textPrimary }]} numberOfLines={1}>
            {room.name}
          </Text>
          {room.isOfficial ? <Ionicons name="checkmark-circle" size={16} color={theme.info} /> : null}
        </View>

        <View style={styles.cardMetaRow}>
          <View style={[styles.catChip, { backgroundColor: meta.color + '22' }]}>
            <Text style={[styles.catChipText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {room.city ? <Text style={[styles.cardCity, { color: theme.textTertiary }]}>{room.city}</Text> : null}
        </View>

        <View style={styles.cardStatsRow}>
          <Text style={[styles.cardStat, { color: theme.textSecondary }]}>{formatCount(room.memberCount)} members</Text>
          {room.onlineCount > 0 ? (
            <View style={styles.onlineWrap}>
              <View style={[styles.onlineDot, { backgroundColor: theme.success }]} />
              <Text style={[styles.cardStat, { color: theme.textSecondary }]}>{formatCount(room.onlineCount)} online</Text>
            </View>
          ) : null}
        </View>

        {room.description ? (
          <Text style={[styles.cardDesc, { color: theme.textTertiary }]} numberOfLines={1}>
            {room.description}
          </Text>
        ) : null}
      </View>

      {/* Join / Open button */}
      {room.isJoined ? (
        <Pressable onPress={onOpen} style={[styles.openBtn, { borderColor: theme.brand }]}>
          <Text style={[styles.openBtnText, { color: theme.brand }]}>Open</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onJoin} disabled={joining}>
          <LinearGradient colors={theme.gradientWarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.joinBtn}>
            {joining ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.joinBtnText}>Join</Text>}
          </LinearGradient>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { fontSize: 26, fontFamily: DisplayFont.bold, paddingHorizontal: spacing.xl, paddingTop: 8, paddingBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: spacing.xxxl, fontFamily: FontFamily.regular, fontSize: 15 },
  section: {},
  sectionTitle: { fontSize: 18, fontFamily: DisplayFont.bold, marginBottom: spacing.md },

  joinedCard: { width: 110, padding: spacing.md, borderRadius: radius.lg, alignItems: 'center', gap: spacing.sm },
  joinedIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  joinedName: { fontSize: 12, fontFamily: FontFamily.semibold, textAlign: 'center' },
  unreadDot: { position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: 6 },

  joinedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 15, fontFamily: FontFamily.semibold },
  rowMeta: { fontSize: 12, fontFamily: FontFamily.regular, marginTop: 2 },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontFamily: FontFamily.bold },

  chipsRow: { gap: spacing.sm, paddingVertical: spacing.md },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  filterChipText: { fontSize: 13, fontFamily: FontFamily.semibold },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 44, borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth, marginBottom: spacing.lg },
  searchInput: { flex: 1, fontSize: 15, fontFamily: FontFamily.regular },

  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  cardIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardName: { fontSize: 17, fontFamily: DisplayFont.bold, flexShrink: 1 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  catChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  catChipText: { fontSize: 11, fontFamily: FontFamily.semibold },
  cardCity: { fontSize: 12, fontFamily: FontFamily.regular },
  cardStatsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 4 },
  cardStat: { fontSize: 13, fontFamily: FontFamily.regular },
  onlineWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  cardDesc: { fontSize: 12, fontFamily: FontFamily.regular, marginTop: 4 },
  joinBtn: { paddingHorizontal: 18, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  joinBtnText: { color: '#fff', fontSize: 14, fontFamily: FontFamily.bold },
  openBtn: { paddingHorizontal: 16, height: 36, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  openBtnText: { fontSize: 14, fontFamily: FontFamily.bold },
});
