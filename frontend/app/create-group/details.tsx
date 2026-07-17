import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Avatar } from '../../src/components/Avatar';
import { useTheme, FontFamily, DisplayFont, FontSize, spacing, radius } from '../../src/theme';
import { createRoom, addRoomMembersBulk, updateRoomPhoto } from '../../src/services/api';
import { uploadToR2 } from '../../src/utils/uploadToR2';
import { CustomAlert } from '../../src/components/CustomAlert';
import { useAlert } from '../../src/hooks/useAlert';
import { categoryMeta } from '../../src/lib/rooms';
import { toastApiError, showSuccess } from '../../src/lib/toast';
import { useCreateGroupStore } from '../../src/store/createGroupStore';
import { useGroupsStore } from '../../src/store/groupsStore';
import type { RoomCategory, JoinedRoomCard } from '../../src/types/api';

const CATEGORIES: RoomCategory[] = [
  'city_dating',
  'orientation',
  'age_group',
  'relationship_intent',
  'events',
  'local_meetups',
];

// Short, first-timer-friendly explanation shown when a category is selected.
const CATEGORY_DESC: Record<RoomCategory, string> = {
  city_dating: 'Meet people in your city',
  orientation: 'Connect by orientation',
  age_group: 'Find people in your age group',
  relationship_intent: "Match on what you're looking for",
  events: 'Local events & meetups',
  local_meetups: 'Casual hangouts nearby',
};

