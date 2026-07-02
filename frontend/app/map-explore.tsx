import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useTheme, FontFamily, DisplayFont } from '../src/theme';
import { useGridStore } from '../src/store/gridStore';
import { showError } from '../src/lib/toast';

// react-native-maps needs a native build; guard the require so `expo export
// --platform web` still bundles (same pattern as agora/payments services).
let MapView: any = null;
let Marker: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
} catch {
  /* native module unavailable (e.g. web / Expo Go) */
}

type Coord = { latitude: number; longitude: number };

const DEFAULT: Coord = { latitude: 12.9716, longitude: 77.5946 }; // Bengaluru fallback

export default function MapExplore() {
  const router = useRouter();
  const { theme } = useTheme();
  const setExploreLocation = useGridStore((s) => s.setExploreLocation);

  const mapRef = useRef<any>(null);
  const [pin, setPin] = useState<Coord | null>(null);
  const [userLoc, setUserLoc] = useState<Coord | null>(null);
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

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
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.granted) {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          start = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        }
      } catch {
        /* fall back to default */
      }
      setUserLoc(start);
      setPin(start);
      setLabel(await reverseLabel(start));
      setReady(true);
    })();
  }, []);

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
  };

  const onDragEnd = async (c: Coord) => {
    setPin(c);
    setLabel(await reverseLabel(c));
  };

  const viewProfiles = () => {
    if (!pin) return;
    setExploreLocation({ lat: pin.latitude, lng: pin.longitude, label });
    router.back();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {MapView && ready && pin ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...pin, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        >
          <Marker coordinate={pin} draggable onDragEnd={(e: any) => onDragEnd(e.nativeEvent.coordinate)} />
        </MapView>
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
      )}

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        {/* Close */}
        <Pressable style={[styles.closeBtn, { backgroundColor: theme.overlay }]} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>

        <View style={{ flex: 1 }} pointerEvents="box-none" />

        {/* Bottom controls */}
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  fallback: { fontSize: 14, fontFamily: FontFamily.regular, textAlign: 'center' },
  overlay: { flex: 1, paddingHorizontal: 16 },
  closeBtn: { position: 'absolute', top: 56, right: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bottom: { gap: 14, paddingBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recenter: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 26, paddingHorizontal: 18, elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  searchInput: { flex: 1, fontSize: 16, fontFamily: FontFamily.medium },
  viewBtn: { borderRadius: 999, overflow: 'hidden' },
  viewInner: { height: 56, alignItems: 'center', justifyContent: 'center' },
  viewText: { fontSize: 17, fontFamily: DisplayFont.bold, fontWeight: '700' },
});
