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
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { useGridStore } from '../../src/store/gridStore';
import { useFilterStore } from '../../src/store/filterStore';
import { useAuthStore } from '../../src/store/authStore';
import { useInterestStore } from '../../src/store/interestStore';
import { Avatar } from '../../src/components/Avatar';
import { ProfileSidebar } from '../../src/components/ProfileSidebar';
import { UserCardTile } from '../../src/components/UserCardTile';
import { GridSkeleton } from '../../src/components/Skeleton';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import { ViewsList } from '../../src/components/interest/ViewsList';
import { TapsList } from '../../src/components/interest/TapsList';
import { planAtLeast } from '../../src/lib/format';
import { markInterestSeen, hasUnreadInterest } from '../../src/utils/interestUnread';
import { updateLocation, getSpotlight, GridQuery } from '../../src/services/api';
import { showError } from '../../src/lib/toast';
import type { UserCard } from '../../src/types/api';

const COLS = 3;
const GAP = 6;
const PAD = 12;
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
  const tile = (width - PAD * 2 - GAP * (COLS - 1)) / COLS;
  const rowHeight = tile + GAP;

  const { cards, loading, refreshing, loadingMore, error, total, fetchGrid, fetchMore, hydrateCache } = useGridStore();
  const exploreLocation = useGridStore((s) => s.exploreLocation);
  const clearExploreLocation = useGridStore((s) => s.clearExploreLocation);
  const me = useAuthStore((s) => s.user);
  const plan = me?.plan ?? 'free';
  const canSeeViews = planAtLeast(plan, 'gold');

  const {
    views,
    taps,
    loading: interestLoading,
    refreshing: interestRefreshing,
    error: interestError,
    fetchInterest,
  } = useInterestStore();

  const [coords, setCoords] = useState<Coords | null>(null);
  const [permDenied, setPermDenied] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [interestTab, setInterestTab] = useState<'views' | 'taps'>('views');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [spotlightUsers, setSpotlightUsers] = useState<UserCard[]>([]);
  const lastRefresh = useRef(0);
  const locationSyncWarned = useRef(false);

  const filterVersion = useFilterStore((s) => s.version);
  const toQuery = useFilterStore((s) => s.toQuery);
  const hydrateFilters = useFilterStore((s) => s.hydrate);
  const activeFilterCount = useFilterStore((s) => s.activeCount());

  // Restore persisted filters once on mount.
  useEffect(() => {
    hydrateFilters();
  }, [hydrateFilters]);

  const query = useMemo<Omit<GridQuery, 'lat' | 'lng' | 'limit' | 'offset'>>(() => {
    const quick = QUICK_FILTERS.find((q) => q.key === activeFilter);
    // Merge applied filter-sheet values with the active quick chip.
    return { ...toQuery(), ...(quick ? quick.patch : {}) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, filterVersion]);

  // Pushes our current coords into the server's geo index so other users can
  // discover us. A failure here leaves us invisible in everyone else's grid
  // with no visible symptom on our own screen (our own grid still loads fine
  // from local coords) — so failures must never be swallowed silently.
  const syncLocation = useCallback((lat: number, lng: number) => {
    updateLocation(lat, lng)
      .then(() => { locationSyncWarned.current = false; })
      .catch((e) => {
        console.warn('[grid] updateLocation failed — you will be invisible to others until this succeeds', e);
        if (!locationSyncWarned.current) {
          locationSyncWarned.current = true;
          showError("Couldn't update your location. You may not appear to others nearby.");
        }
      });
  }, []);

  const acquireAndLoad = useCallback(
    async (refreshingFlag = false) => {
      // Exploring a different location: read-only — use its coords, don't update
      // the user's stored location.
      if (exploreLocation) {
        const c = { lat: exploreLocation.lat, lng: exploreLocation.lng };
        setPermDenied(false);
        setCoords(c);
        await fetchGrid({ ...c, ...query }, refreshingFlag);
        lastRefresh.current = Date.now();
        return;
      }
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
        syncLocation(c.lat, c.lng);
        await fetchGrid({ ...c, ...query }, refreshingFlag);
        lastRefresh.current = Date.now();
      } catch {
        setPermDenied(true);
      }
    },
    [fetchGrid, query, exploreLocation, syncLocation]
  );

  // Hydrate cached grid immediately for instant content / offline support.
  useEffect(() => {
    hydrateCache();
  }, [hydrateCache]);

  // Initial load + reload when the quick filter, applied filters, or the
  // explored location change.
  useEffect(() => {
    acquireAndLoad(false);
  }, [activeFilter, filterVersion, exploreLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 3 minutes while focused.
  useFocusEffect(
    useCallback(() => {
      if (coords && Date.now() - lastRefresh.current > REFRESH_MS) {
        fetchGrid({ ...coords, ...query }, true);
        lastRefresh.current = Date.now();
      }
      const id = setInterval(() => {
        if (coords) {
          if (!exploreLocation) syncLocation(coords.lat, coords.lng);
          fetchGrid({ ...coords, ...query }, true);
          lastRefresh.current = Date.now();
        }
      }, REFRESH_MS);
      return () => clearInterval(id);
    }, [coords, query, fetchGrid, exploreLocation, syncLocation])
  );

  // Featured Nearby — active "spotlight" add-on holders near the viewer.
  useEffect(() => {
    if (!coords) return;
    getSpotlight(coords.lat, coords.lng)
      .then((res) => setSpotlightUsers(res.users))
      .catch(() => setSpotlightUsers([]));
  }, [coords]);

  // Keep interest data fresh so the unread indicator is accurate — on mount,
  // when the plan changes, and whenever the Browse screen regains focus.
  useEffect(() => {
    if (me?.id) fetchInterest(canSeeViews, false);
  }, [me?.id, canSeeViews, fetchInterest]);

  useFocusEffect(
    useCallback(() => {
      if (me?.id) fetchInterest(canSeeViews, false);
    }, [me?.id, canSeeViews, fetchInterest])
  );

  // Recompute the unread dot whenever views/taps change.
  useEffect(() => {
    let cancelled = false;
    hasUnreadInterest(views, taps).then((v) => {
      if (!cancelled) setHasUnread(v);
    });
    return () => {
      cancelled = true;
    };
  }, [views, taps]);

  const openInterest = useCallback(() => {
    markInterestSeen();
    setHasUnread(false); // optimistic clear
    setActiveFilter('interest');
  }, []);

  const openProfile = useCallback(
    (card: UserCard) => {
      router.push({ pathname: '/profile/[id]', params: { id: card.id } });
    },
    [router]
  );

  const rows = useMemo<UserCard[][]>(() => {
    const out: UserCard[][] = [];
    for (let i = 0; i < cards.length; i += COLS) out.push(cards.slice(i, i + COLS));
    return out;
  }, [cards]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Avatar
          uri={me?.primaryPhotoUrl}
          size={38}
          online
          onPress={() => setSidebarOpen(true)}
        />
        <Pressable
          style={[styles.search, { backgroundColor: theme.surfaceElevated }]}
          onPress={() => router.push('/map-explore')}
        >
          <Ionicons name="search" size={18} color={theme.textTertiary} />
          <Text style={[styles.searchText, { color: theme.textTertiary }]}>Explore more profiles</Text>
        </Pressable>
        <Pressable
          style={[styles.iconChip, { backgroundColor: theme.surfaceElevated }]}
          onPress={() =>
            router.push({
              pathname: '/map-explore',
              params: coords ? { lat: String(coords.lat), lng: String(coords.lng) } : undefined,
            })
          }
        >
          <Ionicons name="map-outline" size={18} color={theme.textPrimary} />
        </Pressable>
        <Pressable style={[styles.iconChip, { backgroundColor: theme.surfaceElevated }]} onPress={() => router.push('/filters')}>
          <Ionicons name="options-outline" size={18} color={theme.textPrimary} />
          {activeFilterCount > 0 && (
            <View style={[styles.filterBadge, { backgroundColor: theme.brand, borderColor: theme.background }]}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {exploreLocation && (
        <View style={[styles.exploreBanner, { backgroundColor: theme.surfaceElevated }]}>
          <Ionicons name="location" size={16} color={theme.brand} />
          <Text style={[styles.exploreText, { color: theme.textPrimary }]} numberOfLines={1}>
            Showing profiles near {exploreLocation.label}
          </Text>
          <Pressable onPress={clearExploreLocation} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={theme.textTertiary} />
          </Pressable>
        </View>
      )}

      <View style={styles.chipsRow}>
        {QUICK_FILTERS.map((q) => {
          const on = activeFilter === q.key;
          if (on) {
            return (
              <Pressable key={q.key} onPress={() => setActiveFilter(null)}>
                <LinearGradient
                  colors={theme.gradientWarm}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.chip}
                >
                  <Text style={[styles.chipText, { color: '#fff' }]}>{q.label}</Text>
                </LinearGradient>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={q.key}
              onPress={() => setActiveFilter(q.key)}
              style={[styles.chip, { backgroundColor: theme.backgroundTertiary }]}
            >
              <Text style={[styles.chipText, { color: theme.textPrimary }]}>{q.label}</Text>
            </Pressable>
          );
        })}

        {/* Interest filter — swaps the grid for the Views/Taps content inline. */}
        <View style={styles.chipWrap}>
          {activeFilter === 'interest' ? (
            <Pressable onPress={() => setActiveFilter(null)}>
              <LinearGradient
                colors={theme.gradientWarm}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.chip}
              >
                <Text style={[styles.chipText, { color: '#fff' }]}>Interest</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable onPress={openInterest} style={[styles.chip, { backgroundColor: theme.backgroundTertiary }]}>
              <Text style={[styles.chipText, { color: theme.textPrimary }]}>Interest</Text>
            </Pressable>
          )}
          {hasUnread && <View style={[styles.interestDot, { backgroundColor: theme.brand }]} pointerEvents="none" />}
        </View>
      </View>

      {activeFilter === 'interest' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.interestTabs}>
            {(['views', 'taps'] as const).map((t) => {
              const active = interestTab === t;
              const label = t === 'views' ? 'Views' : 'Taps';
              const count = t === 'views' ? (canSeeViews ? views.length : 0) : taps.length;
              return (
                <Pressable key={t} style={styles.interestTabBtn} onPress={() => setInterestTab(t)}>
                  <Text style={[styles.interestTabText, { color: active ? theme.textPrimary : theme.textTertiary }]}>
                    {label}{count ? ` ${count}` : ''}
                  </Text>
                  {active && <View style={[styles.interestTabUnderline, { backgroundColor: theme.textPrimary }]} />}
                </Pressable>
              );
            })}
          </View>
          {interestTab === 'views' ? (
            <ViewsList
              views={views}
              loading={interestLoading}
              refreshing={interestRefreshing}
              error={interestError}
              canSeeViews={canSeeViews}
              onRefresh={() => fetchInterest(canSeeViews, true)}
              onUpgrade={() => setUpgradeOpen(true)}
            />
          ) : (
            <TapsList
              taps={taps}
              loading={interestLoading}
              refreshing={interestRefreshing}
              error={interestError}
              onRefresh={() => fetchInterest(canSeeViews, true)}
              onLimitReached={() => setUpgradeOpen(true)}
            />
          )}
        </View>
      ) : permDenied ? (
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
          ListHeaderComponent={
            spotlightUsers.length > 0 ? (
              <View style={styles.spotlightSection}>
                <Text style={[styles.spotlightTitle, { color: theme.textPrimary }]}>Featured Nearby</Text>
                <FlatList
                  data={spotlightUsers}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(c) => c.id}
                  contentContainerStyle={{ paddingHorizontal: PAD, gap: GAP }}
                  renderItem={({ item }) => (
                    <View style={{ width: tile }}>
                      <UserCardTile card={item} size={tile} onPress={() => openProfile(item)} />
                      <View style={[styles.featuredBadge, { backgroundColor: theme.brand }]}>
                        <Ionicons name="star" size={10} color="#fff" />
                        <Text style={styles.featuredBadgeText}>Featured</Text>
                      </View>
                    </View>
                  )}
                />
              </View>
            ) : null
          }
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
            <View style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP, paddingHorizontal: PAD }}>
              {item.map((card) => (
                <UserCardTile
                  key={card.id}
                  card={card}
                  size={tile}
                  onPress={() => openProfile(card)}
                />
              ))}
            </View>
          )}
        />
      )}

      <UpgradeModal
        visible={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="See who's into you"
        message="Upgrade to Gold to see everyone who viewed your profile."
      />

      <ProfileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
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
  searchText: { fontSize: 15, fontFamily: FontFamily.regular },
  iconChip: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  filterBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterBadgeText: { color: '#fff', fontSize: 10, fontFamily: FontFamily.heavy, fontWeight: '800' },
  exploreBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 14, height: 40, borderRadius: 999 },
  exploreText: { flex: 1, fontSize: 14, fontFamily: FontFamily.semibold, fontWeight: '600' },
  chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  chipWrap: { position: 'relative' },
  chip: { borderRadius: 999, paddingHorizontal: 18, height: 36, justifyContent: 'center', alignItems: 'center' },
  chipText: { fontSize: 14, fontFamily: FontFamily.semibold, fontWeight: '600' },
  interestDot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4 },
  interestTabs: { flexDirection: 'row', marginBottom: 2 },
  interestTabBtn: { flex: 1, alignItems: 'center', paddingBottom: 10 },
  interestTabText: { fontSize: 16, fontFamily: FontFamily.semibold, fontWeight: '600', paddingTop: 4 },
  interestTabUnderline: { height: 2, width: '70%', marginTop: 8, borderRadius: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 19, fontFamily: DisplayFont.bold, fontWeight: '700' },
  emptyBody: { fontSize: 14, fontFamily: FontFamily.regular, textAlign: 'center', lineHeight: 20 },
  retry: { marginTop: 8, height: 46, borderRadius: 999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 15, fontFamily: DisplayFont.bold, fontWeight: '700' },
  spotlightSection: { marginBottom: 12 },
  spotlightTitle: { fontSize: 15, fontFamily: DisplayFont.bold, fontWeight: '700', paddingHorizontal: PAD, marginBottom: 8 },
  featuredBadge: { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  featuredBadgeText: { color: '#fff', fontSize: 10, fontFamily: FontFamily.bold, fontWeight: '700' },
});
