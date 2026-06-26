import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Switch,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { ListSkeleton } from '../../src/components/Skeleton';
import { RightNowIcon } from '../../src/components/icons';
import { showError, showSuccess, toastApiError } from '../../src/lib/toast';
import { minutesAgoLabel, expiresInLabel } from '../../src/lib/format';
import { getRightNow, updateProfile, startConversation, ApiError } from '../../src/services/api';
import type { RightNowCategory, RightNowCard, Self } from '../../src/types/api';

/** Reference palette from ui_images/rightnow_ui.png */
const RNUI = {
  bg: '#000000',
  chip: '#2C2C2E',
  chipActive: '#3A3A3C',
  purple: '#9B4DEE',
  meta: '#8E8E93',
  joinPill: '#2C2C2E',
  online: '#30D158',
};

const MAX_CHARS = 140;

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

type FilterKey = 'distance' | 'hosting' | 'position';

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

function parseDistanceMeters(label: string | null | undefined, fallback: number | null | undefined): number {
  if (fallback != null && fallback > 0) return fallback;
  if (!label) return Number.MAX_SAFE_INTEGER;
  const km = label.match(/([\d.]+)\s*km/i);
  if (km) return Math.round(parseFloat(km[1]) * 1000);
  const m = label.match(/([\d.]+)\s*m/i);
  if (m) return Math.round(parseFloat(m[1]));
  return Number.MAX_SAFE_INTEGER;
}

function isHostingStatus(status: string | null | undefined, cat: RightNowCategory | null | undefined) {
  const s = (status ?? '').toLowerCase();
  return s.includes('host') || cat === 'drinks' || cat === 'hangout';
}

