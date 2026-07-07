import { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from './Avatar';
import { ReportSheet } from './ReportSheet';
import { useTheme, FontFamily, FontSize, DisplayFont, spacing, radius } from '../theme';
import { blockUser, startConversation, getPublicProfile, inviteOrAddToRoom } from '../services/api';
import { toastApiError, showSuccess } from '../lib/toast';
import type { RoomUserCard } from '../types/api';

/**
 * Bottom sheet shown when tapping a room member's avatar/name.
 * CRITICAL: never renders phone number/email. Username display = firstName.
 */
export function MiniProfile({
  visible,
  member,
  onClose,
  onBlocked,
  roomId,
}: {
  visible: boolean;
  member: RoomUserCard | null;
  onClose: () => void;
  onBlocked?: (userId: string) => void;
  /** When set, shows a smart "Add to Room" / "Invite to Room" button. */
  roomId?: string;
}) {
  const { theme } = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [bio, setBio] = useState<string | null>(null);
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [groupsAvailable, setGroupsAvailable] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Lazy-load bio + lookingFor once the sheet opens (room cards don't carry them).
  const loadDetail = async (userId: string) => {
    setLoadingDetail(true);
    try {
      const p = await getPublicProfile(userId);
      setBio(p.bio ?? null);
      setLookingFor((p.lookingFor ?? []).slice(0, 3));
      setGroupsAvailable(p.groupsAvailable ?? false);
    } catch {
      /* non-fatal — sheet still shows the card fields */
    } finally {
      setLoadingDetail(false);
    }
  };

  // Add the member directly (if they're open to groups) or send them an invite.
  // The server decides; we surface the outcome. A 403 cannot_add_user means we
  // must start a conversation with them first.
  const handleAddToRoom = async () => {
    if (adding || !roomId || !member) return;
    setAdding(true);
    try {
      const res = await inviteOrAddToRoom(roomId, member.id);
      if (res.added) {
        showSuccess(res.method === 'already_member' ? `${name} is already in this group` : `Added ${name} to the group`);
      } else {
        showSuccess(res.method === 'invite_already_sent' ? 'Invite already sent' : `Invited ${name} to the group`);
      }
      onClose();
    } catch (e) {
      toastApiError(e, 'Could not add to group');
    } finally {
      setAdding(false);
    }
  };

  if (!member) return null;
  const name = member.firstName ?? 'Someone';

  const handleViewProfile = () => {
    onClose();
    router.push(`/profile/${member.id}`);
  };

  const handleSendIntro = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await startConversation(member.id);
      onClose();
      router.push(`/chat/${res.id}`);
    } catch (e) {
      toastApiError(e, 'Could not start chat');
    } finally {
      setBusy(false);
    }
  };

  const handleBlock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await blockUser(member.id);
      showSuccess(`${name} blocked`);
      onBlocked?.(member.id);
      onClose();
    } catch (e) {
      toastApiError(e, 'Could not block');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={() => loadDetail(member.id)}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.avatarWrap}>
              <Avatar uri={member.profilePhotoUrl} size={120} online={member.isOnline} />
            </View>

            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: theme.textPrimary }]}>
                {name}
                {member.age != null ? <Text style={[styles.age, { color: theme.textSecondary }]}>{`, ${member.age}`}</Text> : null}
              </Text>
              {member.isVerified ? <Ionicons name="checkmark-circle" size={20} color={theme.info} /> : null}
            </View>

            <View style={styles.metaRow}>
              {member.planBadge ? (
                <View style={[styles.badge, { backgroundColor: theme.planGold + '22' }]}>
                  <Text style={[styles.badgeText, { color: theme.planGold }]}>{member.planBadge.toUpperCase()}</Text>
                </View>
              ) : null}
              {member.distanceLabel ? (
                <Text style={[styles.distance, { color: theme.textTertiary }]}>{member.distanceLabel}</Text>
              ) : null}
            </View>

            {loadingDetail ? (
              <ActivityIndicator color={theme.brand} style={{ marginVertical: spacing.md }} />
            ) : bio ? (
              <Text style={[styles.bio, { color: theme.textSecondary }]} numberOfLines={2}>
                {bio}
              </Text>
            ) : null}

            {lookingFor.length > 0 ? (
              <View style={styles.chipsRow}>
                {lookingFor.map((l) => (
                  <View key={l} style={[styles.chip, { backgroundColor: theme.backgroundTertiary }]}>
                    <Text style={[styles.chipText, { color: theme.textSecondary }]}>{l.replace(/_/g, ' ')}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Primary actions */}
            <Pressable onPress={handleSendIntro} disabled={busy} style={styles.introBtn}>
              <LinearGradient
                colors={theme.gradientWarm}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.introGradient}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.introText}>Send Intro</Text>
                )}
              </LinearGradient>
            </Pressable>

            {roomId ? (
              <Pressable
                onPress={handleAddToRoom}
                disabled={adding || loadingDetail}
                style={[styles.outlineBtn, { borderColor: theme.brand }]}
              >
                {adding ? (
                  <ActivityIndicator color={theme.brand} />
                ) : (
                  <Text style={[styles.outlineText, { color: theme.brand }]}>
                    {groupsAvailable ? 'Add to Room' : 'Invite to Room'}
                  </Text>
                )}
              </Pressable>
            ) : null}

            <Pressable
              onPress={handleViewProfile}
              style={[styles.outlineBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.outlineText, { color: theme.textPrimary }]}>View Profile</Text>
            </Pressable>

            <View style={styles.dangerRow}>
              <Pressable onPress={handleBlock} disabled={busy} style={styles.dangerBtn}>
                <Ionicons name="ban-outline" size={18} color={theme.error} />
                <Text style={[styles.dangerText, { color: theme.error }]}>Block</Text>
              </Pressable>
              <Pressable onPress={() => setReporting(true)} style={styles.dangerBtn}>
                <Ionicons name="flag-outline" size={18} color={theme.textSecondary} />
                <Text style={[styles.dangerText, { color: theme.textSecondary }]}>Report</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>

      <ReportSheet
        visible={reporting}
        userId={member.id}
        onClose={() => setReporting(false)}
        onReported={() => showSuccess('Report submitted')}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: spacing.xxl },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: spacing.md },
  content: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  avatarWrap: { marginBottom: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: FontSize.xxl, fontFamily: DisplayFont.bold },
  age: { fontSize: FontSize.xl, fontFamily: DisplayFont.medium },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, letterSpacing: 0.5 },
  distance: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  bio: { fontSize: FontSize.md, fontFamily: FontFamily.regular, textAlign: 'center', marginTop: spacing.md },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: spacing.md },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  chipText: { fontSize: FontSize.sm, fontFamily: FontFamily.medium, textTransform: 'capitalize' },
  introBtn: { width: '100%', marginTop: spacing.xl },
  introGradient: { height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  introText: { color: '#fff', fontSize: FontSize.lg, fontFamily: FontFamily.bold },
  outlineBtn: { width: '100%', height: 50, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  outlineText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  dangerRow: { flexDirection: 'row', gap: spacing.xxl, marginTop: spacing.lg },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  dangerText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
});
