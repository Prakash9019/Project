import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../src/theme';
import { CustomAlert } from '../../src/components/CustomAlert';
import { useAlert } from '../../src/hooks/useAlert';
import { FormSection, FieldLabel, TextField, ChipSelect } from '../../src/components/form';
import { useAuthStore } from '../../src/store/authStore';
import {
  updateProfile,
  uploadProfilePhoto,
  getPrompts,
  createPrompt,
  deletePrompt as apiDeletePrompt,
  uploadVoiceClip,
  uploadVideoClip,
  ApiError,
  UpdateProfileBody,
  ProfilePromptDTO,
} from '../../src/services/api';
import { planAtLeast } from '../../src/lib/format';
import type {
  Gender,
  GenderIdentity,
  SexualOrientation,
  WantToSee,
  RelationshipIntent,
  BodyType,
  SkinTone,
  RelationshipStatus,
  LookingForOption,
  WhereWeCanMeet,
  DatingIntention,
} from '../../src/types/api';

const GENDERS: Gender[] = ['male', 'female', 'nonbinary', 'other'];
const GENDER_IDENTITIES: GenderIdentity[] = ['man', 'woman', 'non_binary', 'trans_man', 'trans_woman', 'genderqueer', 'genderfluid', 'other'];
const ORIENTATIONS: SexualOrientation[] = ['straight', 'gay', 'lesbian', 'bisexual', 'queer', 'pansexual', 'other'];
const WANT_TO_SEE: WantToSee[] = ['men', 'women', 'everyone', 'non_binary_people'];
const INTENTS: RelationshipIntent[] = ['dating', 'friendship', 'networking', 'open_to_anything'];
const BODY_TYPES: BodyType[] = ['slim', 'athletic', 'average', 'curvy', 'heavyset', 'prefer_not_to_say'];
const SKIN_TONES: SkinTone[] = ['very_fair', 'fair', 'medium', 'olive', 'brown', 'dark', 'prefer_not_to_say'];
const REL_STATUS: RelationshipStatus[] = ['single', 'committed', 'open_relationship', 'prefer_not_to_say'];
const LOOKING_FOR: LookingForOption[] = ['fwb', 'one_night', 'long_term', 'short_term', 'casual', 'friendship'];
const WHERE_MEET: WhereWeCanMeet[] = ['my_place', 'your_place', 'restaurant', 'cafe', 'hotel', 'outdoors', 'virtual'];
const DATING_INTENTIONS: DatingIntention[] = ['casual_dates', 'intimacy_no_commitment', 'life_partner', 'ethical_non_monogamy', 'marriage', 'friendship', 'virtual_dating'];

function bioLimit(plan: string): number {
  if (plan === 'premium') return 400;
  if (plan === 'gold' || plan === 'platinum') return 600;
  return 150;
}

