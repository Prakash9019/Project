import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../src/theme';
import { T } from '../../src/components/ui';
import { updateProfile, uploadProfilePhoto, ApiError } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import type {
  Gender,
  GenderIdentity,
  SexualOrientation,
  WantToSee,
  RelationshipIntent,
} from '../../src/types/api';

const GENDERS: { v: Gender; label: string }[] = [
  { v: 'male', label: 'Male' },
  { v: 'female', label: 'Female' },
  { v: 'nonbinary', label: 'Non-binary' },
  { v: 'other', label: 'Other' },
];
const GENDER_IDENTITIES: GenderIdentity[] = [
  'man',
  'woman',
  'non_binary',
  'trans_man',
  'trans_woman',
  'genderqueer',
  'genderfluid',
  'other',
];
const ORIENTATIONS: SexualOrientation[] = [
  'straight',
  'gay',
  'lesbian',
  'bisexual',
  'queer',
  'pansexual',
  'other',
];
const WANT_TO_SEE: WantToSee[] = ['men', 'women', 'everyone', 'non_binary_people'];
const INTENTS: RelationshipIntent[] = ['dating', 'friendship', 'networking', 'open_to_anything'];

const labelize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Locally-persisted onboarding draft. Saved after every change so progress
 * survives an app close/reopen, and the user resumes from the last step with
 * their previously-entered values pre-filled. Cleared once the profile is saved.
 */
const DRAFT_KEY = 'onboarding_draft_v1';

type Draft = {
  step: number;
  firstName: string;
  age: string;
  gender: Gender | null;
  genderIdentity: GenderIdentity | null;
  orientation: SexualOrientation | null;
  wantToSee: WantToSee[];
  intent: RelationshipIntent | null;
  photoUri: string | null;
};

