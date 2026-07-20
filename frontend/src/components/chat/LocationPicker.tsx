import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useTheme, FontFamily, FontSize, spacing, radius } from '../../theme';
import { showInfo, showError } from '../../lib/toast';

type SearchResult = { label: string; lat: number; lng: number };

const LIVE_DURATIONS = ['15 minutes', '1 hour', '8 hours'];
const DEFAULT_REGION: Region = { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 40, longitudeDelta: 40 };

// expo-location's getCurrentPositionAsync can hang indefinitely on a cold GPS
// fix; race it against a timeout so the picker always resolves (with a clear
// error) instead of leaving the "Send Current Location" row spinning forever.
async function getPositionWithTimeout(ms = 10000) {
  return Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Location timed out')), ms),
    ),
  ]);
}

async function labelFor(lat: number, lng: number): Promise<string> {
  try {
    const [p] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return p?.name || p?.street || p?.city || p?.district || p?.region || 'Pinned location';
  } catch {
    return 'Pinned location';
  }
}

/**
 * WhatsApp-style location sheet. Current + Search + Pin-on-Map are live; Live
 * Location is shown but disabled (needs backend streaming — coming soon).
 * `onSendLocation` receives coords + a human label; the parent sends the card.
 */
export function LocationPicker({
  visible,
  onClose,
  onSendLocation,
}: {
  visible: boolean;
  onClose: () => void;
  onSendLocation: (lat: number, lng: number, label: string) => void;
}) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const [mapOpen, setMapOpen] = useState(false);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);

  const reset = () => {
    setLiveOpen(false);
    setSearchOpen(false);
    setQuery('');
    setResults([]);
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const send = (lat: number, lng: number, label: string) => {
    onSendLocation(lat, lng, label);
    close();
  };

  const sendCurrent = async () => {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        showError('Location permission needed');
        setBusy(false);
        return;
      }
      const pos = await getPositionWithTimeout();
      const { latitude, longitude } = pos.coords;
      const label = await labelFor(latitude, longitude);
      send(latitude, longitude, label);
    } catch (e) {
      const timedOut = e instanceof Error && e.message === 'Location timed out';
      showError(timedOut ? 'Location timed out. Try again with a clear sky view.' : 'Could not get your location');
      setBusy(false);
    }
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults([]);
    try {
      const geo = await Location.geocodeAsync(q);
      if (!geo.length) {
        setResults([]);
      } else {
        const top = geo.slice(0, 6);
        const withLabels = await Promise.all(
          top.map(async (g) => ({ label: await labelFor(g.latitude, g.longitude), lat: g.latitude, lng: g.longitude })),
        );
        setResults(withLabels);
      }
    } catch {
      showError('Location search unavailable');
    } finally {
      setSearching(false);
    }
  };

  const openMap = async () => {
    // Center the map on the user's current position if we can get it quickly.
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.granted) {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 });
      }
    } catch {
      /* fall back to default region */
    }
    setMapOpen(true);
  };

  const sendPinned = async () => {
    setBusy(true);
    const label = await labelFor(region.latitude, region.longitude);
    setMapOpen(false);
    send(region.latitude, region.longitude, label);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={close}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Text style={[styles.title, { color: theme.textPrimary }]}>Share Location</Text>

          {/* Search field (expands inline) */}
          {searchOpen ? (
            <View style={{ marginBottom: spacing.sm }}>
              <View style={[styles.searchWrap, { backgroundColor: theme.inputBackground }]}>
                <Ionicons name="search" size={18} color={theme.textTertiary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={runSearch}
                  returnKeyType="search"
                  autoFocus
                  placeholder="Search a place or address"
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.searchInput, { color: theme.textPrimary }]}
                />
                {searching ? <ActivityIndicator size="small" color={theme.brand} /> : null}
              </View>
              <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                {results.map((r, i) => (
                  <Pressable key={`${r.lat}-${i}`} style={styles.resultRow} onPress={() => send(r.lat, r.lng, r.label)}>
                    <Ionicons name="location-outline" size={20} color={theme.brand} />
                    <Text style={[styles.resultText, { color: theme.textPrimary }]} numberOfLines={1}>{r.label}</Text>
                  </Pressable>
                ))}
                {!searching && query.trim() && results.length === 0 ? (
                  <Text style={[styles.emptyText, { color: theme.textTertiary }]}>No matching places</Text>
                ) : null}
              </ScrollView>
            </View>
          ) : null}

          {/* Current location */}
          <Row icon="navigate" iconColor={theme.success} label="Send Current Location" onPress={sendCurrent} busy={busy} theme={theme} />

          {/* Search */}
          <Row
            icon="search"
            iconColor={theme.brand}
            label="Search Location"
            onPress={() => setSearchOpen((v) => !v)}
            theme={theme}
          />

          {/* Pin on map */}
          <Row icon="pin" iconColor={theme.brandSecondary} label="Pin on Map" onPress={openMap} theme={theme} />

          {/* Live location (coming soon) */}
          <Pressable style={styles.row} onPress={() => setLiveOpen((v) => !v)}>
            <View style={[styles.iconCircle, { backgroundColor: theme.info + '22' }]}>
              <Ionicons name="radio" size={20} color={theme.info} />
            </View>
            <Text style={[styles.rowLabel, { color: theme.textPrimary, flex: 1 }]}>Share Live Location</Text>
            <View style={[styles.soonPill, { backgroundColor: theme.surfaceElevated }]}>
              <Text style={[styles.soonText, { color: theme.textTertiary }]}>Coming soon</Text>
            </View>
          </Pressable>
          {liveOpen ? (
            <View style={styles.liveDurations}>
              {LIVE_DURATIONS.map((d) => (
                <Pressable
                  key={d}
                  style={[styles.durationChip, { borderColor: theme.border, opacity: 0.5 }]}
                  onPress={() => showInfo('Live location coming soon')}
                >
                  <Text style={[styles.durationText, { color: theme.textSecondary }]}>{d}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Pressable>

      {/* Pin-on-map picker */}
      <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
          <View style={[styles.mapHeader, { borderBottomColor: theme.border }]}>
            <Pressable onPress={() => setMapOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={26} color={theme.textPrimary} />
            </Pressable>
            <Text style={[styles.mapTitle, { color: theme.textPrimary }]}>Move the map to place the pin</Text>
          </View>
          <View style={{ flex: 1 }}>
            <MapView
              style={{ flex: 1 }}
              initialRegion={region}
              onRegionChangeComplete={setRegion}
            />
            {/* Fixed center pin overlay */}
            <View pointerEvents="none" style={styles.centerPin}>
              <Ionicons name="location" size={40} color={theme.brand} />
            </View>
          </View>
          <View style={styles.mapFooter}>
            <Pressable onPress={sendPinned} disabled={busy}>
              <LinearGradient colors={theme.gradientWarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mapSendBtn}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.mapSendText}>Send This Location</Text>}
              </LinearGradient>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </Modal>
  );
}

function Row({
  icon,
  iconColor,
  label,
  onPress,
  busy,
  theme,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  label: string;
  onPress: () => void;
  busy?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme: any;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={busy}>
      <View style={[styles.iconCircle, { backgroundColor: iconColor + '22' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: theme.textPrimary, flex: 1 }]}>{label}</Text>
      {busy ? <ActivityIndicator size="small" color={theme.brand} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: spacing.xxxl, paddingHorizontal: spacing.lg },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: spacing.md },
  title: { fontSize: 18, fontFamily: FontFamily.bold, marginTop: spacing.lg, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: FontSize.md, fontFamily: FontFamily.medium },
  soonPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  soonText: { fontSize: 11, fontFamily: FontFamily.semibold },
  liveDurations: { flexDirection: 'row', gap: 8, paddingLeft: 52, paddingBottom: spacing.sm },
  durationChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  durationText: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, borderRadius: radius.lg, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.regular },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 4 },
  resultText: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.regular },
  emptyText: { textAlign: 'center', paddingVertical: 16, fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  mapHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  mapTitle: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  centerPin: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  mapFooter: { padding: spacing.lg },
  mapSendBtn: { height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  mapSendText: { color: '#fff', fontSize: FontSize.md, fontFamily: FontFamily.bold },
});
