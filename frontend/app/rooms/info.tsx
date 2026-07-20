import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Switch,
  TextInput,
  Modal,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect, type Href } from 'expo-router';
import { Avatar } from '../../src/components/Avatar';
import { MiniProfile } from '../../src/components/MiniProfile';
import { useTheme, FontFamily, FontSize, DisplayFont, spacing, radius } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useGroupsStore } from '../../src/store/groupsStore';
import {
  getRoom,
  listRoomMembers,
  listRoomMessages,
  muteRoom,
  leaveRoom,
  reportRoom,
  updateRoom,
  removeRoomMember,
  updateRoomMemberRole,
  updateRoomPhoto,
  transferRoomOwnership,
  deleteRoom,
} from '../../src/services/api';
import { uploadToR2 } from '../../src/utils/uploadToR2';
import { CustomAlert, type AlertButton } from '../../src/components/CustomAlert';
import { useAlert } from '../../src/hooks/useAlert';
import { categoryMeta, formatCount } from '../../src/lib/rooms';
import { toastApiError, showSuccess } from '../../src/lib/toast';
import type { RoomDetail, RoomMemberCard, RoomUserCard, RoomMessageCard } from '../../src/types/api';

export default function RoomInfo() {
  const { theme } = useTheme();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const patchGroupInStore = useGroupsStore((s) => s.patchRoom);
  const { alertConfig, showAlert, hideAlert, confirm } = useAlert();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const id = String(roomId);

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [members, setMembers] = useState<RoomMemberCard[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [media, setMedia] = useState<RoomMessageCard[]>([]);
  const [pinnedCount, setPinnedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [miniUser, setMiniUser] = useState<RoomUserCard | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [r, m, msg] = await Promise.all([
        getRoom(id),
        listRoomMembers(id, { limit: 50 }),
        listRoomMessages(id, { limit: 50 }),
      ]);
      setRoom(r.room);
      setMembers(m.members);
      setTotalMembers(m.total);
      setMedia(msg.messages.filter((x) => x.type === 'image' && x.mediaUrl && !x.isDeleted));
      setPinnedCount(msg.messages.filter((x) => x.isPinned && !x.isDeleted).length);
    } catch (e) {
      toastApiError(e, 'Could not load group info');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Reload on focus so returning from the Add Members picker reflects new members.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const myRole = useMemo(
    () => members.find((mm) => mm.user.id === me?.id)?.role ?? 'member',
    [members, me?.id],
  );
  const isCreator = room?.isCreator === true;
  const isAdmin = isCreator || myRole === 'admin';

  // Split members into Creator / Admins / Members sections (WhatsApp-style).
  // Within each section: online first, then alphabetical by first name.
  const memberSections = useMemo(() => {
    const sortSection = (arr: RoomMemberCard[]) =>
      [...arr].sort((a, b) => {
        const ao = a.user.isOnline ? 0 : 1;
        const bo = b.user.isOnline ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return (a.user.firstName ?? '').localeCompare(b.user.firstName ?? '');
      });
    return {
      creators: sortSection(members.filter((m) => m.isCreator)),
      admins: sortSection(members.filter((m) => !m.isCreator && m.role !== 'member')),
      regular: sortSection(members.filter((m) => !m.isCreator && m.role === 'member')),
    };
  }, [members]);

  // Group photo / ownership / delete (admin + creator actions)
  const [photoUploading, setPhotoUploading] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const changePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets[0]) return;
    const localUri = res.assets[0].uri;
    const previousCover = room?.coverImageUrl ?? null;
    setPhotoUploading(true);
    // Optimistic: show the picked image immediately while it uploads.
    setRoom((prev) => (prev ? { ...prev, coverImageUrl: localUri } : prev));
    try {
      const url = await uploadToR2(localUri, 'room_image', 'image/jpeg', { roomId: id });
      const result = await updateRoomPhoto(id, url);
      setRoom((prev) => (prev ? { ...prev, coverImageUrl: result.coverImageUrl } : prev));
      // Keep the My Groups list in sync so its avatar updates without a refetch.
      patchGroupInStore(id, { coverImageUrl: result.coverImageUrl });
    } catch (e) {
      // Restore the previous image on failure so the UI never shows a half-applied state.
      setRoom((prev) => (prev ? { ...prev, coverImageUrl: previousCover } : prev));
      toastApiError(e, 'Could not update group photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  const confirmTransfer = (m: RoomMemberCard) => {
    setTransferOpen(false);
    confirm(
      'Transfer Ownership?',
      `Make ${m.user.firstName ?? 'this member'} the new group creator? You will become an admin.`,
      async () => {
        try {
          await transferRoomOwnership(id, m.user.id);
          // Current user is no longer the creator; refresh room + members.
          setRoom((prev) => (prev ? { ...prev, isCreator: false, myRole: 'admin' } : prev));
          showSuccess(`${m.user.firstName ?? 'Member'} is now the group creator`);
          load();
        } catch (e) {
          toastApiError(e, 'Could not transfer ownership');
        }
      },
      { confirmLabel: 'Transfer', icon: 'shield-checkmark-outline', iconColor: theme.planGold },
    );
  };

  const handleDelete = () => {
    confirm(
      'Delete Group?',
      'This will permanently delete the group and all messages. This cannot be undone.',
      async () => {
        setDeleting(true);
        try {
          await deleteRoom(id);
          showSuccess('Group deleted');
          router.replace('/(tabs)/groups' as Href);
        } catch (e) {
          setDeleting(false);
          toastApiError(e, 'Could not delete group');
        }
      },
      { destructive: true, confirmLabel: 'Delete Forever', icon: 'trash-outline', iconColor: theme.error },
    );
  };

  // Inline edit (admin/creator)
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || name === room?.name) {
      setEditingName(false);
      return;
    }
    setSavingEdit(true);
    try {
      const res = await updateRoom(id, { name });
      setRoom(res.room);
      setEditingName(false);
    } catch (e) {
      toastApiError(e, 'Could not update name');
    } finally {
      setSavingEdit(false);
    }
  };

  const saveDesc = async () => {
    const description = descDraft.trim();
    if (description === (room?.description ?? '')) {
      setEditingDesc(false);
      return;
    }
    setSavingEdit(true);
    try {
      const res = await updateRoom(id, { description });
      setRoom(res.room);
      setEditingDesc(false);
    } catch (e) {
      toastApiError(e, 'Could not update description');
    } finally {
      setSavingEdit(false);
    }
  };

  const changeRole = async (m: RoomMemberCard, role: 'admin' | 'member') => {
    try {
      await updateRoomMemberRole(id, m.user.id, role);
      setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role } : x)));
      showSuccess(role === 'admin' ? `${m.user.firstName ?? 'Member'} is now an admin` : 'Admin removed');
    } catch (e) {
      toastApiError(e);
    }
  };

  const confirmRemoveMember = (m: RoomMemberCard) => {
    confirm(
      `Remove ${m.user.firstName ?? 'this member'}?`,
      'They will be removed from the group immediately.',
      async () => {
        try {
          await removeRoomMember(id, m.user.id);
          setMembers((prev) => prev.filter((x) => x.id !== m.id));
          setTotalMembers((t) => Math.max(0, t - 1));
          showSuccess('Member removed');
        } catch (e) {
          toastApiError(e);
        }
      },
      { destructive: true, confirmLabel: 'Remove', icon: 'person-remove-outline', iconColor: theme.error },
    );
  };

  // Long-press a member row → admin/creator action sheet.
  const onMemberLongPress = (m: RoomMemberCard) => {
    if (m.user.id === me?.id) return;
    const buttons: AlertButton[] = [];
    if (isCreator) {
      buttons.push(
        m.role === 'admin'
          ? { label: 'Remove Admin', onPress: () => { hideAlert(); changeRole(m, 'member'); } }
          : { label: 'Make Admin', onPress: () => { hideAlert(); changeRole(m, 'admin'); } },
      );
    }
    if (isAdmin) {
      buttons.push({
        label: 'Remove from Group',
        style: 'destructive',
        onPress: () => { hideAlert(); confirmRemoveMember(m); },
      });
    }
    if (buttons.length === 0) return;
    buttons.push({ label: 'Cancel', style: 'cancel', onPress: hideAlert });
    showAlert({ title: m.user.firstName ?? 'Member', buttons });
  };

  const handleMute = async () => {
    setMuted((v) => !v);
    try {
      const res = await muteRoom(id);
      setMuted(res.muted);
    } catch (e) {
      setMuted((v) => !v);
      toastApiError(e);
    }
  };

  // Shareable deep link that lands on the join screen (nearme://rooms/join/<code>).
  const inviteLink = useMemo(
    () => (room?.inviteCode ? Linking.createURL(`rooms/join/${room.inviteCode}`) : null),
    [room?.inviteCode],
  );

  const handleShareInvite = async () => {
    if (!inviteLink) return;
    try {
      await Share.share({
        message: `Join "${room?.name ?? 'my group'}" on NearMe: ${inviteLink}`,
      });
    } catch (e) {
      toastApiError(e, 'Could not open share sheet');
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    showSuccess('Invite link copied');
  };

  const handleLeave = () => {
    confirm(
      'Leave Group',
      'Are you sure? You can rejoin if the group is public.',
      async () => {
        try {
          await leaveRoom(id);
          router.replace('/(tabs)/groups' as Href);
        } catch (e) {
          toastApiError(e);
        }
      },
      { destructive: true, confirmLabel: 'Leave', icon: 'log-out-outline', iconColor: theme.error },
    );
  };

  const handleReport = async () => {
    try {
      await reportRoom(id, 'inappropriate');
      showSuccess('Group reported');
    } catch (e) {
      toastApiError(e);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      </SafeAreaView>
    );
  }

  const meta = room ? categoryMeta(theme, room.category) : null;
  const cover = typeof room?.coverImageUrl === 'string' ? room.coverImageUrl.trim() : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        {/* Header section */}
        <View style={styles.hero}>
          <Pressable onPress={isAdmin ? changePhoto : undefined} disabled={!isAdmin || photoUploading}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.heroImage} contentFit="cover" cachePolicy="memory-disk" />
            ) : meta ? (
              <View style={[styles.heroImage, { backgroundColor: meta.color + '22', alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name={meta.icon} size={54} color={meta.color} />
              </View>
            ) : null}
            {photoUploading ? (
              <View style={styles.heroOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : isAdmin ? (
              <View style={[styles.heroCamera, { backgroundColor: theme.brand, borderColor: theme.background }]}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            ) : null}
          </Pressable>
          {editingName ? (
            <View style={styles.editNameRow}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                maxLength={100}
                placeholder="Group name"
                placeholderTextColor={theme.textTertiary}
                style={[styles.editNameInput, { color: theme.textPrimary, borderColor: theme.border }]}
              />
              <Pressable onPress={saveName} disabled={savingEdit} hitSlop={8}>
                {savingEdit ? (
                  <ActivityIndicator color={theme.brand} />
                ) : (
                  <Ionicons name="checkmark" size={24} color={theme.brand} />
                )}
              </Pressable>
              <Pressable onPress={() => setEditingName(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={theme.textTertiary} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: theme.textPrimary }]}>{room?.name}</Text>
              {room?.isOfficial ? <Ionicons name="checkmark-circle" size={20} color={theme.info} /> : null}
              {isAdmin ? (
                <Pressable
                  onPress={() => {
                    setNameDraft(room?.name ?? '');
                    setEditingName(true);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="pencil" size={16} color={theme.textTertiary} />
                </Pressable>
              ) : null}
            </View>
          )}
          {meta ? (
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {meta.label}
              {room?.city ? ` · ${room.city}` : ''}
            </Text>
          ) : null}
          <Text style={[styles.counts, { color: theme.textTertiary }]}>
            {formatCount(room?.memberCount ?? 0)} members
            {room && room.onlineCount > 0 ? ` · ${formatCount(room.onlineCount)} online` : ''}
          </Text>
        </View>

        {/* Description */}
        {room?.description || isAdmin ? (
          <Section
            title="Description"
            theme={theme}
            action={
              isAdmin && !editingDesc
                ? {
                    label: 'Edit',
                    onPress: () => {
                      setDescDraft(room?.description ?? '');
                      setEditingDesc(true);
                    },
                  }
                : undefined
            }
          >
            {editingDesc ? (
              <View>
                <TextInput
                  value={descDraft}
                  onChangeText={setDescDraft}
                  autoFocus
                  multiline
                  maxLength={500}
                  placeholder="Add a description"
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.editDescInput, { color: theme.textPrimary, borderColor: theme.border }]}
                />
                <View style={styles.editActions}>
                  <Pressable onPress={() => setEditingDesc(false)} hitSlop={8}>
                    <Text style={[styles.editCancel, { color: theme.textTertiary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={saveDesc} disabled={savingEdit}>
                    {savingEdit ? (
                      <ActivityIndicator color={theme.brand} />
                    ) : (
                      <Text style={[styles.editSave, { color: theme.brand }]}>Save</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Text style={[styles.body, { color: room?.description ? theme.textSecondary : theme.textTertiary }]}>
                {room?.description || 'No description yet'}
              </Text>
            )}
          </Section>
        ) : null}

        {/* Invite via link — the way into a private group besides an admin add */}
        {inviteLink ? (
          <Section title={room?.isPrivate ? 'Private group · Invite link' : 'Invite link'} theme={theme}>
            <Text style={[styles.body, { color: theme.textSecondary, marginBottom: spacing.sm }]}>
              {room?.isPrivate
                ? 'This group is hidden from Discover. Share this link to let people join.'
                : 'Share this link to invite people to the group.'}
            </Text>
            <View style={styles.inviteActions}>
              <Pressable
                style={[styles.inviteBtn, { backgroundColor: theme.brand }]}
                onPress={handleShareInvite}
                hitSlop={6}
              >
                <Ionicons name="share-outline" size={18} color="#fff" />
                <Text style={[styles.inviteBtnText, { color: '#fff' }]}>Share Link</Text>
              </Pressable>
              <Pressable
                style={[styles.inviteBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}
                onPress={handleCopyInvite}
                hitSlop={6}
              >
                <Ionicons name="copy-outline" size={18} color={theme.textSecondary} />
                <Text style={[styles.inviteBtnText, { color: theme.textSecondary }]}>Copy</Text>
              </Pressable>
            </View>
          </Section>
        ) : null}

        {/* Media */}
        <Section
          title="Media, Links, Docs"
          theme={theme}
          action={{ label: `${media.length}`, onPress: () => router.push(`/rooms/media?roomId=${id}` as Href) }}
          onPressRow={() => router.push(`/rooms/media?roomId=${id}` as Href)}
        >
          {media.length ? (
            <View style={styles.mediaRow}>
              {media.slice(0, 3).map((m) => (
                <Image
                  key={m.id}
                  source={{ uri: m.mediaUrl ?? undefined }}
                  style={styles.mediaThumb}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ))}
            </View>
          ) : (
            <Text style={[styles.body, { color: theme.textTertiary }]}>No media yet</Text>
          )}
        </Section>

        {/* Notifications */}
        <View style={[styles.row, { borderTopColor: theme.border }]}>
          <Ionicons name="notifications-off-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Mute Notifications</Text>
          <Switch value={muted} onValueChange={handleMute} trackColor={{ true: theme.brand }} />
        </View>

        {/* Pinned */}
        <Pressable style={[styles.row, { borderTopColor: theme.border }]} onPress={() => router.back()}>
          <Ionicons name="pin-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Pinned Messages</Text>
          <Text style={[styles.rowValue, { color: theme.textTertiary }]}>{pinnedCount}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </Pressable>

        {/* Members */}
        <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: spacing.lg, paddingHorizontal: spacing.xl }]}>
          {formatCount(totalMembers)} Members
        </Text>
        {isAdmin ? (
          <Pressable
            style={styles.addMember}
            onPress={() => router.push(`/create-group/members?roomId=${id}` as Href)}
          >
            <View style={[styles.addIcon, { backgroundColor: theme.brand + '22' }]}>
              <Ionicons name="person-add" size={20} color={theme.brand} />
            </View>
            <Text style={[styles.rowLabel, { color: theme.brand }]}>Add Member</Text>
          </Pressable>
        ) : null}
        {/* Creator */}
        {memberSections.creators.length ? (
          <>
            <Text style={[styles.memberSectionLabel, { color: theme.textTertiary }]}>Group Creator</Text>
            {memberSections.creators.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                badge="creator"
                isSelf={m.user.id === me?.id}
                onPress={() => setMiniUser(m.user)}
                onLongPress={isAdmin && m.user.id !== me?.id ? () => onMemberLongPress(m) : undefined}
              />
            ))}
          </>
        ) : null}

        {/* Admins (only when present) */}
        {memberSections.admins.length ? (
          <>
            <Text style={[styles.memberSectionLabel, { color: theme.textTertiary }]}>Admins</Text>
            {memberSections.admins.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                badge="admin"
                isSelf={m.user.id === me?.id}
                onPress={() => setMiniUser(m.user)}
                onLongPress={isAdmin && m.user.id !== me?.id ? () => onMemberLongPress(m) : undefined}
              />
            ))}
          </>
        ) : null}

        {/* Members */}
        {memberSections.regular.length ? (
          <>
            <Text style={[styles.memberSectionLabel, { color: theme.textTertiary }]}>
              Members ({memberSections.regular.length})
            </Text>
            {memberSections.regular.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                badge={null}
                isSelf={m.user.id === me?.id}
                onPress={() => setMiniUser(m.user)}
                onLongPress={isAdmin && m.user.id !== me?.id ? () => onMemberLongPress(m) : undefined}
              />
            ))}
          </>
        ) : null}

        {/* Danger zone */}
        <View style={{ marginTop: spacing.lg }}>
          <Pressable style={[styles.row, { borderTopColor: theme.border }]} onPress={handleLeave}>
            <Ionicons name="exit-outline" size={22} color={theme.error} />
            <Text style={[styles.rowLabel, { color: theme.error }]}>Leave Group</Text>
          </Pressable>
          <Pressable style={[styles.row, { borderTopColor: theme.border }]} onPress={handleReport}>
            <Ionicons name="flag-outline" size={22} color={theme.error} />
            <Text style={[styles.rowLabel, { color: theme.error }]}>Report Group</Text>
          </Pressable>
          {isCreator ? (
            <>
              <Pressable style={[styles.row, { borderTopColor: theme.border }]} onPress={() => setTransferOpen(true)}>
                <Ionicons name="swap-horizontal-outline" size={22} color={theme.error} />
                <Text style={[styles.rowLabel, { color: theme.error }]}>Transfer Ownership</Text>
              </Pressable>
              <Pressable style={[styles.row, { borderTopColor: theme.border }]} onPress={handleDelete} disabled={deleting}>
                <Ionicons name="trash-outline" size={22} color={theme.error} />
                <Text style={[styles.rowLabel, { color: theme.error }]}>Delete Group</Text>
                {deleting ? <ActivityIndicator color={theme.error} /> : null}
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* Transfer-ownership member picker (creator only) */}
      <Modal visible={transferOpen} transparent animationType="slide" onRequestClose={() => setTransferOpen(false)}>
        <Pressable style={[styles.pickerBackdrop, { backgroundColor: theme.overlay }]} onPress={() => setTransferOpen(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.pickerTitle, { color: theme.textPrimary }]}>Transfer ownership to…</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {members
                .filter((m) => !m.isCreator)
                .map((m) => (
                  <Pressable key={m.id} style={styles.pickerRow} onPress={() => confirmTransfer(m)}>
                    <Avatar uri={m.user.profilePhotoUrl} size={40} online={m.user.isOnline} />
                    <Text style={[styles.pickerName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {m.user.firstName ?? 'Someone'}
                    </Text>
                  </Pressable>
                ))}
              {members.filter((m) => !m.isCreator).length === 0 ? (
                <Text style={[styles.body, { color: theme.textTertiary, paddingVertical: spacing.lg }]}>
                  No other members to transfer to.
                </Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <MiniProfile visible={!!miniUser} member={miniUser} roomId={roomId} onClose={() => setMiniUser(null)} onBlocked={() => load()} />

      {alertConfig ? <CustomAlert {...alertConfig} onDismiss={hideAlert} /> : null}
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme();
  return (
    <View style={styles.topBar}>
      <Pressable onPress={onBack} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
      </Pressable>
      <Text style={[styles.topTitle, { color: theme.textPrimary }]}>Group Info</Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

function Section({
  title,
  theme,
  action,
  onPressRow,
  children,
}: {
  title: string;
  theme: ReturnType<typeof useTheme>['theme'];
  action?: { label: string; onPress: () => void };
  onPressRow?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { borderTopColor: theme.border }]}>
      <Pressable style={styles.sectionHead} onPress={onPressRow} disabled={!onPressRow}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{title}</Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={6}>
            <Text style={[styles.sectionAction, { color: theme.brand }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </Pressable>
      {children}
    </View>
  );
}

function MemberRow({
  member,
  badge,
  isSelf,
  onPress,
  onLongPress,
}: {
  member: RoomMemberCard;
  badge: 'creator' | 'admin' | null;
  isSelf: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { theme } = useTheme();
  const u = member.user;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={300} style={styles.memberRow}>
      <Avatar uri={u.profilePhotoUrl} size={44} online={u.isOnline} />
      <View style={{ flex: 1 }}>
        <View style={styles.memberNameRow}>
          <Text style={[styles.memberName, { color: theme.textPrimary }]} numberOfLines={1}>
            {badge === 'creator' ? '👑 ' : ''}
            {u.firstName ?? 'Someone'}
            {isSelf ? ' (You)' : ''}
          </Text>
          {u.isVerified ? <Ionicons name="checkmark-circle" size={14} color={theme.info} /> : null}
          {badge === 'creator' ? (
            <View style={[styles.roleBadge, { backgroundColor: theme.planGold }]}>
              <Text style={styles.roleBadgeText}>Creator</Text>
            </View>
          ) : badge === 'admin' ? (
            <View style={[styles.roleBadge, { backgroundColor: theme.info }]}>
              <Text style={styles.roleBadgeText}>Admin</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  topTitle: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold },

  hero: { alignItems: 'center', paddingVertical: spacing.lg, gap: 6 },
  heroImage: { width: 120, height: 120, borderRadius: 60, marginBottom: spacing.sm },
  heroOverlay: { position: 'absolute', top: 0, left: 0, width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  heroCamera: { position: 'absolute', right: 2, bottom: spacing.sm + 2, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: FontSize.xxl, fontFamily: DisplayFont.bold, textAlign: 'center' },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, width: '100%' },
  editNameInput: { flex: 1, fontSize: FontSize.lg, fontFamily: DisplayFont.medium, borderBottomWidth: 1, paddingVertical: 4 },
  editDescInput: { fontSize: FontSize.md, fontFamily: FontFamily.regular, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.sm, minHeight: 60, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xl, marginTop: spacing.sm },
  editCancel: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  editSave: { fontSize: FontSize.md, fontFamily: FontFamily.bold },
  subtitle: { fontSize: FontSize.md, fontFamily: FontFamily.regular },
  counts: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },

  section: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.semibold },
  sectionAction: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  body: { fontSize: FontSize.md, fontFamily: FontFamily.regular, lineHeight: 20 },
  inviteActions: { flexDirection: 'row', gap: spacing.sm },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  inviteBtnText: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  mediaRow: { flexDirection: 'row', gap: spacing.sm },
  mediaThumb: { width: 90, height: 90, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.08)' },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  rowLabel: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.medium },
  rowValue: { fontSize: FontSize.md, fontFamily: FontFamily.regular },

  addMember: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  addIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  memberName: { fontSize: FontSize.md, fontFamily: FontFamily.semibold, flexShrink: 1 },
  memberSectionLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 4 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  roleBadgeText: { color: '#fff', fontSize: FontSize.xs, fontFamily: FontFamily.semibold },

  pickerBackdrop: { flex: 1, justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xxl },
  pickerTitle: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, marginBottom: spacing.md },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  pickerName: { fontSize: FontSize.md, fontFamily: FontFamily.semibold, flex: 1 },
});
