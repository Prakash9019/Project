import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { useAuthStore } from '../src/store/authStore';
import { UpgradeModal } from '../src/components/UpgradeModal';
import { CustomAlert } from '../src/components/CustomAlert';
import { useAlert } from '../src/hooks/useAlert';
import { planAtLeast } from '../src/lib/format';
import { createCityProfile, activateCityProfile, deleteCityProfile, listCityProfiles, CityProfile, ApiError } from '../src/services/api';
import { toastApiError } from '../src/lib/toast';

/** Explore / Travel mode — browse another city's grid. Gated to Gold+. */
export default function Explore() {
  const router = useRouter();
  const { theme } = useTheme();
  const plan = useAuthStore((s) => s.user?.plan ?? 'free');
  const canTravel = planAtLeast(plan, 'gold');
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const { alertConfig, hideAlert, alertSuccess, alertError, deleteConfirm } = useAlert();

  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [profiles, setProfiles] = useState<CityProfile[]>([]);
  const [loading, setLoading] = useState(canTravel);
  const [busy, setBusy] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(!canTravel);

  useEffect(() => {
    if (!canTravel) return;
    listCityProfiles()
      .then((r) => setProfiles(r.profiles))
      .catch((e) => toastApiError(e, 'Could not load city profiles'))
      .finally(() => setLoading(false));
  }, [canTravel]);

  const addCity = async () => {
    if (!city.trim() || !country.trim() || busy) return;
    setBusy(true);
    try {
      const cp = await createCityProfile(city.trim(), country.trim());
      setProfiles((p) => [cp, ...p.filter((x) => x.id !== cp.id)]);
      setCity('');
      setCountry('');
    } catch (e) {
      alertError('Could not add city', (e as ApiError).message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const activate = async (cp: CityProfile) => {
    try {
      await activateCityProfile(cp.id);
      setProfiles((p) => p.map((x) => ({ ...x, isActive: x.id === cp.id })));
      // Refresh the cached user so `me.travelModeActive` flips to true — Browse
      // reads this flag to stop pushing real GPS updates, which would otherwise
      // silently auto-deactivate travel mode on the very next location sync.
      refreshUser();
      // Navigate to the grid once the user acknowledges — same destination as before,
      // just after the confirmation is seen (an in-screen dialog can't outlive navigation).
      alertSuccess(
        'Travel mode on',
        `You're now visible in ${cp.cityName} with a "Visiting Soon" badge.`,
        () => router.push('/(tabs)'),
      );
    } catch (e) {
      alertError('Could not activate', (e as ApiError).message ?? 'Try again.');
    }
  };

  const remove = (cp: CityProfile) => {
    deleteConfirm(cp.cityName, async () => {
      try {
        await deleteCityProfile(cp.id);
        setProfiles((p) => p.filter((x) => x.id !== cp.id));
        if (cp.isActive) refreshUser();
      } catch (e) {
        alertError('Could not remove city', (e as ApiError).message ?? 'Try again.');
      }
    });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Travel</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.intro}>
        <Ionicons name="airplane" size={28} color={theme.brand} />
        <Text style={[styles.introTitle, { color: theme.textPrimary }]}>Explore another city</Text>
        <Text style={[styles.introBody, { color: theme.textSecondary }]}>
          Set up a city profile to browse and chat before you arrive. You'll appear with a
          “Visiting Soon” badge so locals know you're on your way.
        </Text>
      </View>

      {!canTravel ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={40} color={theme.brand} />
          <Text style={[styles.lockedTitle, { color: theme.textPrimary }]}>Travel is a Gold feature</Text>
          <Pressable style={[styles.cta, { backgroundColor: theme.brand }]} onPress={() => router.push('/(tabs)/store')}>
            <Text style={[styles.ctaText, { color: theme.textInverse }]}>Upgrade to Gold</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.searchRow}>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor={theme.textTertiary}
              style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.textPrimary }]}
            />
            <TextInput
              value={country}
              onChangeText={setCountry}
              placeholder="Country"
              placeholderTextColor={theme.textTertiary}
              style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.textPrimary }]}
              onSubmitEditing={addCity}
            />
            <Pressable style={[styles.addBtn, { backgroundColor: theme.brand }]} onPress={addCity} disabled={busy}>
              {busy ? <ActivityIndicator size="small" color={theme.textInverse} /> : <Ionicons name="add" size={22} color={theme.textInverse} />}
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
          ) : (
            <FlatList
              data={profiles}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              ListEmptyComponent={<Text style={[styles.introBody, { color: theme.textTertiary, paddingHorizontal: 16 }]}>No city profiles yet.</Text>}
              renderItem={({ item }) => (
                <View style={[styles.cityRow, { backgroundColor: theme.surface }]}>
                  <Ionicons name="location" size={20} color={theme.brand} />
                  <Text style={[styles.cityName, { color: theme.textPrimary }]}>{item.cityName}</Text>
                  {item.isActive ? (
                    <View style={styles.activeTag}>
                      <Text style={[styles.activeText, { color: theme.success }]}>Active</Text>
                    </View>
                  ) : (
                    <Pressable style={[styles.activateBtn, { borderColor: theme.brand }]} onPress={() => activate(item)}>
                      <Text style={[styles.activateText, { color: theme.brand }]}>Activate</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => remove(item)} hitSlop={10}>
                    <Ionicons name="trash-outline" size={18} color={theme.textTertiary} />
                  </Pressable>
                </View>
              )}
            />
          )}
        </>
      )}

      <UpgradeModal
        visible={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Travel mode"
        message="Travel mode lets you browse other cities. Available on Gold and above."
      />

      {alertConfig ? <CustomAlert visible onDismiss={hideAlert} {...alertConfig} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  intro: { alignItems: 'center', gap: 6, padding: 20 },
  introTitle: { fontSize: 20, fontWeight: '800' },
  introBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  lockedTitle: { fontSize: 18, fontWeight: '700' },
  cta: { height: 48, borderRadius: 999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 15, fontWeight: '700' },
  searchRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, alignItems: 'center' },
  input: { flex: 1, height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 16 },
  addBtn: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 16 },
  cityName: { fontSize: 16, fontWeight: '600', flex: 1 },
  activeTag: {},
  activeText: { fontSize: 13, fontWeight: '700' },
  activateBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, height: 34, alignItems: 'center', justifyContent: 'center' },
  activateText: { fontSize: 13, fontWeight: '700' },
});
