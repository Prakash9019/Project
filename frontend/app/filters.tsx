import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { useFilterStore, Filters as FilterValues } from '../src/store/filterStore';
import { useAuthStore } from '../src/store/authStore';
import { UpgradeModal } from '../src/components/UpgradeModal';
import { planAtLeast, labelize } from '../src/lib/format';
import type { BodyType, Plan } from '../src/types/api';

const BODY_TYPES: BodyType[] = ['slim', 'athletic', 'average', 'curvy', 'heavyset', 'prefer_not_to_say'];

interface GatedToggle {
  key: keyof FilterValues;
  label: string;
  plan: Plan;
}
const GATED: GatedToggle[] = [
  { key: 'verifiedOnly', label: 'Verified users only', plan: 'premium' },
  { key: 'activeLast5Min', label: 'Active in last 5 min', plan: 'gold' },
  { key: 'activeLast30Min', label: 'Active in last 30 min', plan: 'premium' },
  { key: 'highReplyRate', label: 'High reply rate', plan: 'gold' },
  { key: 'recentlyJoined', label: 'Recently joined', plan: 'premium' },
];

export default function Filters() {
  const router = useRouter();
  const { theme } = useTheme();
  const stored = useFilterStore((s) => s.filters);
  const apply = useFilterStore((s) => s.apply);
  const reset = useFilterStore((s) => s.reset);
  const plan = useAuthStore((s) => s.user?.plan ?? 'free');

  const [f, setF] = useState<FilterValues>(stored);
  const [upgradeFor, setUpgradeFor] = useState<Plan | null>(null);

  const set = <K extends keyof FilterValues>(key: K, value: FilterValues[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Filters</Text>
        <Pressable hitSlop={12} onPress={() => { reset(); router.back(); }}>
          <Text style={[styles.reset, { color: theme.brand }]}>Reset</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 22 }}>
        <View style={styles.rowBetween}>
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Online only</Text>
          <Switch
            value={!!f.onlineOnly}
            onValueChange={(v) => set('onlineOnly', v)}
            trackColor={{ true: theme.brand, false: theme.border }}
            thumbColor="#fff"
          />
        </View>

        {/* Sort */}
        <View>
          <Text style={[styles.section, { color: theme.textPrimary }]}>Sort by</Text>
          <View style={styles.chips}>
            {(['distance', 'fresh'] as const).map((s) => {
              const on = (f.sort ?? 'distance') === s;
              return (
                <Pressable
                  key={s}
                  style={[styles.chip, { backgroundColor: on ? theme.brand : theme.surfaceElevated }]}
                  onPress={() => set('sort', s)}
                >
                  <Text style={{ color: on ? theme.textInverse : theme.textPrimary, fontWeight: '600' }}>{labelize(s)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Age range */}
        <View>
          <Text style={[styles.section, { color: theme.textPrimary }]}>Age range</Text>
          <View style={styles.rangeRow}>
            <NumBox theme={theme} value={f.ageMin} placeholder="Min" onChange={(n) => set('ageMin', n)} />
            <Text style={{ color: theme.textTertiary }}>to</Text>
            <NumBox theme={theme} value={f.ageMax} placeholder="Max" onChange={(n) => set('ageMax', n)} />
          </View>
        </View>

        {/* Height range */}
        <View>
          <Text style={[styles.section, { color: theme.textPrimary }]}>Height (cm)</Text>
          <View style={styles.rangeRow}>
            <NumBox theme={theme} value={f.heightMin} placeholder="Min" onChange={(n) => set('heightMin', n)} />
            <Text style={{ color: theme.textTertiary }}>to</Text>
            <NumBox theme={theme} value={f.heightMax} placeholder="Max" onChange={(n) => set('heightMax', n)} />
          </View>
        </View>

        {/* Body type */}
        <View>
          <Text style={[styles.section, { color: theme.textPrimary }]}>Body type</Text>
          <View style={styles.chips}>
            {BODY_TYPES.map((b) => {
              const on = f.bodyType === b;
              return (
                <Pressable
                  key={b}
                  style={[styles.chip, { backgroundColor: on ? theme.brand : theme.surfaceElevated }]}
                  onPress={() => set('bodyType', on ? undefined : b)}
                >
                  <Text style={{ color: on ? theme.textInverse : theme.textPrimary, fontWeight: '600' }}>{labelize(b)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Plan-gated filters */}
        <View>
          <Text style={[styles.section, { color: theme.textPrimary }]}>Premium filters</Text>
          {GATED.map((g) => {
            const locked = !planAtLeast(plan, g.plan);
            return (
              <View key={g.key} style={styles.rowBetween}>
                <Text style={[styles.rowLabel, { color: locked ? theme.textTertiary : theme.textPrimary }]}>{g.label}</Text>
                {locked ? (
                  <Pressable style={styles.lock} onPress={() => setUpgradeFor(g.plan)}>
                    <Ionicons name="lock-closed" size={14} color={theme.brand} />
                    <Text style={[styles.lockText, { color: theme.brand }]}>{g.plan}</Text>
                  </Pressable>
                ) : (
                  <Switch
                    value={!!f[g.key]}
                    onValueChange={(v) => set(g.key, v as never)}
                    trackColor={{ true: theme.brand, false: theme.border }}
                    thumbColor="#fff"
                  />
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.applyBtn, { backgroundColor: theme.brand }]}
          onPress={() => {
            apply(f);
            router.back();
          }}
        >
          <Text style={[styles.applyText, { color: theme.textInverse }]}>Apply</Text>
        </Pressable>
      </View>

      <UpgradeModal
        visible={upgradeFor != null}
        onClose={() => setUpgradeFor(null)}
        title={`${upgradeFor ?? ''} filter`}
        message={`This filter requires the ${upgradeFor ?? ''} plan or above.`}
      />
    </SafeAreaView>
  );
}

function NumBox({
  theme,
  value,
  placeholder,
  onChange,
}: {
  theme: any;
  value?: number;
  placeholder: string;
  onChange: (n: number | undefined) => void;
}) {
  return (
    <TextInput
      value={value != null ? String(value) : ''}
      onChangeText={(t) => {
        const clean = t.replace(/[^0-9]/g, '');
        onChange(clean ? Number(clean) : undefined);
      }}
      placeholder={placeholder}
      placeholderTextColor={theme.textTertiary}
      keyboardType="number-pad"
      style={[styles.numBox, { backgroundColor: theme.inputBackground, color: theme.textPrimary }]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  reset: { fontSize: 15, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  numBox: { flex: 1, height: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, textAlign: 'center' },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  footer: { padding: 20 },
  applyBtn: { borderRadius: 999, height: 52, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 17, fontWeight: '700' },
});