export default function RightNow() {
  const router = useRouter();
  const { theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [feed, setFeed] = useState<RightNowCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    distance: false,
    hosting: false,
    position: false,
  });
  const [distanceDesc, setDistanceDesc] = useState(false);
  const [myJoinedAt, setMyJoinedAt] = useState<string | null>(null);

  const myStatus = user?.rightNowStatus ?? null;
  const myActive = !!(user?.rightNowExpiresAt && new Date(user.rightNowExpiresAt) > new Date());

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

  useFocusEffect(useCallback(() => { load(false); }, [load]));

  const myRow = useMemo((): RightNowCard | null => {
    if (!myActive || !user || !myStatus) return null;
    return {
      id: user.id,
      profilePhoto: user.primaryPhotoUrl ?? null,
      firstName: user.firstName,
      age: user.age,
      distance: '',
      distanceLabel: null,
      lastActiveAt: 'online',
      activity: { online: true, label: 'Online' },
      isVerified: user.isVerified,
      planBadge: user.plan !== 'free' ? user.plan : null,
      height: user.height,
      weight: user.weight,
      bodyType: user.bodyType,
      skinTone: user.skinTone,
      aboutMe: user.aboutMe,
      whereAreYouFrom: user.whereAreYouFrom,
      relationshipStatus: user.relationshipStatus,
      lookingFor: user.lookingFor ?? [],
      whereWeCanMeet: user.whereWeCanMeet ?? [],
      preferences: user.preferences,
      fantasyTags: user.fantasyTags ?? [],
      tribes: user.tribes ?? [],
      tags: user.tags ?? [],
      isShortlisted: false,
      isLiked: false,
      boosted: false,
      rightNowStatus: myStatus,
      rightNowCategory: user.rightNowCategory ?? null,
      rightNowExpiresAt: user.rightNowExpiresAt ?? null,
      rightNowJoinedAt: myJoinedAt ?? user.updatedAt ?? new Date().toISOString(),
      distanceMeters: 0,
    };
  }, [myActive, user, myStatus, myJoinedAt]);

  const displayed = useMemo(() => {
    let list = feed.filter((u) => u.id !== user?.id);
    if (filters.hosting) {
      list = list.filter((u) => isHostingStatus(u.rightNowStatus, u.rightNowCategory));
    }
    if (filters.position) {
      list = list.filter((u) => !!u.preferences?.trim());
    }
    list.sort((a, b) => {
      const da = parseDistanceMeters(a.distanceLabel, a.distanceMeters);
      const db = parseDistanceMeters(b.distanceLabel, b.distanceMeters);
      return distanceDesc ? db - da : da - db;
    });
    if (myRow) list = [myRow, ...list];
    return list;
  }, [feed, filters, distanceDesc, myRow, user?.id]);

  const toggleFilter = (key: FilterKey) => {
    if (key === 'distance') {
      setDistanceDesc((d) => !d);
      setFilters((f) => ({ ...f, distance: true }));
      return;
    }
    setFilters((f) => ({ ...f, [key]: !f[key] }));
  };

  const openChat = async (peerId: string, peerName: string) => {
    if (peerId === user?.id) return;
    try {
      const res = await startConversation(peerId);
      router.push({ pathname: '/chat/[id]', params: { id: res.id, peerName } });
    } catch (e) {
      toastApiError(e, 'Could not open chat');
    }
  };

  const renderRow = ({ item }: { item: RightNowCard }) => {
    const isMe = item.id === user?.id;
    const online = item.activity?.online ?? item.lastActiveAt?.toLowerCase() === 'online';
    const joinedAgo = minutesAgoLabel(item.rightNowJoinedAt ?? null);
    const showHostBadge = isHostingStatus(item.rightNowStatus, item.rightNowCategory);

    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
        onPress={() =>
          isMe
            ? setSheetOpen(true)
            : router.push({ pathname: '/profile/[id]', params: { id: item.id } })
        }
      >
        <View style={styles.avatarWrap}>
          {item.profilePhoto ? (
            <Image source={{ uri: item.profilePhoto }} style={styles.avatar} contentFit="cover" transition={120} cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.avatar, styles.center, { backgroundColor: RNUI.chip }]}>
              <Ionicons name="person" size={22} color={RNUI.meta} />
            </View>
          )}
          {online && (
            <View style={styles.onlineDot}>
              <View style={styles.onlineInner} />
            </View>
          )}
        </View>

        <View style={styles.rowBody}>
          <Text style={styles.statusLine} numberOfLines={2}>
            {item.rightNowStatus ?? 'Right now'}{' '}
            <Text style={styles.joinedWord}>joined</Text>
          </Text>
          <View style={styles.metaRow}>
            {!!joinedAgo && (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={12} color={RNUI.meta} />
                <Text style={styles.metaText}>{joinedAgo}</Text>
              </View>
            )}
            {!!item.distanceLabel && (
              <View style={[styles.metaItem, styles.metaSpaced]}>
                <Ionicons name="paper-plane-outline" size={12} color={RNUI.meta} />
                <Text style={styles.metaText}>{item.distanceLabel}</Text>
              </View>
            )}
            {showHostBadge && (
              <View style={styles.hostBadge}>
                <Ionicons name="home" size={10} color="#fff" />
              </View>
            )}
          </View>
        </View>

        {!isMe && (
          <Pressable
            hitSlop={12}
            style={styles.msgBtn}
            onPress={() => openChat(item.id, item.firstName ?? 'Someone')}
          >
            <Ionicons name="chevron-forward" size={18} color={RNUI.meta} />
          </Pressable>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.title}>Right Now</Text>


      <View style={styles.chipsRow}>
        <Pressable
          onPress={() => toggleFilter('distance')}
          style={[styles.chip, { backgroundColor: filters.distance ? RNUI.chipActive : RNUI.chip }]}
        >
          <Ionicons name="swap-vertical" size={16} color="#FFFFFF" />
          <Text style={styles.chipText}>Distance</Text>
        </Pressable>
        <Pressable
          onPress={() => toggleFilter('hosting')}
          style={[styles.chip, { backgroundColor: filters.hosting ? RNUI.chipActive : RNUI.chip }]}
        >
          <Text style={styles.chipText}>Hosting</Text>
        </Pressable>
        <Pressable
          onPress={() => toggleFilter('position')}
          style={[styles.chip, { backgroundColor: filters.position ? RNUI.chipActive : RNUI.chip }]}
        >
          <Text style={styles.chipText}>Position</Text>
        </Pressable>
      </View>

      <View style={styles.listWrap}>
        <FlatList
          data={displayed}
          keyExtractor={(it) => it.id}
          renderItem={renderRow}
          style={styles.list}
          contentContainerStyle={{
            paddingTop: 4,
            paddingBottom: 130,
            flexGrow: displayed.length === 0 ? 1 : 0,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={RNUI.purple}
            />
          }
          ListEmptyComponent={
            loading ? null : (
              <View
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: 32,
                }}
              >
                <View style={[styles.emptyIcon, { backgroundColor: RNUI.purple }]}>
                  <RightNowIcon size={26} color="#fff" solid />
                </View>
                <Text style={styles.emptyTitle}>Nothing happening yet</Text>
                <Text style={styles.emptyBody}>
                  {error ?? "Be the first to post what you're up to right now."}
                </Text>
              </View>
            )
          }
        />
      </View>

      <View style={styles.fabRow} pointerEvents="box-none">
        <Pressable style={styles.joinPill} onPress={() => setSheetOpen(true)}>
          <Text style={styles.joinLabel}>{myActive ? 'Update' : 'Join'}</Text>
          {!myActive && <Text style={styles.joinSub}>1 Free</Text>}
        </Pressable>
        <Pressable style={styles.fab} onPress={() => setSheetOpen(true)}>
          <Ionicons name="add" size={34} color="#FFFFFF" />
        </Pressable>
      </View>

      <CreateSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        user={user}
        initialStatus={myStatus ?? ''}
        initialCategory={user?.rightNowCategory ?? null}
        expiresAt={user?.rightNowExpiresAt ?? null}
        onPosted={(updated) => {
          setUser(updated);
          setMyJoinedAt(new Date().toISOString());
          setSheetOpen(false);
          load(true);
        }}
        onLocalPost={(patch) => {
          if (user) setUser({ ...user, ...patch });
          setMyJoinedAt(new Date().toISOString());
          setSheetOpen(false);
          load(true);
        }}
      />
    </SafeAreaView>
  );
}