export default function SetupScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const setUser = useAuthStore((s) => s.setUser);
  const setPrimaryPhoto = useAuthStore((s) => s.setPrimaryPhoto);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [genderIdentity, setGenderIdentity] = useState<GenderIdentity | null>(null);
  const [orientation, setOrientation] = useState<SexualOrientation | null>(null);
  const [wantToSee, setWantToSee] = useState<WantToSee[]>([]);
  const [intent, setIntent] = useState<RelationshipIntent | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // Block draft-saving until the saved draft (if any) has been loaded, so we
  // never overwrite stored progress with the initial empty state on mount.
  const [hydrated, setHydrated] = useState(false);

  const TOTAL = 4;

  // Resume: load any saved draft once on mount and pre-fill every field + step.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!cancelled && raw) {
          const d = JSON.parse(raw) as Partial<Draft>;
          if (typeof d.step === 'number') setStep(Math.min(Math.max(d.step, 0), TOTAL - 1));
          if (d.firstName) setFirstName(d.firstName);
          if (d.age) setAge(d.age);
          if (d.gender) setGender(d.gender);
          if (d.genderIdentity) setGenderIdentity(d.genderIdentity);
          if (d.orientation) setOrientation(d.orientation);
          if (Array.isArray(d.wantToSee)) setWantToSee(d.wantToSee);
          if (d.intent) setIntent(d.intent);
          if (d.photoUri) setPhotoUri(d.photoUri);
        }
      } catch {
        /* corrupt/missing draft — start fresh */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the draft after every change (best-effort; offline-safe — purely local).
  useEffect(() => {
    if (!hydrated) return;
    const draft: Draft = {
      step,
      firstName,
      age,
      gender,
      genderIdentity,
      orientation,
      wantToSee,
      intent,
      photoUri,
    };
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
  }, [hydrated, step, firstName, age, gender, genderIdentity, orientation, wantToSee, intent, photoUri]);

  const canNext = (() => {
    if (step === 0) return firstName.trim().length > 0 && Number(age) >= 18 && !!gender;
    if (step === 1) return !!genderIdentity && wantToSee.length > 0;
    if (step === 2) return !!intent;
    return true;
  })();

  const toggleWantToSee = (w: WantToSee) =>
    setWantToSee((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]));

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets[0]) setPhotoUri(res.assets[0].uri);
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile({
        firstName: firstName.trim(),
        age: Number(age),
        gender: gender ?? undefined,
        genderIdentity: genderIdentity ?? undefined,
        sexualOrientation: orientation ?? undefined,
        wantToSee,
        relationshipIntent: intent ?? undefined,
      });
      setUser(updated);
      if (photoUri) {
        // Real upload: GET signed upload-url → PUT bytes to R2 → POST /me/photos.
        // This persists the photo server-side so it survives restart/relogin
        // (a raw file:// URI would not). Best-effort: don't block finishing.
        try {
          const photo = await uploadProfilePhoto(photoUri);
          if (photo?.url) setPrimaryPhoto(photo.url);
        } catch {
          /* ignore — user can add a photo later from Edit Profile */
        }
      }
      // Onboarding complete — discard the saved draft so it doesn't resurface.
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      router.replace('/(tabs)');
    } catch (e) {
      const err = e as ApiError;
      setError(err.message ?? 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (!canNext) return;
    if (step < TOTAL - 1) setStep(step + 1);
    else finish();
  };

  const Chip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? theme.brand : theme.inputBackground },
      ]}
    >
      <T style={{ color: active ? theme.textInverse : theme.textPrimary, fontWeight: '600' }}>
        {label}
      </T>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        {step > 0 ? (
          <Pressable onPress={() => setStep(step - 1)} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <View style={styles.progress}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                { backgroundColor: i <= step ? theme.brand : theme.border },
              ]}
            />
          ))}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
        {step === 0 && (
          <>
            <T style={[styles.title, { color: theme.textPrimary }]}>Tell us about you</T>
            <T style={[styles.fieldLabel, { color: theme.textSecondary }]}>First name</T>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor={theme.textTertiary}
              style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.textPrimary }]}
            />
            <T style={[styles.fieldLabel, { color: theme.textSecondary }]}>Age</T>
            <TextInput
              value={age}
              onChangeText={(t) => setAge(t.replace(/[^0-9]/g, '').slice(0, 3))}
              placeholder="18+"
              placeholderTextColor={theme.textTertiary}
              keyboardType="number-pad"
              style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.textPrimary }]}
            />
            <T style={[styles.fieldLabel, { color: theme.textSecondary }]}>Gender</T>
            <View style={styles.chips}>
              {GENDERS.map((g) => (
                <Chip key={g.v} label={g.label} active={gender === g.v} onPress={() => setGender(g.v)} />
              ))}
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <T style={[styles.title, { color: theme.textPrimary }]}>Your identity</T>
            <T style={[styles.fieldLabel, { color: theme.textSecondary }]}>Gender identity</T>
            <View style={styles.chips}>
              {GENDER_IDENTITIES.map((g) => (
                <Chip key={g} label={labelize(g)} active={genderIdentity === g} onPress={() => setGenderIdentity(g)} />
              ))}
            </View>
            <T style={[styles.fieldLabel, { color: theme.textSecondary }]}>Sexual orientation</T>
            <View style={styles.chips}>
              {ORIENTATIONS.map((o) => (
                <Chip key={o} label={labelize(o)} active={orientation === o} onPress={() => setOrientation(o)} />
              ))}
            </View>
            <T style={[styles.fieldLabel, { color: theme.textSecondary }]}>Who I want to see</T>
            <View style={styles.chips}>
              {WANT_TO_SEE.map((w) => (
                <Chip key={w} label={labelize(w)} active={wantToSee.includes(w)} onPress={() => toggleWantToSee(w)} />
              ))}
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <T style={[styles.title, { color: theme.textPrimary }]}>What are you here for?</T>
            <View style={styles.chips}>
              {INTENTS.map((it) => (
                <Chip key={it} label={labelize(it)} active={intent === it} onPress={() => setIntent(it)} />
              ))}
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <T style={[styles.title, { color: theme.textPrimary }]}>Add a photo</T>
            <T style={[styles.sub, { color: theme.textSecondary }]}>Optional — you can add this later.</T>
            <Pressable
              style={[styles.photoBox, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}
              onPress={pickPhoto}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
              ) : (
                <>
                  <Ionicons name="camera" size={32} color={theme.textSecondary} />
                  <T style={{ color: theme.textSecondary, marginTop: 8 }}>Tap to choose a photo</T>
                </>
              )}
            </Pressable>
          </>
        )}

        {error && <T style={[styles.error, { color: theme.error }]}>{error}</T>}
      </ScrollView>

      <View style={styles.footer}>
        {step === TOTAL - 1 && (
          <Pressable onPress={finish} disabled={saving} style={styles.skip}>
            <T style={{ color: theme.textSecondary, fontWeight: '600' }}>Skip for now</T>
          </Pressable>
        )}
        <Pressable
          disabled={!canNext || saving}
          onPress={next}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: canNext ? theme.brand : theme.callDisabled, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          {saving ? (
            <ActivityIndicator color={theme.textInverse} />
          ) : (
            <T style={[styles.primaryText, { color: theme.textInverse }]}>
              {step === TOTAL - 1 ? 'Finish' : 'Continue'}
            </T>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  progress: { flexDirection: 'row', gap: 6 },
  progressDot: { width: 28, height: 4, borderRadius: 2 },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  sub: { fontSize: 15, marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  input: { height: 52, borderRadius: 12, paddingHorizontal: 16, fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 16, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 13, marginTop: 16 },
  photoBox: {
    height: 240,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  footer: { padding: 20, gap: 10 },
  skip: { alignItems: 'center', paddingVertical: 6 },
  primary: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 17, fontWeight: '700' },
});
