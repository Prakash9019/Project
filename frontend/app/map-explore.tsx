import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Keyboard,
  FlatList,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useTheme, FontFamily, DisplayFont } from '../src/theme';
import { useGridStore } from '../src/store/gridStore';
import { useFilterStore } from '../src/store/filterStore';
import { showError } from '../src/lib/toast';
import { getSocket } from '../src/services/socket';
import { UserCardTile } from '../src/components/UserCardTile';
import { GridSkeleton } from '../src/components/Skeleton';
import { ProfileMarker } from '../src/components/map/ProfileMarker';
import { ProfilePreviewCard } from '../src/components/map/ProfilePreviewCard';
import {
  approximateMarkerPosition,
  parseDistanceLabelToMeters,
  distanceBetween,
  clusterSizeTier,
  type LatLng,
} from '../src/utils/mapUtils';
import type { UserCard } from '../src/types/api';

// react-native-maps + clustering both need a native build; guard the requires
// so `expo export --platform web` still bundles (same pattern used elsewhere
// for agora/payments services).
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;
let ClusteredMapView: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
} catch {
  /* native module unavailable (e.g. web / Expo Go) */
}
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ClusteredMapView = require('react-native-map-clustering').default;
} catch {
  /* optional clustering lib unavailable — fall back to plain MapView */
}

type Coord = { latitude: number; longitude: number };
type ExploreMode = 'map' | 'grid';

const DEFAULT: Coord = { latitude: 12.9716, longitude: 77.5946 }; // Bengaluru fallback
const MAX_MARKERS = 200;
const SEARCH_AREA_THRESHOLD_M = 5_000;
const PAN_DEBOUNCE_MS = 500;
const SOCKET_REFRESH_DEBOUNCE_MS = 30_000;