function CreateSheet({
  visible,
  onClose,
  user,
  initialStatus,
  initialCategory,
  expiresAt,
  onPosted,
  onLocalPost,
}: {
  visible: boolean;
  onClose: () => void;
  user: Self | null;
  initialStatus: string;
  initialCategory: RightNowCategory | null;
  expiresAt: string | null;
  onPosted: (updated: Awaited<ReturnType<typeof updateProfile>>) => void;
  onLocalPost: (patch: { rightNowStatus: string; rightNowCategory: RightNowCategory; rightNowExpiresAt: string }) => void;
}) {
  const { theme } = useTheme();
  const [text, setText] = useState(initialStatus);
  const [category, setCategory] = useState<RightNowCategory | null>(initialCategory);
  const [duration, setDuration] = useState('2h');
  const [hosting, setHosting] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setText(initialStatus);
    setCategory(initialCategory);
    setHosting(initialStatus.toLowerCase().includes('host'));
  }, [visible, initialStatus, initialCategory]);

  const post = async () => {
    let status = text.trim();
    if (!status) {
      showError('Add a short status first');
      return;
    }
    if (hosting && !status.toLowerCase().includes('host')) {
      status = `Hosting — ${status}`;
    }
    const dur = DURATIONS.find((d) => d.key === duration)!;
    const patch = {
      rightNowStatus: status.slice(0, MAX_CHARS),
      rightNowCategory: (category ?? 'other') as RightNowCategory,
      rightNowExpiresAt: expiresAtFor(dur.hours),
    };
    setPosting(true);
    try {
      const updated = await updateProfile(patch);
      showSuccess("You're live in Right Now", 'Posted');
      onPosted(updated);
    } catch (e) {
      onLocalPost(patch);
      toastApiError(e, 'Saved locally — backend field pending');
    } finally {
      setPosting(false);
    }
  };

  const pendingLeft = expiresAt ? expiresInLabel(expiresAt) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[styles.sheet, { backgroundColor: '#141414' }]} onPress={() => { }}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHead}>
              <Pressable hitSlop={10}>
                <Ionicons name="information-circle-outline" size={22} color={RNUI.meta} />
              </Pressable>
              <View style={styles.sheetTitleWrap}>
                <Text style={styles.sheetTitle}>Right Now</Text>
                {pendingLeft && initialStatus ? (
                  <Text style={styles.sheetPending}>Pending · {pendingLeft}</Text>
                ) : null}
              </View>
              <Pressable hitSlop={10} onPress={onClose}>
                <Ionicons name="close" size={24} color={RNUI.meta} />
              </Pressable>
            </View>

            <View style={styles.inputCard}>
              <View>
                {user?.primaryPhotoUrl ? (
                  <Image source={{ uri: user.primaryPhotoUrl }} style={styles.sheetAvatar} contentFit="cover" transition={120} cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.sheetAvatar, styles.center, { backgroundColor: RNUI.chip }]}>
                    <Ionicons name="person" size={22} color={RNUI.meta} />
                  </View>
                )}
                <View style={styles.editBadge}>
                  <Ionicons name="pencil" size={10} color="#fff" />
                </View>
              </View>
              <TextInput
                value={text}
                onChangeText={(t) => setText(t.slice(0, MAX_CHARS))}
                placeholder="What are you looking for?"
                placeholderTextColor={RNUI.meta}
                multiline
                autoFocus
                style={styles.sheetInput}
              />
            </View>
            <Text style={styles.counter}>{text.length}/{MAX_CHARS}</Text>

            <View style={styles.hostRow}>
              <View style={styles.hostLeft}>
                <Ionicons name="home" size={20} color={RNUI.purple} />
                <Text style={styles.hostLabel}>Hosting</Text>
              </View>
              <Switch
                value={hosting}
                onValueChange={setHosting}
                trackColor={{ false: RNUI.chip, true: RNUI.purple + '99' }}
                thumbColor={hosting ? RNUI.purple : RNUI.meta}
              />
            </View>

            <Text style={styles.sectionLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
              {CATEGORIES.map((c) => {
                const on = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setCategory(on ? null : c.key)}
                    style={[styles.catChip, { backgroundColor: on ? RNUI.purple : RNUI.chip }]}
                  >
                    <Ionicons name={c.icon} size={15} color={on ? '#fff' : RNUI.meta} />
                    <Text style={[styles.catText, { color: on ? '#fff' : '#fff' }]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.sectionLabel}>Active for</Text>
            <View style={styles.durRow}>
              {DURATIONS.map((d) => {
                const on = duration === d.key;
                return (
                  <Pressable
                    key={d.key}
                    onPress={() => setDuration(d.key)}
                    style={[styles.durChip, { backgroundColor: on ? RNUI.purple : RNUI.chip }]}
                  >
                    <Text style={[styles.durText, { color: '#fff' }]}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={post} disabled={posting} style={[styles.startBtn, { opacity: posting ? 0.7 : 1 }]}>
              {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.startText}>Start</Text>}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: RNUI.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: {
    fontSize: 26,
    fontFamily: DisplayFont.bold,
    fontWeight: '800',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    letterSpacing: -0.3,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 36,
  },
  chipText: { fontSize: 14, fontFamily: FontFamily.semibold, fontWeight: '600', color: '#FFFFFF' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: RNUI.chip, overflow: 'hidden' },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: RNUI.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: RNUI.online },
  rowBody: { flex: 1, gap: 5, paddingRight: 4 },
  statusLine: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  joinedWord: { fontFamily: FontFamily.regular, fontWeight: '400', color: RNUI.meta },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaSpaced: { marginLeft: 10 },
  metaText: { fontSize: 13, fontFamily: FontFamily.regular, color: RNUI.meta },
  hostBadge: {
    marginLeft: 8,
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: RNUI.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgBtn: { paddingLeft: 6, paddingVertical: 6 },

  listWrap: { flex: 1 },
  list: { flex: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontFamily: DisplayFont.bold, fontWeight: '700', color: '#FFFFFF' },
  emptyBody: { fontSize: 13, fontFamily: FontFamily.regular, textAlign: 'center', lineHeight: 19, color: RNUI.meta },

  fabRow: {
    position: 'absolute',
    right: 16,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  joinPill: {
    backgroundColor: RNUI.joinPill,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 9,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinLabel: { fontSize: 15, fontFamily: DisplayFont.bold, fontWeight: '800', color: '#FFFFFF' },
  joinSub: { fontSize: 11, fontFamily: FontFamily.regular, color: RNUI.meta, marginTop: 1 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: RNUI.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#555', marginBottom: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sheetTitleWrap: { flex: 1, alignItems: 'center' },
  sheetTitle: { fontSize: 18, fontFamily: DisplayFont.bold, fontWeight: '800', color: '#FFFFFF' },
  sheetPending: { fontSize: 12, fontFamily: FontFamily.regular, color: RNUI.meta, marginTop: 2 },
  inputCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 14,
    padding: 14,
    alignItems: 'flex-start',
    backgroundColor: RNUI.chip,
  },
  sheetAvatar: { width: 48, height: 48, borderRadius: 24 },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: RNUI.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetInput: { flex: 1, minHeight: 72, fontSize: 16, fontFamily: FontFamily.regular, color: '#FFFFFF', textAlignVertical: 'top', paddingTop: 4 },
  counter: { alignSelf: 'flex-end', fontSize: 12, fontFamily: FontFamily.regular, color: RNUI.meta, marginTop: 6 },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
    marginTop: 8,
  },
  hostLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hostLabel: { fontSize: 16, fontFamily: FontFamily.semibold, fontWeight: '600', color: '#FFFFFF' },
  sectionLabel: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: RNUI.meta,
    marginTop: 18,
    marginBottom: 10,
  },
  catRow: { gap: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 38,
    marginRight: 8,
  },
  catText: { fontSize: 14, fontFamily: FontFamily.semibold, fontWeight: '600' },
  durRow: { flexDirection: 'row', gap: 8 },
  durChip: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  durText: { fontSize: 14, fontFamily: FontFamily.bold, fontWeight: '700' },
  startBtn: {
    height: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    backgroundColor: RNUI.purple,
  },
  startText: { color: '#fff', fontSize: 17, fontFamily: DisplayFont.bold, fontWeight: '800' },
});