type ProgressStep = 'creating' | 'adding' | 'done';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function CreateGroupDetails() {
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const selected = useCreateGroupStore((s) => s.selected);
  const clearSelection = useCreateGroupStore((s) => s.clear);
  const addRoomToStore = useGroupsStore((s) => s.addRoom);
  const { alertConfig, showAlert, hideAlert } = useAlert();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RoomCategory | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<ProgressStep | null>(null);

  // Inline validation (no alert dialogs — inline errors are clearer UX).
  const [nameError, setNameError] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const nameRef = useRef<TextInput>(null);
  const shakeX = useRef(new Animated.Value(0)).current;

  const canCreate = name.trim().length > 0 && category != null && !creating;

  const shakeCategory = () => {
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets[0]) return;
    setPhotoUri(res.assets[0].uri);
  };

  const validate = (): boolean => {
    let ok = true;
    if (!name.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      ok = false;
    }
    if (!category) {
      setCategoryError(true);
      shakeCategory();
      ok = false;
    }
    if (!ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    return ok;
  };

  const handleCreate = async () => {
    if (creating) return;
    if (!validate() || !category) return;
    setCreating(true);
    setProgress('creating');
    try {
      // 1. Create the room (creator becomes an admin member server-side).
      const startedAt = Date.now();
      const { room } = await createRoom({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
      });

      // 2. Upload the cover photo now that we have a roomId, then attach it.
      if (photoUri) {
        try {
          const url = await uploadToR2(photoUri, 'room_image', 'image/jpeg', { roomId: room.id });
          const res = await updateRoomPhoto(room.id, url);
          room.coverImageUrl = res.coverImageUrl;
        } catch {
          // Non-fatal: the group still exists without a cover. Tell the user so
          // they know the photo can be added later from Group Info.
          setTimeout(() => showSuccess('Group created — photo can be added later from Group Info'), 300);
        }
      }
      // Keep the "Creating group…" step visible at least 500ms so it's perceptible.
      await sleep(Math.max(0, 500 - (Date.now() - startedAt)));

      // 3. Add/invite the selected members.
      if (selected.length) {
        setProgress('adding');
        const addStart = Date.now();
        try {
          const res = await addRoomMembersBulk(room.id, selected.map((u) => u.id));
          if (res.invited.length) {
            setTimeout(() => showSuccess(`${res.invited.length} invitation${res.invited.length > 1 ? 's' : ''} sent`), 300);
          }
          if (res.skipped.length) {
            setTimeout(() => showSuccess(`${res.skipped.length} couldn't be added`), 600);
          }
        } catch (e) {
          toastApiError(e, 'Group created, but adding members failed');
        }
        await sleep(Math.max(0, 500 - (Date.now() - addStart)));
      }

      setProgress('done');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // 4. Reflect immediately in My Groups.
      const joinedCard: JoinedRoomCard = { ...room, isJoined: true, unreadCount: 0, role: room.myRole ?? 'admin' };
      addRoomToStore(joinedCard);
      clearSelection();
      showSuccess('Group created! Invite more people from Group Info.');
      await sleep(400);

      // 5. Open the new group (drop the create-group screens from the stack).
      try {
        router.dismissAll();
      } catch {
        /* no-op if nothing to dismiss */
      }
      router.push(`/rooms/${room.id}` as Href);
    } catch (e) {
      setCreating(false);
      setProgress(null);
      const msg = e instanceof Error && e.message ? e.message : 'Please check your connection and try again.';
      showAlert({
        title: "Couldn't Create Group",
        message: msg,
        icon: 'cloud-offline-outline',
        iconColor: theme.error,
        buttons: [
          { label: 'Cancel', style: 'cancel', onPress: hideAlert },
          { label: 'Try Again', style: 'default', onPress: () => { hideAlert(); handleCreate(); } },
        ],
      });
    }
  };

  const nameLen = name.length;
  const descLen = description.length;
  const progressLabel =
    progress === 'creating' ? 'Creating group…' : progress === 'adding' ? 'Adding members…' : 'Done!';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>New Group</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Group photo */}
          <View style={styles.photoWrap}>
            <Pressable onPress={pickPhoto} style={styles.photoTap}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
              ) : (
                <View style={[styles.photo, styles.photoEmpty, { backgroundColor: theme.surfaceElevated }]}>
                  <Ionicons name="camera" size={32} color={theme.textTertiary} />
                </View>
              )}
              <View style={[styles.photoBadge, { backgroundColor: theme.brand, borderColor: theme.background }]}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </Pressable>
            <Text style={[styles.photoLabel, { color: theme.textTertiary }]}>
              {photoUri ? 'Change Photo' : 'Add Photo'}
            </Text>
          </View>

          {/* Name */}
          <View style={styles.field}>
            <Text style={[styles.sectionLabel, styles.inlineLabel, { color: theme.textTertiary }]}>GROUP NAME</Text>
            <TextInput
              ref={nameRef}
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (nameError && t.trim()) setNameError(false);
              }}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              autoFocus
              maxLength={100}
              placeholder="E.g. Hyderabad Coffee Lovers"
              placeholderTextColor={theme.textTertiary}
              style={[
                styles.nameInput,
                { color: theme.textPrimary, borderBottomColor: nameError ? theme.error : nameFocused ? theme.brand : theme.border },
              ]}
            />
            <View style={styles.counterRow}>
              {nameError ? (
                <Text style={[styles.errorText, { color: theme.error }]}>Please enter a group name</Text>
              ) : (
                <View />
              )}
              <Text style={[styles.counter, { color: nameLen > 80 ? theme.error : theme.textTertiary }]}>{nameLen}/100</Text>
            </View>
          </View>

          {/* Category */}
          <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
            <View style={styles.labelRow}>
              <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>CATEGORY</Text>
              <Text style={[styles.required, { color: theme.error }]}> *</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {CATEGORIES.map((c) => {
                const meta = categoryMeta(theme, c);
                const active = category === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      setCategory(c);
                      setCategoryError(false);
                      Haptics.selectionAsync().catch(() => {});
                    }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? meta.color : theme.surfaceElevated,
                        borderColor: active ? meta.color : theme.border,
                      },
                    ]}
                  >
                    <Ionicons name={meta.icon} size={14} color={active ? '#fff' : meta.color} />
                    <Text style={[styles.chipText, { color: active ? '#fff' : theme.textSecondary }]}>{meta.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {categoryError ? (
              <Text style={[styles.errorText, { color: theme.error, paddingHorizontal: spacing.xl, marginTop: spacing.sm }]}>
                Please select a category
              </Text>
            ) : category ? (
              <Text style={[styles.helper, { color: theme.textSecondary }]}>{CATEGORY_DESC[category]}</Text>
            ) : null}
          </Animated.View>

          {/* Description */}
          <View style={styles.labelRow}>
            <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>DESCRIPTION</Text>
            <Text style={[styles.optional, { color: theme.textTertiary }]}> (optional)</Text>
          </View>
          <View style={styles.field}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={500}
              placeholder="Tell people what this group is about…"
              placeholderTextColor={theme.textTertiary}
              style={[styles.descInput, { color: theme.textPrimary, borderBottomColor: theme.border }]}
            />
            <Text style={[styles.counter, { color: theme.textTertiary, alignSelf: 'flex-end', marginTop: 4 }]}>{descLen}/500</Text>
          </View>

          {/* Selected members preview */}
          <View style={styles.labelRow}>
            <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>
              ADDING ({selected.length} {selected.length === 1 ? 'PERSON' : 'PEOPLE'})
            </Text>
            {selected.length > 0 ? (
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={[styles.editLink, { color: theme.brand }]}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          {selected.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberStrip}>
              {selected.map((u) => (
                <View key={u.id} style={styles.memberItem}>
                  <Avatar uri={u.profilePhoto} size={54} />
                  <Text style={[styles.memberName, { color: theme.textSecondary }]} numberOfLines={1}>
                    {u.firstName ?? 'User'}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.noMembers}>
              <Text style={[styles.helper, { color: theme.textTertiary, marginTop: 0, paddingHorizontal: 0 }]}>
                No members selected yet
              </Text>
              <Pressable onPress={() => router.push('/create-group/members' as Href)} hitSlop={8}>
                <Text style={[styles.editLink, { color: theme.brand }]}>Add People</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        {/* Fixed bottom Create button — always visible, never scrolls */}
        <View
          style={[
            styles.bottomBar,
            {
              paddingBottom: insets.bottom + 16,
              backgroundColor: theme.background,
              borderTopColor: theme.border,
            },
          ]}
        >
          <Pressable onPress={handleCreate} disabled={!canCreate}>
            <LinearGradient
              colors={canCreate || creating ? theme.gradientWarm : [theme.surfaceElevated, theme.surfaceElevated]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              {creating ? (
                <View style={styles.progressRow}>
                  {progress === 'done' ? (
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  ) : (
                    <ActivityIndicator color="#fff" />
                  )}
                  <Text style={[styles.ctaText, { color: '#fff' }]}>{progressLabel}</Text>
                </View>
              ) : (
                <Text style={[styles.ctaText, { color: canCreate ? '#fff' : theme.textTertiary }]}>Create Group</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {alertConfig ? <CustomAlert {...alertConfig} onDismiss={hideAlert} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  title: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, flex: 1, textAlign: 'center' },

  photoWrap: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  photoTap: {},
  photo: { width: 96, height: 96, borderRadius: 48 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  photoBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  photoLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },

  field: { paddingHorizontal: spacing.xl },
  inlineLabel: { paddingHorizontal: 0, marginTop: 0 },
  nameInput: { fontSize: 18, fontFamily: DisplayFont.medium, borderBottomWidth: 1.5, paddingVertical: spacing.sm },
  descInput: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    borderBottomWidth: 1.5,
    paddingVertical: spacing.sm,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  counter: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },
  errorText: { fontSize: FontSize.xs, fontFamily: FontFamily.medium },

  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.sm },
  required: { fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  optional: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginRight: 'auto', marginLeft: 4 },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  helper: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, paddingHorizontal: spacing.xl, marginTop: spacing.sm },

  chips: { gap: spacing.sm, paddingHorizontal: spacing.xl },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },

  editLink: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  memberStrip: { gap: spacing.md, paddingHorizontal: spacing.xl },
  memberItem: { alignItems: 'center', width: 58, gap: 4 },
  memberName: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, maxWidth: 58 },
  noMembers: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl },

  bottomBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cta: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ctaText: { fontSize: FontSize.md, fontFamily: DisplayFont.bold },
});
