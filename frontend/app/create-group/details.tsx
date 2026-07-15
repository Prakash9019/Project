import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Avatar } from '../../src/components/Avatar';
import { useTheme, FontFamily, DisplayFont, FontSize, spacing, radius } from '../../src/theme';
import { createRoom, addRoomMembersBulk, updateRoomPhoto } from '../../src/services/api';
import { uploadToR2 } from '../../src/utils/uploadToR2';
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

export default function CreateGroupDetails() {
  const { theme } = useTheme();
  const router = useRouter();
  const selected = useCreateGroupStore((s) => s.selected);
  const clearSelection = useCreateGroupStore((s) => s.clear);
  const setSelectedStore = useCreateGroupStore((s) => s.setSelected);
  const addRoomToStore = useGroupsStore((s) => s.addRoom);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RoomCategory | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const canCreate = name.trim().length > 0 && category != null && !creating;

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

  const removeMember = (id: string, firstName: string | null) => {
    Alert.alert('Remove member?', `Remove ${firstName ?? 'this person'} from the group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setSelectedStore(selected.filter((u) => u.id !== id)),
      },
    ]);
  };

  const handleCreate = async () => {
    if (!canCreate || !category) return;
    setCreating(true);
    try {
      // 1. Create the room (creator becomes an admin member server-side).
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
          // Non-fatal: the group still exists without a cover.
        }
      }

      // 3. Add/invite the selected members.
      if (selected.length) {
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
      }

      // 4. Reflect immediately in My Groups.
      const joinedCard: JoinedRoomCard = { ...room, isJoined: true, unreadCount: 0, role: room.myRole ?? 'admin' };
      addRoomToStore(joinedCard);
      clearSelection();
      showSuccess('Group created!');

      // 5. Open the new group (drop the create-group screens from the stack).
      try {
        router.dismissAll();
      } catch {
        /* no-op if nothing to dismiss */
      }
      router.push(`/rooms/${room.id}` as Href);
    } catch (e) {
      toastApiError(e, 'Could not create group');
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>New Group</Text>
        <Pressable onPress={handleCreate} disabled={!canCreate} hitSlop={8}>
          {creating ? (
            <ActivityIndicator color={theme.brand} />
          ) : (
            <Text style={[styles.createBtn, { color: canCreate ? theme.brand : theme.textTertiary }]}>Create</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} keyboardShouldPersistTaps="handled">
        {/* Group photo */}
        <View style={styles.photoWrap}>
          <Pressable onPress={pickPhoto}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
            ) : (
              <View style={[styles.photo, { backgroundColor: theme.surfaceElevated, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="camera" size={26} color={theme.textTertiary} />
              </View>
            )}
            <View style={[styles.photoBadge, { backgroundColor: theme.brand, borderColor: theme.background }]}>
              <Ionicons name={photoUri ? 'pencil' : 'add'} size={14} color="#fff" />
            </View>
          </Pressable>
        </View>

        {/* Name */}
        <View style={styles.field}>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={100}
            placeholder="Group Name"
            placeholderTextColor={theme.textTertiary}
            style={[styles.nameInput, { color: theme.textPrimary, borderBottomColor: theme.border }]}
          />
          <Text style={[styles.counter, { color: theme.textTertiary }]}>{name.length}/100</Text>
        </View>

        {/* Category */}
        <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORIES.map((c) => {
            const meta = categoryMeta(theme, c);
            const active = category === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
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

        {/* Description */}
        <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Description (optional)</Text>
        <View style={styles.field}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={500}
            placeholder="What's this group about?"
            placeholderTextColor={theme.textTertiary}
            style={[styles.descInput, { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          />
          <Text style={[styles.counter, { color: theme.textTertiary }]}>{description.length}/500</Text>
        </View>

        {/* Selected members */}
        {selected.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>Members ({selected.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberStrip}>
              {selected.map((u) => (
                <Pressable key={u.id} style={styles.memberItem} onPress={() => removeMember(u.id, u.firstName)}>
                  <View>
                    <Avatar uri={u.profilePhoto} size={54} />
                    <View style={[styles.memberRemove, { backgroundColor: theme.textSecondary, borderColor: theme.background }]}>
                      <Ionicons name="close" size={12} color={theme.background} />
                    </View>
                  </View>
                  <Text style={[styles.memberName, { color: theme.textSecondary }]} numberOfLines={1}>
                    {u.firstName ?? 'User'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* Primary CTA (mirrors the header Create button for reachability) */}
        <Pressable onPress={handleCreate} disabled={!canCreate} style={{ marginHorizontal: spacing.xl, marginTop: spacing.xl }}>
          <LinearGradient
            colors={canCreate ? theme.gradientWarm : [theme.surfaceElevated, theme.surfaceElevated]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cta}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.ctaText, { color: canCreate ? '#fff' : theme.textTertiary }]}>Create Group</Text>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
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
  createBtn: { fontSize: FontSize.md, fontFamily: FontFamily.bold, minWidth: 52, textAlign: 'right' },

  photoWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  photo: { width: 88, height: 88, borderRadius: 44 },
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

  field: { paddingHorizontal: spacing.xl },
  nameInput: { fontSize: 18, fontFamily: DisplayFont.medium, borderBottomWidth: 1, paddingVertical: spacing.sm },
  descInput: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  counter: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, alignSelf: 'flex-end', marginTop: 4 },

  sectionLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
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

  memberStrip: { gap: spacing.md, paddingHorizontal: spacing.xl },
  memberItem: { alignItems: 'center', width: 58, gap: 4 },
  memberRemove: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  memberName: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, maxWidth: 58 },

  cta: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
});