export default function EditProfile() {
  const router = useRouter();
  const { theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setPrimaryPhotoStore = useAuthStore((s) => s.setPrimaryPhoto);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const plan = user?.plan ?? 'free';
  const canClips = planAtLeast(plan, 'premium');
  const { alertConfig, hideAlert, showAlert, alertSuccess, alertError } = useAlert();

  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [primaryPhoto, setPrimaryPhoto] = useState<string | null>(null);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [aboutMe, setAboutMe] = useState('');
  const [whereFrom, setWhereFrom] = useState('');
  const [gender, setGender] = useState<Gender[]>([]);
  const [genderIdentity, setGenderIdentity] = useState<GenderIdentity[]>([]);
  const [orientation, setOrientation] = useState<SexualOrientation[]>([]);
  const [wantToSee, setWantToSee] = useState<WantToSee[]>([]);
  const [intent, setIntent] = useState<RelationshipIntent[]>([]);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bodyType, setBodyType] = useState<BodyType[]>([]);
  const [skinTone, setSkinTone] = useState<SkinTone[]>([]);
  const [relStatus, setRelStatus] = useState<RelationshipStatus[]>([]);
  const [lookingFor, setLookingFor] = useState<LookingForOption[]>([]);
  const [whereMeet, setWhereMeet] = useState<WhereWeCanMeet[]>([]);
  const [datingIntentions, setDatingIntentions] = useState<DatingIntention[]>([]);
  const [tribes, setTribes] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [fantasyTags, setFantasyTags] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<ProfilePromptDTO[]>([]);

  useEffect(() => {
    if (!user) {
      refreshUser();
      return;
    }
    setPrimaryPhoto(user.primaryPhotoUrl?.trim() || null);
    setFirstName(user.firstName ?? '');
    setAge(user.age ? String(user.age) : '');
    setBio(user.bio ?? '');
    setAboutMe(user.aboutMe ?? '');
    setWhereFrom(user.whereAreYouFrom ?? '');
    setGender(user.gender ? [user.gender] : []);
    setGenderIdentity(user.genderIdentity ? [user.genderIdentity] : []);
    setOrientation(user.sexualOrientation ? [user.sexualOrientation] : []);
    setWantToSee(user.wantToSee ?? []);
    setIntent(user.relationshipIntent ? [user.relationshipIntent] : []);
    setHeight(user.height ? String(user.height) : '');
    setWeight(user.weight ? String(user.weight) : '');
    setBodyType(user.bodyType ? [user.bodyType] : []);
    setSkinTone(user.skinTone ? [user.skinTone] : []);
    setRelStatus(user.relationshipStatus ? [user.relationshipStatus] : []);
    setLookingFor((user.lookingFor as LookingForOption[]) ?? []);
    setWhereMeet(user.whereWeCanMeet ?? []);
    setDatingIntentions(user.datingIntentions ?? []);
    setTribes(user.tribes ?? []);
    setInterests(user.interests ?? []);
    setFantasyTags(user.fantasyTags ?? []);
    setTags(user.tags ?? []);
  }, [user, refreshUser]);

  useEffect(() => {
    getPrompts()
      .then((r) => setPrompts(r.prompts))
      .catch(() => setPrompts([]));
  }, []);

  const pickPrimary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      alertError('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets[0]) return;
    const uri = res.assets[0].uri;
    setPrimaryPhoto(uri); // optimistic preview
    setUploadingPhoto(true);
    try {
      const photo = await uploadProfilePhoto(uri);
      const finalUrl = photo.url || uri;
      setPrimaryPhoto(finalUrl);
      setPrimaryPhotoStore(finalUrl); // reflect in grid header / settings immediately
    } catch {
      alertError('Photo Upload Failed', 'Could not upload photo right now. Please try a different photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const pickClip = async (kind: 'voice' | 'video') => {
    if (!canClips) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'video' ? ['videos'] : ['videos'],
      quality: 0.7,
    });
    if (res.canceled || !res.assets[0]) return;
    try {
      if (kind === 'video') await uploadVideoClip(res.assets[0].uri);
      else await uploadVoiceClip(res.assets[0].uri);
      alertSuccess('Uploaded', `Your ${kind} intro was uploaded.`);
    } catch {
      alertError('Upload failed', 'Please try again later.');
    }
  };

  const addPromptRow = () => {
    showAlert({
      title: 'Add prompt',
      message: 'Prompt editing uses a question catalog. Pick from the profile screen.',
      icon: 'information-circle',
      iconColor: theme.info,
      buttons: [{ label: 'OK', style: 'default', onPress: hideAlert }],
    });
  };
  const removePrompt = async (id: string) => {
    setPrompts((p) => p.filter((x) => x.id !== id));
    apiDeletePrompt(id).catch(() => {});
  };

  const save = async () => {
    setSaving(true);
    const body: UpdateProfileBody = {
      firstName: firstName.trim() || undefined,
      age: age ? Number(age) : undefined,
      bio: bio.trim() || undefined,
      aboutMe: aboutMe.trim() || undefined,
      whereAreYouFrom: whereFrom.trim() || undefined,
      gender: gender[0],
      genderIdentity: genderIdentity[0],
      sexualOrientation: orientation[0],
      wantToSee,
      relationshipIntent: intent[0],
      height: height ? Number(height) : undefined,
      weight: weight ? Number(weight) : undefined,
      bodyType: bodyType[0],
      skinTone: skinTone[0],
      relationshipStatus: relStatus[0],
      lookingFor,
      whereWeCanMeet: whereMeet,
      datingIntentions,
      tribes,
      interests,
      fantasyTags,
      tags,
    };
    try {
      const updated = await updateProfile(body);
      setUser(updated);
      router.back();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 422) alertError('Check your details', err.message ?? 'Some fields are invalid.');
      else alertError('Could not save', err.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const TagInput = ({ values, onChange, max, placeholder }: { values: string[]; onChange: (v: string[]) => void; max?: number; placeholder: string }) => {
    const [draft, setDraft] = useState('');
    const add = () => {
      const v = draft.trim();
      if (!v || values.includes(v) || (max && values.length >= max)) return;
      onChange([...values, v]);
      setDraft('');
    };
    return (
      <View>
        <View style={styles.tagInputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            placeholder={placeholder}
            placeholderTextColor={theme.textTertiary}
            style={[styles.input, { flex: 1, backgroundColor: theme.inputBackground, color: theme.textPrimary }]}
          />
          <Pressable style={[styles.addBtn, { backgroundColor: theme.brand }]} onPress={add}>
            <Ionicons name="add" size={22} color={theme.textInverse} />
          </Pressable>
        </View>
        <View style={styles.tagWrap}>
          {values.map((v) => (
            <Pressable key={v} style={[styles.tagChip, { backgroundColor: theme.surfaceElevated }]} onPress={() => onChange(values.filter((x) => x !== v))}>
              <Text style={{ color: theme.textPrimary }}>{v}</Text>
              <Ionicons name="close" size={14} color={theme.textSecondary} />
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Edit Profile</Text>
        <Pressable onPress={save} disabled={saving} hitSlop={12}>
          {saving ? <ActivityIndicator color={theme.brand} /> : <Text style={[styles.done, { color: theme.brand }]}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <FormSection title="PHOTO">
          <Pressable style={[styles.photoBox, { backgroundColor: theme.inputBackground, borderColor: theme.border }]} onPress={pickPrimary} disabled={uploadingPhoto}>
            {primaryPhoto ? (
              <Image source={{ uri: primaryPhoto }} style={styles.photo} contentFit="cover" transition={120} cachePolicy="memory-disk" />
            ) : (
              <>
                <Ionicons name="person" size={64} color={theme.textTertiary} />
                <Text style={{ color: theme.textSecondary, marginTop: 8 }}>Set profile photo</Text>
              </>
            )}
            {uploadingPhoto && (
              <View style={styles.photoOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            {primaryPhoto && !uploadingPhoto && (
              <View style={[styles.photoEdit, { backgroundColor: theme.brand }]}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            )}
          </Pressable>
        </FormSection>

        <FormSection title="BASICS">
          <FieldLabel text="First name" />
          <TextField value={firstName} onChangeText={setFirstName} placeholder="First name" />
          <FieldLabel text="Age" />
          <TextField value={age} onChangeText={(t) => setAge(t.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="Age" />
          <FieldLabel text="Bio" hint={`${bio.length}/${bioLimit(plan)}`} />
          <TextField value={bio} onChangeText={(t) => setBio(t.slice(0, bioLimit(plan)))} multiline placeholder="A short bio" maxLength={bioLimit(plan)} />
          <FieldLabel text="About me" hint={`${aboutMe.length}/500`} />
          <TextField value={aboutMe} onChangeText={(t) => setAboutMe(t.slice(0, 500))} multiline placeholder="More about you" maxLength={500} />
          <FieldLabel text="Where are you from" />
          <TextField value={whereFrom} onChangeText={setWhereFrom} placeholder="City / country" />
        </FormSection>

        <FormSection title="IDENTITY">
          <FieldLabel text="Gender" />
          <ChipSelect options={GENDERS} selected={gender} onChange={setGender} />
          <FieldLabel text="Gender identity" />
          <ChipSelect options={GENDER_IDENTITIES} selected={genderIdentity} onChange={setGenderIdentity} />
          <FieldLabel text="Sexual orientation" />
          <ChipSelect options={ORIENTATIONS} selected={orientation} onChange={setOrientation} />
          <FieldLabel text="Who I want to see" />
          <ChipSelect options={WANT_TO_SEE} selected={wantToSee} onChange={setWantToSee} multi />
          <FieldLabel text="Relationship intent" />
          <ChipSelect options={INTENTS} selected={intent} onChange={setIntent} />
        </FormSection>

        <FormSection title="BODY">
          <FieldLabel text="Height (cm)" />
          <TextField value={height} onChangeText={(t) => setHeight(t.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="cm" />
          <FieldLabel text="Weight (kg)" />
          <TextField value={weight} onChangeText={(t) => setWeight(t.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="kg" />
          <FieldLabel text="Body type" />
          <ChipSelect options={BODY_TYPES} selected={bodyType} onChange={setBodyType} />
          <FieldLabel text="Skin tone" />
          <ChipSelect options={SKIN_TONES} selected={skinTone} onChange={setSkinTone} />
        </FormSection>

        <FormSection title="LOOKING FOR">
          <FieldLabel text="Relationship status" />
          <ChipSelect options={REL_STATUS} selected={relStatus} onChange={setRelStatus} />
          <FieldLabel text="Looking for" />
          <ChipSelect options={LOOKING_FOR} selected={lookingFor} onChange={setLookingFor} multi />
          <FieldLabel text="Where we can meet" />
          <ChipSelect options={WHERE_MEET} selected={whereMeet} onChange={setWhereMeet} multi />
          <FieldLabel text="Dating intentions" hint="max 2" />
          <ChipSelect options={DATING_INTENTIONS} selected={datingIntentions} onChange={setDatingIntentions} multi max={2} />
        </FormSection>

        <FormSection title="INTERESTS & TAGS">
          <FieldLabel text="Tribes" hint="max 3" />
          <TagInput values={tribes} onChange={setTribes} max={3} placeholder="Add a tribe" />
          <FieldLabel text="Interests" />
          <TagInput values={interests} onChange={setInterests} placeholder="Add an interest" />
          <FieldLabel text="Fantasy tags" />
          <TagInput values={fantasyTags} onChange={setFantasyTags} placeholder="Add a fantasy tag" />
          <FieldLabel text="Tags" hint="max 10" />
          <TagInput values={tags} onChange={setTags} max={10} placeholder="Add a tag" />
        </FormSection>

        <FormSection title="VOICE & VIDEO (PREMIUM+)">
          <Pressable
            style={[styles.clipBtn, { backgroundColor: theme.surfaceElevated, opacity: canClips ? 1 : 0.5 }]}
            onPress={() => (canClips ? pickClip('voice') : router.push('/(tabs)/store'))}
          >
            <Ionicons name="mic" size={20} color={theme.brand} />
            <Text style={[styles.clipText, { color: theme.textPrimary }]}>Add voice intro</Text>
            {!canClips && <Ionicons name="lock-closed" size={14} color={theme.brand} />}
          </Pressable>
          <Pressable
            style={[styles.clipBtn, { backgroundColor: theme.surfaceElevated, opacity: canClips ? 1 : 0.5 }]}
            onPress={() => (canClips ? pickClip('video') : router.push('/(tabs)/store'))}
          >
            <Ionicons name="videocam" size={20} color={theme.brand} />
            <Text style={[styles.clipText, { color: theme.textPrimary }]}>Add video intro</Text>
            {!canClips && <Ionicons name="lock-closed" size={14} color={theme.brand} />}
          </Pressable>
        </FormSection>

        <FormSection title="PROFILE PROMPTS">
          {prompts.map((p) => (
            <View key={p.id} style={[styles.promptCard, { backgroundColor: theme.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.promptQ, { color: theme.textTertiary }]}>{p.question}</Text>
                <Text style={[styles.promptA, { color: theme.textPrimary }]}>{p.answer}</Text>
              </View>
              <Pressable onPress={() => removePrompt(p.id)} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={theme.textTertiary} />
              </Pressable>
            </View>
          ))}
          {prompts.length < 6 && (
            <Pressable style={[styles.clipBtn, { backgroundColor: theme.surfaceElevated }]} onPress={addPromptRow}>
              <Ionicons name="add" size={20} color={theme.brand} />
              <Text style={[styles.clipText, { color: theme.textPrimary }]}>Add a prompt</Text>
            </Pressable>
          )}
        </FormSection>
      </ScrollView>

      {alertConfig ? <CustomAlert visible onDismiss={hideAlert} {...alertConfig} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  done: { fontSize: 16, fontWeight: '700' },
  photoBox: { height: 200, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  photoEdit: { position: 'absolute', right: 12, bottom: 12, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  input: { borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 15 },
  tagInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  clipBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 14, marginTop: 10 },
  clipText: { fontSize: 15, fontWeight: '600', flex: 1 },
  promptCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14, marginBottom: 10 },
  promptQ: { fontSize: 12 },
  promptA: { fontSize: 15, fontWeight: '600', marginTop: 2 },
});
