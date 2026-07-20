import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTheme, FontFamily, DisplayFont, FontSize, spacing, radius } from '../../../src/theme';
import { getRoomByCode, joinRoomByCode } from '../../../src/services/api';
import { useGroupsStore } from '../../../src/store/groupsStore';
import { categoryMeta, formatCount } from '../../../src/lib/rooms';
import { toastApiError } from '../../../src/lib/toast';
import type { RoomDetail, JoinedRoomCard } from '../../../src/types/api';

/**
 * Landing screen for a shared group invite link (nearme://rooms/join/<code>).
 * Previews the group, then joins on confirm. This is the only self-serve way
 * into a private group besides an admin add.
 */
export default function JoinByCode() {
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { code } = useLocalSearchParams<{ code: string }>();
  const addRoomToStore = useGroupsStore((s) => s.addRoom);

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getRoomByCode(String(code));
      setRoom(res.room);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'This invite link is invalid or expired.');
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  const goToRoom = (roomId: string) => {
    router.dismissAll?.();
    router.replace(`/rooms/${roomId}` as Href);
  };

  const handleJoin = async () => {
    if (!room || joining) return;
    // Already a member → just open it.
    if (room.isJoined) {
      goToRoom(room.id);
      return;
    }
    setJoining(true);
    try {
      const { room: joined } = await joinRoomByCode(String(code));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const joinedCard: JoinedRoomCard = { ...joined, isJoined: true, unreadCount: 0, role: joined.myRole ?? 'member' };
      addRoomToStore(joinedCard);
      goToRoom(joined.id);
    } catch (e) {
      toastApiError(e, 'Could not join this group');
      setJoining(false);
    }
  };

  const meta = room ? categoryMeta(theme, room.category) : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={theme.textPrimary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="link-outline" size={56} color={theme.textTertiary} />
          <Text style={[styles.stateTitle, { color: theme.textSecondary }]}>Invalid link</Text>
          <Text style={[styles.stateSub, { color: theme.textTertiary }]}>{error}</Text>
          <Pressable onPress={() => router.replace('/(tabs)/groups' as Href)} style={[styles.stateBtn, { backgroundColor: theme.brand }]}>
            <Text style={styles.stateBtnText}>Browse Groups</Text>
          </Pressable>
        </View>
      ) : room ? (
        <View style={styles.body}>
          <View style={styles.previewCard}>
            {room.coverImageUrl ? (
              <Image source={{ uri: room.coverImageUrl }} style={styles.cover} contentFit="cover" />
            ) : (
              <View style={[styles.cover, styles.coverEmpty, { backgroundColor: meta?.color ?? theme.surfaceElevated }]}>
                <Ionicons name={meta?.icon ?? 'people'} size={40} color="#fff" />
              </View>
            )}
            <View style={styles.privacyPill}>
              <Ionicons
                name={room.isPrivate ? 'lock-closed' : 'earth'}
                size={12}
                color={theme.textSecondary}
              />
              <Text style={[styles.privacyPillText, { color: theme.textSecondary }]}>
                {room.isPrivate ? 'Private group' : 'Public group'}
              </Text>
            </View>
            <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={2}>
              {room.name}
            </Text>
            <Text style={[styles.counts, { color: theme.textTertiary }]}>
              {formatCount(room.memberCount)} members
            </Text>
            {room.description ? (
              <Text style={[styles.desc, { color: theme.textSecondary }]} numberOfLines={4}>
                {room.description}
              </Text>
            ) : null}
          </View>

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable onPress={handleJoin} disabled={joining}>
              <LinearGradient
                colors={theme.gradientWarm}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cta}
              >
                {joining ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.ctaText}>{room.isJoined ? 'Open Group' : 'Join Group'}</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  body: { flex: 1, justifyContent: 'space-between' },
  previewCard: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.sm },
  cover: { width: 120, height: 120, borderRadius: 60 },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  privacyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(128,128,128,0.14)',
    marginTop: spacing.sm,
  },
  privacyPillText: { fontSize: FontSize.xs, fontFamily: FontFamily.semibold },
  name: { fontSize: FontSize.xxl, fontFamily: DisplayFont.bold, textAlign: 'center', marginTop: 4 },
  counts: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  desc: { fontSize: FontSize.md, fontFamily: FontFamily.regular, textAlign: 'center', lineHeight: 20, marginTop: spacing.sm },

  bottomBar: { paddingHorizontal: spacing.xl, paddingTop: 12 },
  cta: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: FontSize.md, fontFamily: DisplayFont.bold, color: '#fff' },

  stateTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.semibold, textAlign: 'center' },
  stateSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, textAlign: 'center' },
  stateBtn: { marginTop: spacing.md, height: 44, borderRadius: radius.pill, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  stateBtnText: { fontSize: FontSize.md, fontFamily: DisplayFont.bold, color: '#fff' },
});
