import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { ListSkeleton } from '../../src/components/Skeleton';
import { showError, showSuccess, toastApiError } from '../../src/lib/toast';
import { getRightNow, updateProfile, ApiError } from '../../src/services/api';
import type { RightNowCategory, RightNowCard } from '../../src/types/api';

const MAX_CHARS = 120;

const CATEGORIES: { key: RightNowCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'drinks', label: 'Drinks', icon: 'wine' },
  { key: 'coffee', label: 'Coffee', icon: 'cafe' },
  { key: 'workout', label: 'Workout', icon: 'barbell' },
  { key: 'hangout', label: 'Hangout', icon: 'people' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const DURATIONS: { key: string; label: string; hours: number | 'tonight' }[] = [
  { key: '1h', label: '1 hr', hours: 1 },
  { key: '2h', label: '2 hr', hours: 2 },
  { key: '4h', label: '4 hr', hours: 4 },
  { key: 'tonight', label: 'Tonight', hours: 'tonight' },
];

const FILTER_CHIPS = ['Distance', 'Hosting', 'Position'];

function expiresAtFor(hours: number | 'tonight'): string {
  const now = new Date();
  if (hours === 'tonight') {
    const end = new Date();
    end.setHours(23, 59, 0, 0);
    if (end.getTime() <= now.getTime()) end.setTime(now.getTime() + 6 * 3600_000);
    return end.toISOString();
  }
  return new Date(now.getTime() + hours * 3600_000).toISOString();
}

export default function RightNow() {
  const router = useRouter();
  const { theme } = useTheme();
  const purple = theme.planPremium;
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [feed, setFeed] = useState<RightNowCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);

  const myStatus = user?.rightNowStatus ?? null;
  const myActive = !!myStatus;

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await getRightNow();
      setFeed(res.statuses);
    } catch (e) {
      setError((e as ApiError).message ?? 'Could not load Right Now');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  const clearStatus = async () => {
    try {
      const updated = await updateProfile({ rightNowStatus: null, rightNowCategory: null, rightNowExpiresAt: null });
      setUser(updated);
      showSuccess('Your Right Now was cleared', 'Done');
    } catch (e) {
      // Optimistic fallback so the UI reflects the user's intent even if the field isn't live yet.
      if (user) setUser({ ...user, rightNowStatus: null, rightNowCategory: null, rightNowExpiresAt: null });
      toastApiError(e, 'Could not clear status');
    }
  };

  const renderCard = ({ item }: { item: RightNowCard }) => {
    const online = item.lastActiveAt?.toLowerCase() === 'online';
    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push({ pathname: '/profile/[id]', params: { id: item.id } })}
      >
        <View>
          {item.profilePhoto ? (
            <Image source={{ uri: item.profilePhoto }} style={[styles.avatar, { backgroundColor: theme.backgroundTertiary }]} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.center, { backgroundColor: theme.backgroundTertiary }]}>
              <Ionicons name="person" size={28} color={theme.textTertiary} />
            </View>
          )}
          {online && <View style={[styles.onlineDot, { backgroundColor: theme.online, borderColor: theme.background }]} />}
        </View>

        <View style={styles.cardBody}>
          <Text style={[styles.statusText, { color: theme.textPrimary }]} numberOfLines={2}>
            {item.rightNowStatus}{' '}
            <Text style={{ color: theme.textTertiary, fontWeight: '400' }}>joined</Text>
          </Text>
          <View style={styles.metaRow}>
            {!!item.lastActiveAt && (
              <>
                <Ionicons name="time-outline" size={13} color={theme.textTertiary} />
                <Text style={[styles.meta, { color: theme.textTertiary }]}>{item.lastActiveAt}</Text>
              </>
            )}
            {!!item.distanceLabel && (
              <>
                <Ionicons name="navigate" size={13} color={theme.textTertiary} style={{ marginLeft: 8 }} />
                <Text style={[styles.meta, { color: theme.textTertiary }]}>{item.distanceLabel}</Text>
              </>
            )}
            {item.rightNowCategory && <Ionicons name="water" size={14} color={purple} style={{ marginLeft: 8 }} />}
          </View>
        </View>

        <Ionicons name="chatbubble-outline" size={20} color={theme.textTertiary} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Right Now</Text>

      {/* Filter chips (visual; the feed is proximity-sorted) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {FILTER_CHIPS.map((c, i) => (
          <View key={c} style={[styles.filterChip, { backgroundColor: theme.surfaceElevated }]}>
            {i === 0 && <Ionicons name="swap-vertical" size={14} color={theme.textPrimary} />}
            <Text style={[styles.filterChipText, { color: theme.textPrimary }]}>{c}</Text>
          </View>
        ))}
      </ScrollView>

      {/* My active status banner */}
      {myActive && (
        <View style={[styles.myStatus, { backgroundColor: purple + '22', borderColor: purple }]}>
          <Ionicons name="water" size={18} color={purple} />
          <View style={{ flex: 1 }}>
            <View style={styles.myStatusTop}>
              <Text style={[styles.myStatusText, { color: theme.textPrimary }]} numberOfLines={1}>{myStatus}</Text>
              <View style={[styles.activeBadge, { backgroundColor: theme.online }]}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            </View>
          </View>
          <Pressable hitSlop={8} onPress={clearStatus}>
            <Text style={[styles.deleteText, { color: theme.error }]}>Delete</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(it) => it.id}
          renderItem={renderCard}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: theme.border }]} />}
          contentContainerStyle={feed.length === 0 ? { flex: 1 } : { paddingVertical: 8, paddingBottom: 96 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.brand} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="water-outline" size={52} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Nothing happening yet</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {error ?? 'Be the first to post what you’re up to right now.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Floating Join/Create button */}
      <View style={styles.fabWrap} pointerEvents="box-none">
        <Pressable style={[styles.joinPill, { backgroundColor: theme.surfaceElevated }]} onPress={() => setSheetOpen(true)}>
          <Text style={[styles.joinText, { color: theme.textPrimary }]}>{myActive ? 'Update' : 'Join'}</Text>
          {!myActive && <Text style={[styles.joinSub, { color: theme.textTertiary }]}>1 Free</Text>}
        </Pressable>
        <Pressable style={[styles.fab, { backgroundColor: purple }]} onPress={() => setSheetOpen(true)}>
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>
      </View>

      <CreateSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        purple={purple}
        initialStatus={myStatus ?? ''}
        initialCategory={user?.rightNowCategory ?? null}
        onPosted={(updated) => {
          setUser(updated);
          setSheetOpen(false);
        }}
        onLocalPost={(patch) => {
          if (user) setUser({ ...user, ...patch });
          setSheetOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

/* ───────────────────────── Create Right Now sheet ───────────────────────── */

function CreateSheet({
  visible,
  onClose,
  purple,
  initialStatus,
  initialCategory,
  onPosted,
  onLocalPost,
}: {
  visible: boolean;
  onClose: () => void;
  purple: string;
  initialStatus: string;
  initialCategory: RightNowCategory | null;
  onPosted: (updated: Awaited<ReturnType<typeof updateProfile>>) => void;
  onLocalPost: (patch: { rightNowStatus: string; rightNowCategory: RightNowCategory; rightNowExpiresAt: string }) => void;
}) {
  const { theme } = useTheme();
  const [text, setText] = useState(initialStatus);
  const [category, setCategory] = useState<RightNowCategory | null>(initialCategory);
  const [duration, setDuration] = useState<string>('2h');
  const [posting, setPosting] = useState(false);

  const post = async () => {
    const status = text.trim();
    if (!status) {
      showError('Add a short status first');
      return;
    }
    const dur = DURATIONS.find((d) => d.key === duration)!;
    const patch = {
      rightNowStatus: status,
      rightNowCategory: (category ?? 'other') as RightNowCategory,
      rightNowExpiresAt: expiresAtFor(dur.hours),
    };
    setPosting(true);
    try {
      const updated = await updateProfile(patch);
      showSuccess('You’re live in Right Now', 'Posted');
      onPosted(updated);
    } catch (e) {
      // Field may not be live backend-side yet — reflect intent locally.
      onLocalPost(patch);
      toastApiError(e, 'Saved locally — backend field pending');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Right Now</Text>
              <Pressable hitSlop={10} onPress={onClose}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              value={text}
              onChangeText={(t) => setText(t.slice(0, MAX_CHARS))}
              placeholder="What are you doing right now?"
              placeholderTextColor={theme.textTertiary}
              multiline
              style={[styles.sheetInput, { backgroundColor: theme.inputBackground, color: theme.textPrimary }]}
            />
            <Text style={[styles.counter, { color: theme.textTertiary }]}>{text.length}/{MAX_CHARS}</Text>

            <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>Category</Text>
            <View style={styles.catRow}>
              {CATEGORIES.map((c) => {
                const on = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setCategory(on ? null : c.key)}
                    style={[styles.catChip, { backgroundColor: on ? purple : theme.surfaceElevated, borderColor: on ? purple : theme.border }]}
                  >
                    <Ionicons name={c.icon} size={15} color={on ? '#fff' : theme.textSecondary} />
                    <Text style={[styles.catText, { color: on ? '#fff' : theme.textPrimary }]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sheetLabel, { color: theme.textSecondary }]}>Active for</Text>
            <View style={styles.durRow}>
              {DURATIONS.map((d) => {
                const on = duration === d.key;
                return (
                  <Pressable
                    key={d.key}
                    onPress={() => setDuration(d.key)}
                    style={[styles.durChip, { backgroundColor: on ? purple : theme.surfaceElevated }]}
                  >
                    <Text style={[styles.durText, { color: on ? '#fff' : theme.textPrimary }]}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.postBtn, { backgroundColor: purple, opacity: posting ? 0.7 : 1 }]}
              onPress={post}
              disabled={posting}
            >
              {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.postText}>Post</Text>}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },

  chipsRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16, height: 36 },
  filterChipText: { fontSize: 14, fontWeight: '600' },

  myStatus: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 6, padding: 12, borderRadius: 14, borderWidth: 1 },
  myStatusTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  myStatusText: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  activeBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  activeBadgeText: { color: '#000', fontSize: 11, fontWeight: '800' },
  deleteText: { fontSize: 14, fontWeight: '700' },

  card: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  onlineDot: { position: 'absolute', right: 0, bottom: 2, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  cardBody: { flex: 1, gap: 5 },
  statusText: { fontSize: 16, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meta: { fontSize: 13 },
  sep: { height: 1, marginLeft: 86 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  fabWrap: { position: 'absolute', right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  joinPill: { borderRadius: 999, paddingHorizontal: 18, height: 52, alignItems: 'center', justifyContent: 'center' },
  joinText: { fontSize: 16, fontWeight: '800' },
  joinSub: { fontSize: 11, fontWeight: '600' },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },

  // sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#666', marginBottom: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '800' },
  sheetInput: { minHeight: 84, borderRadius: 14, padding: 14, fontSize: 16, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontSize: 12, marginTop: 6 },
  sheetLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 16, marginBottom: 10 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, height: 40, borderWidth: 1 },
  catText: { fontSize: 14, fontWeight: '600' },
  durRow: { flexDirection: 'row', gap: 8 },
  durChip: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  durText: { fontSize: 14, fontWeight: '700' },
  postBtn: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  postText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
