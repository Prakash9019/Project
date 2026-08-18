import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme, FontFamily, DisplayFont } from '../src/theme';
import { useFilterStore, type Filters, type AdvancedFilters } from '../src/store/filterStore';
import { useAuthStore } from '../src/store/authStore';
import { UpgradeModal } from '../src/components/UpgradeModal';
import { RangeSlider } from '../src/components/RangeSlider';
import { AnimatedSwitch } from '../src/components/ui/AnimatedSwitch';
import { planAtLeast, labelize } from '../src/lib/format';
import type {
  BodyType,
  Gender,
  RelationshipIntent,
  LookingForOption,
  Plan,
} from '../src/types/api';

/* ── Option catalogs (enums + small frontend catalogs for non-enum fields) ── */
const BODY_TYPES: BodyType[] = ['slim', 'athletic', 'average', 'curvy', 'heavyset', 'prefer_not_to_say'];
const GENDERS: Gender[] = ['male', 'female', 'nonbinary', 'other'];
const INTENTS: RelationshipIntent[] = ['dating', 'friendship', 'networking', 'open_to_anything'];
const LOOKING_FOR: LookingForOption[] = ['fwb', 'one_night', 'long_term', 'short_term', 'casual', 'friendship'];
const TRIBES = ['Twink', 'Bear', 'Jock', 'Otter', 'Daddy', 'Geek', 'Trans', 'Clean-cut', 'Rugged'];

const ADV: { key: keyof AdvancedFilters; label: string; options: string[] }[] = [
  { key: 'education', label: 'Education', options: ['High school', 'Bachelors', 'Masters', 'PhD'] },
  { key: 'occupation', label: 'Occupation', options: ['Student', 'Engineer', 'Artist', 'Healthcare', 'Business'] },
  { key: 'language', label: 'Language', options: ['English', 'Hindi', 'Spanish', 'French', 'Arabic'] },
  { key: 'religion', label: 'Religion', options: ['Hindu', 'Muslim', 'Christian', 'Buddhist', 'Atheist', 'Other'] },
  { key: 'drinking', label: 'Drinking', options: ['Never', 'Socially', 'Often'] },
  { key: 'smoking', label: 'Smoking', options: ['Never', 'Socially', 'Often'] },
  { key: 'relationshipGoal', label: 'Relationship goal', options: ['Casual', 'Relationship', 'Marriage', 'Friends'] },
];

interface GatedToggle {
  key: keyof Filters;
  label: string;
  plan: Plan;
}
const ACTIVITY: GatedToggle[] = [
  { key: 'activeLast30Min', label: 'Active in last 30 min', plan: 'premium' },
  { key: 'activeLast5Min', label: 'Active in last 5 min', plan: 'gold' },
  { key: 'recentlyJoined', label: 'Recently joined', plan: 'gold' },
  { key: 'highReplyRate', label: 'High reply rate', plan: 'gold' },
];

const AGE_MIN = 18, AGE_MAX = 99;
const HT_MIN = 140, HT_MAX = 220;

/**
 * A self-contained slider + live label. It keeps the dragging value in its OWN
 * local state so a drag only re-renders this row — not the whole Filters screen
 * (which is what made every slider feel laggy and "refresh" the others). The
 * parent's heavier state is updated once, on release, via onCommit.
 */
function SliderRow({
  label,
  min,
  max,
  step,
  initial,
  formatValue,
  onCommit,
  topGap,
  hint,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  initial: number[];
  formatValue: (v: number[]) => string;
  onCommit: (v: number[]) => void;
  topGap?: number;
  hint?: string;
}) {
  const { theme } = useTheme();
  const [vals, setVals] = useState(initial);
  return (
    <>
      <View style={[styles.rowBetween, topGap ? { marginTop: topGap } : null]}>
        <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{formatValue(vals)}</Text>
      </View>
      <RangeSlider min={min} max={max} step={step} values={vals} onChange={setVals} onSlidingComplete={onCommit} />
      {hint ? <Text style={[styles.hint, { color: theme.textTertiary }]}>{hint}</Text> : null}
    </>
  );
}

