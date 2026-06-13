import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  useWindowDimensions,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useTheme } from '../../src/theme';
import { useGridStore } from '../../src/store/gridStore';
import { useFilterStore } from '../../src/store/filterStore';
import { UserCardTile } from '../../src/components/UserCardTile';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import { GridSkeleton } from '../../src/components/Skeleton';
import { startConversation, updateLocation, ApiError, GridQuery } from '../../src/services/api';
import type { UserCard } from '../../src/types/api';

const COLS = 3;
const GAP = 2;
const REFRESH_MS = 3 * 60 * 1000;

type Coords = { lat: number; lng: number };
type QuickFilter = { key: string; label: string; patch: Partial<GridQuery> };

const QUICK_FILTERS: QuickFilter[] = [
  { key: 'online', label: 'Online', patch: { onlineOnly: true } },
  { key: 'fresh', label: 'Fresh', patch: { sort: 'fresh' } },
];

export default function Browse() {
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const tile = (width - GAP * (COLS - 1)) / COLS;
  const rowHeight = tile + GAP;

  const { cards, loading, refreshing, loadingMore, error, total, fetchGrid, fetchMore, hydrateCache } = useGridStore();

  const [coords, setCoords] = useState<Coords | null>(null);
  const [permDenied, setPermDenied] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const lastRefresh = useRef(0);

  const filterVersion = useFilterStore((s) => s.version);
  const toQuery = useFilterStore((s) => s.toQuery);

  const query = useMemo<Omit<GridQuery, 'lat' | 'lng' | 'limit' | 'offset'>>(() => {
    const quick = QUICK_FILTERS.find((q) => q.key === activeFilter);
    // Merge applied filter-sheet values with the active quick chip.
    return { ...toQuery(), ...(quick ? quick.patch : {}) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, filterVersion]);

  const acquireAndLoad = useCallback(
    async (refreshingFlag = false) => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          setPermDenied(true);
          return;
        }
        setPermDenied(false);
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        await updateLocation(c.lat, c.lng).catch(() => {});
        await fetchGrid({ ...c, ...query }, refreshingFlag);
        lastRefresh.current = Date.now();
      } catch {
        setPermDenied(true);
      }
    },
    [fetchGrid, query]
  );

  // Hydrate cached grid immediately for instant content / offline support.
  useEffect(() => {
    hydrateCache();
  }, [hydrateCache]);

  // Initial load + reload when the quick filter or applied filters change.
  useEffect(() => {
    acquireAndLoad(false);
  }, [activeFilter, filterVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 3 minutes while focused.
  useFocusEffect(
    useCallback(() => {
      if (coords && Date.now() - lastRefresh.current > REFRESH_MS) {
        fetchGrid({ ...coords, ...query }, true);
        lastRefresh.current = Date.now();
      }
      const id = setInterval(() => {
        if (coords) {
          fetchGrid({ ...coords, ...query }, true);
          lastRefresh.current = Date.now();
        }
      }, REFRESH_MS);
      return () => clearInterval(id);
    }, [coords, query, fetchGrid])
  );

  const openChat = useCallback(
    async (card: UserCard) => {
      if (starting) return;
      setStarting(true);
      try {
        const conv = await startConversation(card.id);
        router.push({ pathname: '/chat/[id]', params: { id: conv.id, peerName: card.firstName ?? '' } });
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 403 && err.code === 'interaction_limit_reached') {
          setUpgradeOpen(true);
        }
      } finally {
        setStarting(false);
      }
    },
    [router, starting]
  );

  const rows = useMemo<UserCard[][]>(() => {
    const out: UserCard[][] = [];
    for (let i = 0; i < cards.length; i += COLS) out.push(cards.slice(i, i + COLS));
    return out;
  }, [cards]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/settings')} style={styles.avatarBtn}>
          <View style={[styles.avatar, { backgroundColor: theme.backgroundTertiary }]} />
          <View style={[styles.avatarDot, { backgroundColor: theme.online, borderColor: theme.background }]} />
        </Pressable>
        <Pressable
          style={[styles.search, { backgroundColor: theme.surfaceElevated }]}
          onPress={() => router.push('/explore')}
        >
          <Ionicons name="search" size={18} color={theme.textTertiary} />
          <Text style={[styles.searchText, { color: theme.textTertiary }]}>Explore people nearby</Text>
        </Pressable>
        <Pressable style={[styles.iconChip, { backgroundColor: theme.surfaceElevated }]} onPress={() => router.push('/filters')}>
          <Ionicons name="options-outline" size={18} color={theme.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.chipsRow}>
        {QUICK_FILTERS.map((q) => {
          const on = activeFilter === q.key;
          return (
            <Pressable
              key={q.key}
              onPress={() => setActiveFilter(on ? null : q.key)}
              style={[
                styles.chip,
                { backgroundColor: on ? theme.brand : theme.backgroundTertiary },
              ]}
            >
              <Text style={[styles.chipText, { color: on ? theme.textInverse : theme.textPrimary }]}>{q.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {permDenied ? (
        <View style={styles.empty}>
          <Ionicons name="location-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Location needed</Text>
          <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
            NearMe shows people around you. Enable location access to start discovering.
          </Text>
          <Pressable style={[styles.retry, { backgroundColor: theme.brand }]} onPress={() => acquireAndLoad(false)}>
            <Text style={[styles.retryText, { color: theme.textInverse }]}>Enable location</Text>
          </Pressable>
        </View>
      ) : loading && cards.length === 0 ? (
        <GridSkeleton cols={COLS} />
      ) : error && cards.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Couldn't load the grid</Text>
          <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>{error}</Text>
          <Pressable style={[styles.retry, { backgroundColor: theme.brand }]} onPress={() => acquireAndLoad(false)}>
            <Text style={[styles.retryText, { color: theme.textInverse }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(_, i) => `row-${i}`}
          getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => coords && fetchGrid({ ...coords, ...query }, true)}
              tintColor={theme.brand}
            />
          }
          onEndReachedThreshold={0.6}
          onEndReached={() => coords && cards.length < total && fetchMore({ ...coords, ...query })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>No one nearby right now.</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={theme.brand} style={{ marginVertical: 16 }} /> : null
          }
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
              {item.map((card) => (
                <UserCardTile
                  key={card.id}
                  card={card}
                  size={tile}
                  onPress={() => openChat(card)}
                  onLongPress={() => router.push({ pathname: '/profile/[id]', params: { id: card.id } })}
                />
              ))}
            </View>
          )}
        />
      )}

      <UpgradeModal visible={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  avatarBtn: { width: 38, height: 38 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarDot: { position: 'absolute', right: 0, bottom: 0, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, height: 40, paddingHorizontal: 16 },
  searchText: { fontSize: 15 },
  iconChip: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 16, height: 34, justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retry: { marginTop: 8, height: 46, borderRadius: 999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 15, fontWeight: '700' },
});
