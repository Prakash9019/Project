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
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme, FontFamily, DisplayFont, type AppTheme } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { ListSkeleton } from '../../src/components/Skeleton';
import { RightNowIcon } from '../../src/components/icons';
import { showError, showSuccess, toastApiError } from '../../src/lib/toast';
import { minutesAgoLabel, expiresInLabel } from '../../src/lib/format';
import { getRightNow, updateProfile, startConversation, ApiError } from '../../src/services/api';
import type { RightNowCategory, RightNowCard, Self } from '../../src/types/api';

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

type FilterKey = 'distance' | 'hosting' | 'position' | 'age';

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
  const [confirmOff, setConfirmOff] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    distance: false, hosting: false, position: false, age: false,
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
    if (filters.hosting) list = list.filter((u) => isHostingStatus(u.rightNowStatus, u.rightNowCategory));
    if (filters.position) list = list.filter((u) => !!u.preferences?.trim());
    if (filters.age) {
      list = [...list].sort((a, b) => (a.age ?? 999) - (b.age ?? 999));
    } else {
      list.sort((a, b) => {
        const da = parseDistanceMeters(a.distanceLabel, a.distanceMeters);
        const db = parseDistanceMeters(b.distanceLabel, b.distanceMeters);
        return distanceDesc ? db - da : da - db;
      });
    }
    if (myRow) list = [myRow, ...list];
    return list;
  }, [feed, filters, distanceDesc, myRow, user?.id]);

  const toggleFilter = (key: FilterKey) => {
    if (key === 'distance') {
      setDistanceDesc((d) => !d);
      setFilters((f) => ({ ...f, distance: true, age: false }));
      return;
    }
    if (key === 'age') {
      setFilters((f) => ({ ...f, age: !f.age }));
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

  const turnOff = async () => {
    setConfirmOff(false);
    setSheetOpen(false);
    const patch = { rightNowStatus: null, rightNowCategory: null, rightNowExpiresAt: null };
    try {
      const updated = await updateProfile(patch);
      setUser(updated);
    } catch {
      if (user) setUser({ ...user, ...patch });
    }
    load(true);
  };

  const styles = makeStyles(theme);
  const FILTER_CHIPS: { key: FilterKey; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'distance', label: 'Distance', icon: 'swap-vertical' },
    { key: 'hosting', label: 'Hosting' },
    { key: 'position', label: 'Position' },
    { key: 'age', label: 'Age' },
  ];

  const renderRow = ({ item }: { item: RightNowCard }) => {
    const isMe = item.id === user?.id;
    const online = item.activity?.online ?? item.lastActiveAt?.toLowerCase() === 'online';
    const joinedAgo = minutesAgoLabel(item.rightNowJoinedAt ?? null);
    const showHostBadge = isHostingStatus(item.rightNowStatus, item.rightNowCategory);
    const myExpiresLabel = isMe ? expiresInLabel(item.rightNowExpiresAt ?? null) : null;

    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
        onPress={() => (isMe ? setSheetOpen(true) : router.push({ pathname: '/profile/[id]', params: { id: item.id } }))}
      >
        <View style={styles.avatarWrap}>
          {item.profilePhoto ? (
            <Image source={{ uri: item.profilePhoto }} style={styles.avatar} contentFit="cover" transition={120} cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.avatar, styles.center, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="person" size={22} color={theme.textTertiary} />
            </View>
          )}
          {online && (
            <View style={styles.onlineDot}>
              <View style={styles.onlineInner} />
            </View>
          )}
        </View>

        <View style={styles.rowBody}>
          {isMe ? (
            // Right Now status is a plain user field with no moderation gate —
            // it's live the instant PATCH /me returns. Show it immediately;
            // no "under review" state (there is no backend review queue).
            <>
              <Text style={styles.statusLine} numberOfLines={2}>{item.rightNowStatus ?? 'Right now'}</Text>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="radio-button-on" size={12} color={theme.rightNow} />
                  <Text style={[styles.metaText, { color: theme.rightNow }]}>
                    Live{myExpiresLabel ? ` · ${myExpiresLabel}` : ''}
                  </Text>
                </View>
                {showHostBadge && (
                  <View style={styles.hostBadge}>
                    <Ionicons name="home" size={10} color="#fff" />
                  </View>
                )}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.statusLine} numberOfLines={2}>{item.rightNowStatus ?? 'Right now'}</Text>
              <View style={styles.metaRow}>
                {!!joinedAgo && (
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={13} color={theme.textTertiary} />
                    <Text style={styles.metaText}>{joinedAgo}</Text>
                  </View>
                )}
                {!!item.distanceLabel && (
                  <View style={[styles.metaItem, styles.metaSpaced]}>
                    <Ionicons name="paper-plane-outline" size={13} color={theme.textTertiary} />
                    <Text style={styles.metaText}>{item.distanceLabel}</Text>
                  </View>
                )}
                {showHostBadge && (
                  <View style={styles.hostBadge}>
                    <Ionicons name="home" size={10} color="#fff" />
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        {!isMe && (
          <Pressable hitSlop={12} style={styles.msgBtn} onPress={() => openChat(item.id, item.firstName ?? 'Someone')}>
            <Ionicons name="chatbubble-outline" size={22} color={theme.textTertiary} />
          </Pressable>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.title}>Right Now</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsRow}
      >
        {FILTER_CHIPS.map((c) => {
          // Distance is the default sort mode (active whenever Age isn't), so
          // it stays highlighted and its icon flips to show the current
          // ascending/descending direction on each tap.
          const on = c.key === 'distance' ? !filters.age : filters[c.key];
          const icon = c.key === 'distance' ? (distanceDesc ? 'arrow-down' : 'arrow-up') : c.icon;
          return (
            <Pressable
              key={c.key}
              onPress={() => toggleFilter(c.key)}
              style={[styles.chip, { backgroundColor: on ? theme.brand : theme.surfaceElevated }]}
            >
              {icon && <Ionicons name={icon} size={16} color={on ? '#fff' : theme.textPrimary} />}
              <Text style={[styles.chipText, { color: on ? '#fff' : theme.textPrimary }]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={displayed}
        keyExtractor={(it) => it.id}
        renderItem={renderRow}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 130, flexGrow: displayed.length === 0 ? 1 : 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.rightNow} />}
        ListHeaderComponent={
          !introDismissed ? (
            <View style={styles.intro}>
              <View style={styles.introIcon}>
                <RightNowIcon size={24} color="#fff" solid />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.introText}>
                  Introducing the Right Now feed. Skip the small talk and get to it. Turn on Right Now to add your own post.
                </Text>
                <View style={styles.introActions}>
                  <Pressable hitSlop={8}><Text style={styles.introLearn}>Learn More</Text></Pressable>
                  <Pressable hitSlop={8} onPress={() => setIntroDismissed(true)}>
                    <Text style={styles.introDismiss}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <RightNowIcon size={26} color="#fff" solid />
              </View>
              <Text style={styles.emptyTitle}>Nothing happening yet</Text>
              <Text style={styles.emptyBody}>{error ?? "Be the first to post what you're up to right now."}</Text>
            </View>
          )
        }
      />
      {loading && displayed.length === 0 ? <View style={styles.skeletonWrap}><ListSkeleton /></View> : null}

      {/* Floating create button */}
      <View style={styles.fabRow} pointerEvents="box-none">
        <Pressable style={styles.fabPill} onPress={() => setSheetOpen(true)}>
          <Text style={styles.fabPillText}>Right Now</Text>
        </Pressable>
        <Pressable style={styles.fab} onPress={() => setSheetOpen(true)}>
          <RightNowIcon size={26} color="#fff" solid />
        </Pressable>
      </View>

      <CreateSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        user={user}
        theme={theme}
        isActive={myActive}
        initialStatus={myStatus ?? ''}
        initialCategory={user?.rightNowCategory ?? null}
        expiresAt={user?.rightNowExpiresAt ?? null}
        onRequestTurnOff={() => setConfirmOff(true)}
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

      {/* Turn Off confirmation */}
      <Modal visible={confirmOff} transparent animationType="slide" onRequestClose={() => setConfirmOff(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setConfirmOff(false)}>
          <Pressable style={styles.confirmSheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.confirmTitle}>Turn Off Right Now?</Text>
            <Text style={styles.confirmBody}>
              Your session timer will keep running, but you'll no longer appear in Right Now.
            </Text>
            <Pressable style={styles.turnOffBtn} onPress={turnOff}>
              <Text style={styles.turnOffText}>Turn Off</Text>
            </Pressable>
            <Pressable style={styles.nevermindBtn} onPress={() => setConfirmOff(false)}>
              <Text style={styles.nevermindText}>Nevermind</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function CreateSheet({
  visible,
  onClose,
  user,
  theme,
  isActive,
  initialStatus,
  initialCategory,
  expiresAt,
  onRequestTurnOff,
  onPosted,
  onLocalPost,
}: {
  visible: boolean;
  onClose: () => void;
  user: Self | null;
  theme: AppTheme;
  isActive: boolean;
  initialStatus: string;
  initialCategory: RightNowCategory | null;
  expiresAt: string | null;
  onRequestTurnOff: () => void;
  onPosted: (updated: Awaited<ReturnType<typeof updateProfile>>) => void;
  onLocalPost: (patch: { rightNowStatus: string; rightNowCategory: RightNowCategory; rightNowExpiresAt: string }) => void;
}) {
  const styles = makeStyles(theme);
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
    if (!status) { showError('Add a short status first'); return; }
    if (hosting && !status.toLowerCase().includes('host')) status = `Hosting — ${status}`;
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
  const canPost = text.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHead}>
              <Pressable hitSlop={10}>
                <Ionicons name="information-circle-outline" size={22} color={theme.textTertiary} />
              </Pressable>
              <View style={styles.sheetTitleWrap}>
                <Text style={styles.sheetTitle}>Right Now</Text>
                {isActive && pendingLeft ? (
                  <Text style={styles.sheetPending}>
                    <Text style={{ color: theme.rightNow }}>Active</Text> {pendingLeft}
                  </Text>
                ) : null}
              </View>
              {isActive ? (
                <Pressable onPress={onRequestTurnOff} style={[styles.masterSwitch, { backgroundColor: theme.rightNow }]}>
                  <View style={[styles.masterKnob, { transform: [{ translateX: 22 }] }]} />
                </Pressable>
              ) : (
                <Pressable hitSlop={10} onPress={onClose}>
                  <Ionicons name="close" size={24} color={theme.textTertiary} />
                </Pressable>
              )}
            </View>

            <View style={styles.inputCard}>
              <View>
                {user?.primaryPhotoUrl ? (
                  <Image source={{ uri: user.primaryPhotoUrl }} style={styles.sheetAvatar} contentFit="cover" transition={120} cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.sheetAvatar, styles.center, { backgroundColor: theme.backgroundTertiary }]}>
                    <Ionicons name="person" size={22} color={theme.textTertiary} />
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
                placeholderTextColor={theme.textTertiary}
                multiline
                style={styles.sheetInput}
              />
            </View>
            <Text style={styles.counter}>{text.length}/{MAX_CHARS}</Text>

            <View style={styles.hostRow}>
              <View style={styles.hostLeft}>
                <Ionicons name="home" size={20} color={theme.rightNow} />
                <Text style={styles.hostLabel}>Hosting</Text>
              </View>
              <Pressable onPress={() => setHosting((h) => !h)} style={[styles.masterSwitch, { backgroundColor: hosting ? theme.rightNow : theme.backgroundTertiary }]}>
                <View style={[styles.masterKnob, { transform: [{ translateX: hosting ? 22 : 2 }] }]} />
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
              {CATEGORIES.map((c) => {
                const on = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setCategory(on ? null : c.key)}
                    style={[styles.catChip, { backgroundColor: on ? theme.rightNow : theme.surfaceElevated }]}
                  >
                    <Ionicons name={c.icon} size={15} color={on ? '#fff' : theme.textSecondary} />
                    <Text style={[styles.catText, { color: on ? '#fff' : theme.textPrimary }]}>{c.label}</Text>
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
                    style={[styles.durChip, { backgroundColor: on ? theme.rightNow : theme.surfaceElevated }]}
                  >
                    <Text style={[styles.durText, { color: on ? '#fff' : theme.textPrimary }]}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={post}
              disabled={posting || !canPost}
              style={[styles.startBtn, { backgroundColor: canPost ? theme.rightNow : theme.backgroundTertiary }]}
            >
              {posting ? <ActivityIndicator color="#fff" /> : (
                <Text style={[styles.startText, { color: canPost ? '#fff' : theme.textTertiary }]}>
                  {isActive ? 'Save' : 'Start'}
                </Text>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    title: {
      fontSize: 26, fontFamily: DisplayFont.bold, fontWeight: '800', color: theme.textPrimary,
      paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, letterSpacing: -0.3,
    },
    chipsScroll: { flexGrow: 0, flexShrink: 0, height: 50 },
    chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16, height: 40 },
    chipText: { fontSize: 15, fontFamily: FontFamily.semibold, fontWeight: '600' },

    intro: { flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
    introIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.rightNow, alignItems: 'center', justifyContent: 'center' },
    introText: { fontSize: 17, fontFamily: FontFamily.semibold, fontWeight: '600', color: theme.textPrimary, lineHeight: 23 },
    introActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 28, marginTop: 12 },
    introLearn: { fontSize: 15, fontFamily: FontFamily.semibold, fontWeight: '600', color: theme.textTertiary },
    introDismiss: { fontSize: 15, fontFamily: FontFamily.bold, fontWeight: '700', color: theme.textPrimary },

    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14 },
    avatarWrap: { position: 'relative' },
    avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.surfaceElevated, overflow: 'hidden' },
    onlineDot: { position: 'absolute', right: -1, bottom: 0, width: 15, height: 15, borderRadius: 8, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' },
    onlineInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: theme.online },
    rowBody: { flex: 1, gap: 6, paddingRight: 4 },
    statusLine: { fontSize: 16, fontFamily: FontFamily.bold, fontWeight: '700', color: theme.textPrimary, lineHeight: 21 },
    metaRow: { flexDirection: 'row', alignItems: 'center' },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaSpaced: { marginLeft: 12 },
    metaText: { fontSize: 14, fontFamily: FontFamily.regular, color: theme.textTertiary },
    hostBadge: { marginLeft: 10, width: 18, height: 18, borderRadius: 5, backgroundColor: theme.rightNow, alignItems: 'center', justifyContent: 'center' },
    msgBtn: { paddingLeft: 6, paddingVertical: 6 },

    skeletonWrap: { position: 'absolute', top: 120, left: 0, right: 0 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.rightNow, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 16, fontFamily: DisplayFont.bold, fontWeight: '700', color: theme.textPrimary },
    emptyBody: { fontSize: 13, fontFamily: FontFamily.regular, textAlign: 'center', lineHeight: 19, color: theme.textTertiary },

    fabRow: { position: 'absolute', right: 16, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    fabPill: { backgroundColor: theme.surfaceElevated, borderRadius: 24, paddingHorizontal: 20, height: 48, alignItems: 'center', justifyContent: 'center' },
    fabPillText: { fontSize: 16, fontFamily: DisplayFont.bold, fontWeight: '700', color: theme.textPrimary },
    fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.rightNow, alignItems: 'center', justifyContent: 'center' },

    sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, backgroundColor: theme.surface },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, marginBottom: 16 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    sheetTitleWrap: { flex: 1, alignItems: 'center' },
    sheetTitle: { fontSize: 18, fontFamily: DisplayFont.bold, fontWeight: '800', color: theme.textPrimary },
    sheetPending: { fontSize: 13, fontFamily: FontFamily.regular, color: theme.textTertiary, marginTop: 2 },
    masterSwitch: { width: 52, height: 30, borderRadius: 15, justifyContent: 'center' },
    masterKnob: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff' },
    inputCard: { flexDirection: 'row', gap: 12, borderRadius: 14, padding: 14, alignItems: 'flex-start', backgroundColor: theme.surfaceElevated },
    sheetAvatar: { width: 48, height: 48, borderRadius: 24 },
    editBadge: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.rightNow, alignItems: 'center', justifyContent: 'center' },
    sheetInput: { flex: 1, minHeight: 72, fontSize: 16, fontFamily: FontFamily.regular, color: theme.textPrimary, textAlignVertical: 'top', paddingTop: 4 },
    counter: { alignSelf: 'flex-end', fontSize: 12, fontFamily: FontFamily.regular, color: theme.textTertiary, marginTop: 6 },
    hostRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border, marginTop: 8 },
    hostLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    hostLabel: { fontSize: 16, fontFamily: FontFamily.semibold, fontWeight: '600', color: theme.textPrimary },
    sectionLabel: { fontSize: 12, fontFamily: FontFamily.bold, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: theme.textTertiary, marginTop: 18, marginBottom: 10 },
    catRow: { gap: 8 },
    catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, height: 38, marginRight: 8 },
    catText: { fontSize: 14, fontFamily: FontFamily.semibold, fontWeight: '600' },
    durRow: { flexDirection: 'row', gap: 8 },
    durChip: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    durText: { fontSize: 14, fontFamily: FontFamily.bold, fontWeight: '700' },
    startBtn: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
    startText: { fontSize: 17, fontFamily: DisplayFont.bold, fontWeight: '800' },

    confirmSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, backgroundColor: theme.surface },
    confirmTitle: { fontSize: 22, fontFamily: DisplayFont.bold, fontWeight: '800', color: theme.textPrimary, marginTop: 8 },
    confirmBody: { fontSize: 16, fontFamily: FontFamily.regular, color: theme.textSecondary, lineHeight: 23, marginTop: 14 },
    turnOffBtn: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 26, backgroundColor: theme.rightNow },
    turnOffText: { fontSize: 17, fontFamily: DisplayFont.bold, fontWeight: '800', color: '#fff' },
    nevermindBtn: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 12, backgroundColor: theme.surfaceElevated },
    nevermindText: { fontSize: 17, fontFamily: DisplayFont.semibold, fontWeight: '700', color: theme.textPrimary },
  });
}