export default function Filters() {
  const router = useRouter();
  const { theme } = useTheme();
  const stored = useFilterStore((s) => s.filters);
  const apply = useFilterStore((s) => s.apply);
  const resetStore = useFilterStore((s) => s.reset);
  const plan = useAuthStore((s) => s.user?.plan ?? 'free');

  const isPremium = planAtLeast(plan, 'premium');
  const isGold = planAtLeast(plan, 'gold');
  const maxRadiusKm = isGold ? 100 : 25;

  const [upgradeFor, setUpgradeFor] = useState<Plan | null>(null);

  // Local UI state seeded from the persisted filters.
  const [radiusKm, setRadiusKm] = useState(stored.radius ? stored.radius / 1000 : maxRadiusKm);
  const [age, setAge] = useState<number[]>([stored.ageMin ?? AGE_MIN, stored.ageMax ?? AGE_MAX]);
  const [height, setHeight] = useState<number[]>([stored.heightMin ?? HT_MIN, stored.heightMax ?? HT_MAX]);
  const [sort, setSort] = useState<'distance' | 'fresh'>(stored.sort ?? 'distance');
  const [bodyType, setBodyType] = useState<string[]>(stored.bodyType ?? []);
  const [gender, setGender] = useState<string[]>(stored.gender ?? []);
  const [intent, setIntent] = useState<string[]>(stored.relationshipIntent ?? []);
  const [lookingFor, setLookingFor] = useState<string[]>(stored.lookingFor ?? []);
  const [tribes, setTribes] = useState<string[]>(stored.tribes ?? []);
  const [onlineOnly, setOnlineOnly] = useState(!!stored.onlineOnly);
  const [verifiedOnly, setVerifiedOnly] = useState(!!stored.verifiedOnly);
  const [activity, setActivity] = useState<Record<string, boolean>>({
    activeLast5Min: !!stored.activeLast5Min,
    activeLast30Min: !!stored.activeLast30Min,
    recentlyJoined: !!stored.recentlyJoined,
    highReplyRate: !!stored.highReplyRate,
  });
  const [advanced, setAdvanced] = useState<AdvancedFilters>(stored.advancedFilters ?? {});

  const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const onApply = () => {
    const f: Filters = {
      onlineOnly: onlineOnly || undefined,
      sort: sort !== 'distance' ? sort : undefined,
      radius: radiusKm < maxRadiusKm ? Math.round(radiusKm * 1000) : undefined,
      ageMin: age[0] > AGE_MIN ? age[0] : undefined,
      ageMax: age[1] < AGE_MAX ? age[1] : undefined,
      heightMin: height[0] > HT_MIN ? height[0] : undefined,
      heightMax: height[1] < HT_MAX ? height[1] : undefined,
      bodyType: bodyType.length ? bodyType : undefined,
      gender: gender.length ? gender : undefined,
      relationshipIntent: intent.length ? intent : undefined,
      lookingFor: lookingFor.length ? lookingFor : undefined,
      tribes: tribes.length ? tribes : undefined,
      verifiedOnly: isPremium && verifiedOnly ? true : undefined,
      activeLast30Min: isPremium && activity.activeLast30Min ? true : undefined,
      activeLast5Min: isGold && activity.activeLast5Min ? true : undefined,
      recentlyJoined: isGold && activity.recentlyJoined ? true : undefined,
      highReplyRate: isGold && activity.highReplyRate ? true : undefined,
      advancedFilters: isPremium && Object.values(advanced).some((v) => v?.length) ? advanced : undefined,
    };
    apply(f);
    router.back();
  };

  const onReset = () => {
    resetStore();
    router.back();
  };

  /* ── reusable pieces ── */
  const Section = ({ title, locked, children }: { title: string; locked?: boolean; children: React.ReactNode }) => (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{title}</Text>
        {locked && (
          <Pressable style={styles.lock} onPress={() => setUpgradeFor('premium')}>
            <Ionicons name="lock-closed" size={13} color={theme.brand} />
            <Text style={[styles.lockText, { color: theme.brand }]}>Premium</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );

  const Chips = ({ options, selected, onToggle, format = labelize }: { options: string[]; selected: string[]; onToggle: (v: string) => void; format?: (s: string) => string }) => (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <Pressable
            key={o}
            onPress={() => onToggle(o)}
            style={[styles.chip, { backgroundColor: on ? theme.brand : theme.surfaceElevated }]}
          >
            <Text style={{ color: on ? theme.textInverse : theme.textPrimary, fontWeight: '600' }}>{format(o)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const ToggleRow = ({ label, value, onToggle, locked, requiredPlan }: { label: string; value: boolean; onToggle: () => void; locked?: boolean; requiredPlan?: Plan }) => (
    <Pressable
      style={styles.toggleRow}
      onPress={() => (locked ? setUpgradeFor(requiredPlan ?? 'premium') : onToggle())}
    >
      <Text style={[styles.toggleLabel, { color: locked ? theme.textTertiary : theme.textPrimary }]}>{label}</Text>
      {locked ? (
        <View style={styles.lock}>
          <Ionicons name="lock-closed" size={14} color={theme.brand} />
          <Text style={[styles.lockText, { color: theme.brand }]}>{requiredPlan}</Text>
        </View>
      ) : (
        <AnimatedSwitch value={value} onValueChange={onToggle} size="sm" />
      )}
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Filters</Text>
        <Pressable hitSlop={12} onPress={onReset}>
          <Text style={[styles.reset, { color: theme.brand }]}>Reset</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* BASIC */}
        <Section title="BASIC">
          <SliderRow
            label="Distance"
            min={0.5}
            max={maxRadiusKm}
            step={0.5}
            initial={[radiusKm]}
            formatValue={(v) => (v[0] >= maxRadiusKm ? `${maxRadiusKm}+ km` : `${v[0].toFixed(1)} km`)}
            onCommit={(v) => setRadiusKm(v[0])}
            hint={!isGold ? 'Up to 100 km with Gold+' : undefined}
          />

          <SliderRow
            label="Age range"
            min={AGE_MIN}
            max={AGE_MAX}
            initial={age}
            topGap={22}
            formatValue={(v) => `${v[0]} – ${v[1] >= AGE_MAX ? '99+' : v[1]}`}
            onCommit={setAge}
          />

          <Text style={[styles.subLabel, { color: theme.textPrimary, marginTop: 22 }]}>Sort by</Text>
          <View style={styles.chips}>
            {([['distance', 'Distance'], ['fresh', 'Recently Active']] as const).map(([v, l]) => {
              const on = sort === v;
              return (
                <Pressable key={v} style={[styles.chip, { backgroundColor: on ? theme.brand : theme.surfaceElevated }]} onPress={() => setSort(v)}>
                  <Text style={{ color: on ? theme.textInverse : theme.textPrimary, fontWeight: '600' }}>{l}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* BODY */}
        <Section title="BODY">
          <SliderRow
            label="Height"
            min={HT_MIN}
            max={HT_MAX}
            initial={height}
            formatValue={(v) => `${v[0]} – ${v[1]} cm`}
            onCommit={setHeight}
          />
          <Text style={[styles.subLabel, { color: theme.textPrimary, marginTop: 22 }]}>Body type</Text>
          <Chips options={BODY_TYPES} selected={bodyType} onToggle={(v) => setBodyType((p) => toggleIn(p, v))} />
        </Section>

        {/* IDENTITY */}
        <Section title="IDENTITY">
          <Text style={[styles.subLabel, { color: theme.textPrimary }]}>Gender</Text>
          <Chips options={GENDERS} selected={gender} onToggle={(v) => setGender((p) => toggleIn(p, v))} />
          <Text style={[styles.subLabel, { color: theme.textPrimary, marginTop: 18 }]}>Relationship intent</Text>
          <Chips options={INTENTS} selected={intent} onToggle={(v) => setIntent((p) => toggleIn(p, v))} />
          <Text style={[styles.subLabel, { color: theme.textPrimary, marginTop: 18 }]}>Looking for</Text>
          <Chips options={LOOKING_FOR} selected={lookingFor} onToggle={(v) => setLookingFor((p) => toggleIn(p, v))} />
          <Text style={[styles.subLabel, { color: theme.textPrimary, marginTop: 18 }]}>Tribes</Text>
          <Chips options={TRIBES} selected={tribes} onToggle={(v) => setTribes((p) => toggleIn(p, v))} format={(s) => s} />
        </Section>

        {/* ACTIVITY */}
        <Section title="ACTIVITY">
          <ToggleRow label="Online only" value={onlineOnly} onToggle={() => setOnlineOnly((v) => !v)} />
          {ACTIVITY.map((g) => {
            const locked = !planAtLeast(plan, g.plan);
            return (
              <ToggleRow
                key={String(g.key)}
                label={g.label}
                value={!!activity[g.key as string]}
                onToggle={() => setActivity((a) => ({ ...a, [g.key as string]: !a[g.key as string] }))}
                locked={locked}
                requiredPlan={g.plan}
              />
            );
          })}
        </Section>

        {/* VERIFICATION */}
        <Section title="VERIFICATION">
          <ToggleRow
            label="Verified users only"
            value={verifiedOnly}
            onToggle={() => setVerifiedOnly((v) => !v)}
            locked={!isPremium}
            requiredPlan="premium"
          />
        </Section>

        {/* ADVANCED (Premium+) */}
        <Section title="ADVANCED" locked={!isPremium}>
          {!isPremium ? (
            <Pressable style={[styles.advLocked, { backgroundColor: theme.surfaceElevated }]} onPress={() => setUpgradeFor('premium')}>
              <Ionicons name="lock-closed" size={18} color={theme.brand} />
              <Text style={[styles.advLockedText, { color: theme.textSecondary }]}>
                Education, occupation, language, religion and lifestyle filters require Premium.
              </Text>
            </Pressable>
          ) : (
            ADV.map((a) => (
              <View key={String(a.key)} style={{ marginBottom: 14 }}>
                <Text style={[styles.subLabel, { color: theme.textPrimary }]}>{a.label}</Text>
                <Chips
                  options={a.options}
                  selected={advanced[a.key] ?? []}
                  onToggle={(v) =>
                    setAdvanced((prev) => ({
                      ...prev,
                      [a.key]: toggleIn(prev[a.key] ?? [], v),
                    }))
                  }
                  format={(s) => s}
                />
              </View>
            ))
          )}
        </Section>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Pressable style={[styles.applyBtn, { backgroundColor: theme.brand }]} onPress={onApply}>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 20, fontFamily: DisplayFont.bold, fontWeight: '700' },
  reset: { fontSize: 15, fontFamily: DisplayFont.semibold, fontWeight: '700' },

  section: { marginTop: 24 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontSize: 13, fontFamily: FontFamily.bold, fontWeight: '800', letterSpacing: 0.6 },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  rowLabel: { fontSize: 16, fontFamily: FontFamily.bold, fontWeight: '700' },
  rowValue: { fontSize: 15, fontFamily: FontFamily.semibold, fontWeight: '600' },
  subLabel: { fontSize: 15, fontFamily: FontFamily.bold, fontWeight: '700', marginBottom: 10 },
  hint: { fontSize: 12, fontFamily: FontFamily.regular, marginTop: 8 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  toggleLabel: { fontSize: 16, fontFamily: FontFamily.semibold, fontWeight: '600' },

  lock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { fontSize: 12, fontFamily: FontFamily.bold, fontWeight: '700', textTransform: 'capitalize' },

  advLocked: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 16 },
  advLockedText: { fontSize: 13, fontFamily: FontFamily.regular, flex: 1, lineHeight: 19 },

  footer: { padding: 16, borderTopWidth: 1 },
  applyBtn: { borderRadius: 999, height: 54, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 17, fontFamily: DisplayFont.bold, fontWeight: '700' },
});