export default function MapExplore() {
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const gridTile = (width - 12 * 2 - 6 * 2) / 3;
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const setExploreLocation = useGridStore((s) => s.setExploreLocation);
  const { cards, loading, refreshing, loadingMore, total, fetchGrid, fetchMore } = useGridStore();

  const filterVersion = useFilterStore((s) => s.version);
  const toQuery = useFilterStore((s) => s.toQuery);
  const hydrateFilters = useFilterStore((s) => s.hydrate);

  useEffect(() => {
    hydrateFilters();
  }, [hydrateFilters]);

  const mapRef = useRef<any>(null);
  const [pin, setPin] = useState<Coord | null>(null);
  const [userLoc, setUserLoc] = useState<Coord | null>(null);
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<ExploreMode>('map');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showSearchArea, setShowSearchArea] = useState(false);
  // react-native-maps only re-snapshots a marker's view into a bitmap while
  // tracksViewChanges is true. Profile photos load asynchronously, so a marker
  // must keep tracking until its image has actually loaded (or failed) —
  // otherwise it freezes as a blank circle forever.
  const [settledMarkerIds, setSettledMarkerIds] = useState<Set<string>>(new Set());
  const onMarkerImageSettledRef = useRef(new Map<string, () => void>());
  const onMarkerImageSettled = useCallback((id: string) => {
    let fn = onMarkerImageSettledRef.current.get(id);
    if (!fn) {
      fn = () => setSettledMarkerIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      onMarkerImageSettledRef.current.set(id, fn);
    }
    return fn;
  }, []);

  const fetchCenter = useRef<Coord | null>(null);
  const panTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRegionCenter = useRef<Coord | null>(null);

  const query = useMemo(() => toQuery(), [filterVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const reverseLabel = async (c: Coord): Promise<string> => {
    try {
      const [r] = await Location.reverseGeocodeAsync({ latitude: c.latitude, longitude: c.longitude });
      if (r) return [r.city ?? r.subregion, r.region].filter(Boolean).join(', ') || 'Selected location';
    } catch {
      /* ignore */
    }
    return 'Selected location';
  };

  useEffect(() => {
    (async () => {
      let start = DEFAULT;
      if (params.lat && params.lng) {
        start = { latitude: Number(params.lat), longitude: Number(params.lng) };
      } else {
        try {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (perm.granted) {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            start = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          }
        } catch {
          /* fall back to default */
        }
      }
      setUserLoc(start);
      setPin(start);
      setLabel(await reverseLabel(start));
      setReady(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const loadForPin = useCallback(
    (c: Coord, refreshingFlag = false) => {
      fetchCenter.current = c;
      setShowSearchArea(false);
      fetchGrid({ lat: c.latitude, lng: c.longitude, ...query }, refreshingFlag);
    },
    [fetchGrid, query],
  );

  // Load (and reload on filter change) once the pin is ready.
  useEffect(() => {
    if (ready && pin) loadForPin(pin, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filterVersion]);

  // Live updates (Part 6c): a location:update socket event triggers a silent,
  // debounced background refresh — never used to place exact markers.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onLocationUpdate = () => {
      if (socketRefreshTimer.current) clearTimeout(socketRefreshTimer.current);
      socketRefreshTimer.current = setTimeout(() => {
        if (fetchCenter.current) loadForPin(fetchCenter.current, true);
      }, SOCKET_REFRESH_DEBOUNCE_MS);
    };
    socket.on('location:update', onLocationUpdate);
    return () => {
      socket.off('location:update', onLocationUpdate);
      if (socketRefreshTimer.current) clearTimeout(socketRefreshTimer.current);
    };
  }, [loadForPin]);

  const animateTo = (c: Coord) => {
    mapRef.current?.animateToRegion?.({ ...c, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 400);
  };

  const onSearch = async () => {
    const q = search.trim();
    if (!q) return;
    Keyboard.dismiss();
    setBusy(true);
    try {
      const results = await Location.geocodeAsync(q);
      if (!results.length) { showError('No location found for that search'); return; }
      const c = { latitude: results[0].latitude, longitude: results[0].longitude };
      setPin(c);
      animateTo(c);
      setLabel(q);
      loadForPin(c, false);
    } catch {
      showError('Could not search that location');
    } finally {
      setBusy(false);
    }
  };

  const recenter = async () => {
    if (!userLoc) return;
    setPin(userLoc);
    animateTo(userLoc);
    setLabel(await reverseLabel(userLoc));
    loadForPin(userLoc, false);
  };

  const onDragEnd = async (c: Coord) => {
    setPin(c);
    setLabel(await reverseLabel(c));
    loadForPin(c, false);
  };

  const viewProfiles = () => {
    if (!pin) return;
    setExploreLocation({ lat: pin.latitude, lng: pin.longitude, label });
    router.back();
  };

  // Debounced pan handling: show "Search this area" once the map center has
  // drifted more than 5km from where we last fetched (Part 6a).
  const onRegionChangeComplete = useCallback((region: any) => {
    pendingRegionCenter.current = { latitude: region.latitude, longitude: region.longitude };
    if (panTimer.current) clearTimeout(panTimer.current);
    panTimer.current = setTimeout(() => {
      const center = pendingRegionCenter.current;
      if (!center || !fetchCenter.current) return;
      const driftM = distanceBetween(
        { lat: fetchCenter.current.latitude, lng: fetchCenter.current.longitude },
        { lat: center.latitude, lng: center.longitude },
      );
      setShowSearchArea(driftM > SEARCH_AREA_THRESHOLD_M);
    }, PAN_DEBOUNCE_MS);
  }, []);

  const searchThisArea = () => {
    const center = pendingRegionCenter.current;
    if (!center) return;
    setPin(center);
    loadForPin(center, false);
  };

  // Markers: derive a privacy-safe approximate position from distanceLabel +
  // a deterministic per-user bearing. Cards with no usable distance (privacy
  // opt-outs producing null, or candidates found only via the DB fallback
  // pass with hasLocation=false) are skipped rather than placed at a fake 0m.
  const markerCards = useMemo(() => {
    if (!pin) return [] as { card: UserCard; position: LatLng }[];
    const withPositions = cards
      .filter((c) => c.hasLocation !== false)
      .map((c) => {
        const meters = parseDistanceLabelToMeters(c.distanceLabel ?? c.distance);
        if (meters == null) return null;
        return {
          card: c,
          meters,
          position: approximateMarkerPosition(pin.latitude, pin.longitude, meters, c.id),
        };
      })
      .filter((x): x is { card: UserCard; meters: number; position: LatLng } => x !== null)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, MAX_MARKERS);
    return withPositions.map(({ card, position }) => ({ card, position }));
  }, [cards, pin]);

  const selectedCard = useMemo(
    () => (selectedCardId ? cards.find((c) => c.id === selectedCardId) ?? null : null),
    [selectedCardId, cards],
  );

  const rows = useMemo<UserCard[][]>(() => {
    const out: UserCard[][] = [];
    for (let i = 0; i < cards.length; i += 3) out.push(cards.slice(i, i + 3));
    return out;
  }, [cards]);

  const MapComponent = ClusteredMapView ?? MapView;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {mode === 'map' ? (
        MapView && ready && pin ? (
          <MapComponent
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={{ ...pin, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
            onRegionChangeComplete={onRegionChangeComplete}
            clusterColor={`${theme.brand}CC`}
            clusterTextColor="#fff"
            clusterFontFamily={DisplayFont.bold}
            renderCluster={(cluster: any) => {
              const count = cluster.properties?.point_count ?? 0;
              const tier = clusterSizeTier(count);
              const size = tier === 'small' ? 40 : tier === 'medium' ? 50 : 60;
              const fontSize = tier === 'small' ? 15 : tier === 'medium' ? 17 : 20;
              return (
                <Marker
                  key={`cluster-${cluster.id}`}
                  coordinate={{
                    latitude: cluster.geometry.coordinates[1],
                    longitude: cluster.geometry.coordinates[0],
                  }}
                  onPress={cluster.onPress}
                  tracksViewChanges={false}
                >
                  <View
                    style={[
                      styles.clusterBubble,
                      { width: size, height: size, borderRadius: size / 2, backgroundColor: `${theme.brand}CC` },
                    ]}
                  >
                    <Text style={[styles.clusterText, { fontSize }]}>{count}</Text>
                  </View>
                </Marker>
              );
            }}
          >
            <Marker coordinate={pin} draggable onDragEnd={(e: any) => onDragEnd(e.nativeEvent.coordinate)} />
            {markerCards.map(({ card, position }) => (
              <Marker
                key={card.id}
                coordinate={{ latitude: position.lat, longitude: position.lng }}
                tracksViewChanges={!settledMarkerIds.has(card.id)}
                onPress={() => setSelectedCardId(card.id)}
              >
                <ProfileMarker user={card} onImageSettled={onMarkerImageSettled(card.id)} />
              </Marker>
            ))}
          </MapComponent>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            {ready ? (
              <>
                <Ionicons name="map-outline" size={48} color={theme.textTertiary} />
                <Text style={[styles.fallback, { color: theme.textSecondary }]}>
                  Map preview needs a device build. Location tools still work.
                </Text>
              </>
            ) : (
              <ActivityIndicator color={theme.brand} />
            )}
          </View>
        )
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]}>
          {loading && cards.length === 0 ? (
            <GridSkeleton cols={3} />
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(_, i) => `row-${i}`}
              contentContainerStyle={{ paddingTop: 110, paddingHorizontal: 12, paddingBottom: 24, gap: 6 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => pin && loadForPin(pin, true)} tintColor={theme.brand} />
              }
              onEndReachedThreshold={0.6}
              onEndReached={() => pin && cards.length < total && fetchMore({ lat: pin.latitude, lng: pin.longitude, ...query })}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>No one nearby right now.</Text>
                </View>
              }
              ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.brand} style={{ marginVertical: 16 }} /> : null}
              renderItem={({ item }) => (
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                  {item.map((card) => (
                    <UserCardTile
                      key={card.id}
                      card={card}
                      size={gridTile}
                      onPress={() => router.push({ pathname: '/profile/[id]', params: { id: card.id } })}
                    />
                  ))}
                </View>
              )}
            />
          )}
        </View>
      )}

      <KeyboardAvoidingView
        style={StyleSheet.absoluteFill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <Pressable style={[styles.closeBtn, { backgroundColor: theme.overlay }]} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>

          <View style={[styles.modeToggle, { backgroundColor: theme.overlay }]}>
            {(['map', 'grid'] as const).map((m) => {
              const active = mode === m;
              return (
                <Pressable key={m} onPress={() => setMode(m)} style={styles.modePill}>
                  {active ? (
                    <LinearGradient colors={theme.gradientWarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modePillInner}>
                      <Text style={[styles.modeText, { color: '#fff' }]}>{m === 'map' ? 'Map' : 'Grid'}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.modePillInner}>
                      <Text style={[styles.modeText, { color: '#fff' }]}>{m === 'map' ? 'Map' : 'Grid'}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={{ width: 44 }} />
        </View>

        <View style={{ flex: 1 }} pointerEvents="box-none" />

        {mode === 'map' && showSearchArea && (
          <Pressable style={[styles.searchAreaBtn, { backgroundColor: theme.surface }]} onPress={searchThisArea}>
            <Ionicons name="refresh" size={16} color={theme.brand} />
            <Text style={[styles.searchAreaText, { color: theme.textPrimary }]}>Search this area</Text>
          </Pressable>
        )}

        {mode === 'map' && (
          <View style={styles.bottom} pointerEvents="box-none">
            <View style={styles.searchRow}>
              <Pressable style={[styles.recenter, { backgroundColor: theme.surface }]} onPress={recenter} hitSlop={8}>
                <Ionicons name="locate-outline" size={22} color={theme.textPrimary} />
              </Pressable>
              <View style={[styles.searchBar, { backgroundColor: theme.surface }]}>
                <Ionicons name="search" size={18} color={theme.textTertiary} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={onSearch}
                  placeholder={label || 'Search a location'}
                  placeholderTextColor={theme.textTertiary}
                  returnKeyType="search"
                  style={[styles.searchInput, { color: theme.textPrimary }]}
                />
                {busy && <ActivityIndicator color={theme.brand} />}
              </View>
            </View>

            <Pressable onPress={viewProfiles} disabled={!pin} style={styles.viewBtn}>
              <LinearGradient colors={theme.gradientWarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.viewInner}>
                <Text style={[styles.viewText, { color: theme.textInverse }]}>View Profiles</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
      </KeyboardAvoidingView>

      {mode === 'map' && selectedCard && (
        <ProfilePreviewCard card={selectedCard} onDismiss={() => setSelectedCardId(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  fallback: { fontSize: 14, fontFamily: FontFamily.regular, textAlign: 'center' },
  overlay: { flex: 1, paddingHorizontal: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  modeToggle: { flexDirection: 'row', borderRadius: 999, padding: 3, gap: 2 },
  modePill: { borderRadius: 999, overflow: 'hidden' },
  modePillInner: { height: 32, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  modeText: { fontSize: 13, fontFamily: FontFamily.bold, fontWeight: '700' },
  bottom: { gap: 8, paddingBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recenter: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 26, paddingHorizontal: 18, elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  searchInput: { flex: 1, fontSize: 16, fontFamily: FontFamily.medium },
  viewBtn: { borderRadius: 999, overflow: 'hidden' },
  viewInner: { height: 56, alignItems: 'center', justifyContent: 'center' },
  viewText: { fontSize: 17, fontFamily: DisplayFont.bold, fontWeight: '700' },
  searchAreaBtn: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16, height: 38, marginBottom: 12, elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  searchAreaText: { fontSize: 13, fontFamily: FontFamily.bold, fontWeight: '700' },
  clusterBubble: { alignItems: 'center', justifyContent: 'center' },
  clusterText: { color: '#fff', fontFamily: DisplayFont.bold, fontWeight: '700' },
  empty: { padding: 32, alignItems: 'center', justifyContent: 'center' },
  emptyBody: { fontSize: 14, fontFamily: FontFamily.regular, textAlign: 'center', lineHeight: 20 },
});
