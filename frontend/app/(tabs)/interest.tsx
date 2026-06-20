import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import { GridSkeleton } from '../../src/components/Skeleton';
import { showError, showSuccess } from '../../src/lib/toast';
import { planAtLeast, relativeTime } from '../../src/lib/format';
import {
  getViews,
  getReceivedTaps,
  tapUser,
  ApiError,
  type ProfileViewItem,
  type TapItem,
} from '../../src/services/api';
import type { UserCard } from '../../src/types/api';

type Tab = 'views' | 'taps';

export default function Interest() {
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const plan = useAuthStore((s) => s.user?.plan ?? 'free');

  const canSeeViews = planAtLeast(plan, 'gold'); // whoViewedMe is a Gold+ perk

  const [tab, setTab] = useState<Tab>('views');
  const [views, setViews] = useState<ProfileViewItem[]>([]);
  const [taps, setTaps] = useState<TapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [tappedBack, setTappedBack] = useState<Set<string>>(new Set());
  const [tappingBack, setTappingBack] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      const [v, t] = await Promise.allSettled([getViews(), getReceivedTaps()]);
      if (v.status === 'fulfilled') setViews(v.value.views);
      else if (canSeeViews) setError((v.reason as ApiError)?.message ?? 'Could not load views');
      if (t.status === 'fulfilled') setTaps(t.value.taps);
      setLoading(false);
      setRefreshing(false);
    },
    [canSeeViews]
  );

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  const openProfile = (id: string) => router.push({ pathname: '/profile/[id]', params: { id } });

  const tapBack = async (sender: UserCard) => {
    if (tappingBack) return;
    setTappingBack(sender.id);
    try {
      await tapUser(sender.id); // POST /discovery/taps { userId: sender.id }
      setTappedBack((prev) => new Set(prev).add(sender.id));
      showSuccess('Tap sent', 'Tapped back');
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403 && err.code === 'interaction_limit_reached') setUpgradeOpen(true);
      else showError(err.message ?? 'Could not tap back');
    } finally {
      setTappingBack(null);
    }
  };

  const viewsCount = views.length;
  const tapsCount = taps.length;

  const TabButton = ({ value, label, count, dot }: { value: Tab; label: string; count: number; dot?: boolean }) => {
    const active = tab === value;
    return (
      <Pressable style={styles.tabBtn} onPress={() => setTab(value)}>
        <View style={styles.tabLabelRow}>
          {dot && <View style={[styles.tabDot, { backgroundColor: theme.error }]} />}
          <Text style={[styles.tabText, { color: active ? theme.textPrimary : theme.textTertiary }]}>
            {label}{count ? ` ${count}` : ''}
          </Text>
        </View>
        {active && <View style={[styles.tabUnderline, { backgroundColor: theme.textPrimary }]} />}
      </Pressable>
    );
  };

  const refresh = (
    <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.brand} />
  );

  const UnlockBar = ({ label }: { label: string }) => (
    <View style={styles.unlockBarWrap} pointerEvents="box-none">
      <Pressable style={[styles.unlockBar, { backgroundColor: theme.planGold }]} onPress={() => router.push('/(tabs)/store')}>
        <Text style={[styles.unlockBarText, { color: '#000' }]}>{label}</Text>
      </Pressable>
    </View>
  );

  /* ── VIEWS ── */
  const renderViews = () => {
    const GAP = 2;
    const tile = (width - GAP) / 2;

    if (loading) return <GridSkeleton cols={2} />;

    // Free / Premium → locked, blurred grid + unlock CTA.
    if (!canSeeViews) {
      const cells = Array.from({ length: 6 }, (_, i) => i);
      return (
        <View style={{ flex: 1 }}>
          <FlatList
            data={pairs(cells)}
            keyExtractor={(_, i) => `lrow-${i}`}
            contentContainerStyle={{ paddingBottom: 96 }}
            refreshControl={refresh}
            renderItem={({ item, index }) => (
              <View style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
                {item.map((n) => (
                  <LockedTile key={n} theme={theme} size={tile} showUnlock={index === 0 && item[0] === n} onPress={() => setUpgradeOpen(true)} />
                ))}
              </View>
            )}
          />
          <UnlockBar label="Unlock All With Unlimited" />
        </View>
      );
    }

    if (views.length === 0) {
      return (
        <EmptyState theme={theme} icon="eye-outline" title="No views yet"
          body="When someone checks out your profile, they'll show up here." />
      );
    }

    return (
      <FlatList
        data={pairs(views)}
        keyExtractor={(_, i) => `vrow-${i}`}
        refreshControl={refresh}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
            {item.map((it) => (
              <Pressable key={it.id} onPress={() => openProfile(it.viewer.id)} style={{ width: tile, height: tile * 1.18 }}>
                <PersonCard theme={theme} card={it.viewer} timeAgo={relativeTime(it.viewedAt)} />
              </Pressable>
            ))}
          </View>
        )}
      />
    );
  };

  /* ── TAPS (ungated server-side) ── */
  const renderTaps = () => {
    if (loading) return <GridSkeleton cols={2} />;

    if (taps.length === 0) {
      return (
        <EmptyState theme={theme} icon="flame-outline" title="No taps yet"
          body="Taps are a quick way to show interest. You'll see who tapped you here." />
      );
    }

    return (
      <FlatList
        data={taps}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 24 }}
        refreshControl={refresh}
        renderItem={({ item }) => {
          const s = item.sender;
          const didTapBack = tappedBack.has(s.id);
          return (
            <Pressable style={styles.tapRow} onPress={() => openProfile(s.id)}>
              {s.profilePhoto ? (
                <Image source={{ uri: s.profilePhoto }} style={[styles.tapThumb, { backgroundColor: theme.backgroundTertiary }]} contentFit="cover" />
              ) : (
                <View style={[styles.tapThumb, styles.center, { backgroundColor: theme.backgroundTertiary }]}>
                  <Ionicons name="person" size={32} color={theme.textTertiary} />
                </View>
              )}
              <View style={styles.tapMid}>
                <View style={styles.tapNameRow}>
                  <Text style={[styles.tapName, { color: theme.textPrimary }]} numberOfLines={1}>
                    {s.firstName ?? 'Someone'}{s.age ? `, ${s.age}` : ''}
                  </Text>
                  {s.isVerified && <Ionicons name="checkmark-circle" size={14} color={theme.info} />}
                </View>
                {!!s.distanceLabel && <Text style={[styles.tapMeta, { color: theme.textSecondary }]}>{s.distanceLabel}</Text>}
              </View>
              <View style={styles.tapRight}>
                <Text style={[styles.tapTime, { color: theme.textTertiary }]}>{relativeTime(item.createdAt)}</Text>
                <Pressable hitSlop={10} onPress={() => tapBack(s)} disabled={didTapBack || tappingBack === s.id}>
                  <Ionicons name="flame" size={26} color={didTapBack ? theme.brand : theme.brandSecondary} style={{ opacity: didTapBack ? 1 : 0.9 }} />
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Interest</Text>
      <View style={styles.tabs}>
        <TabButton value="views" label="Views" count={viewsCount} />
        <TabButton value="taps" label="Taps" count={tapsCount} dot={tapsCount > 0} />
      </View>

      {tab === 'views' ? renderViews() : renderTaps()}

      <UpgradeModal
        visible={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="See who's into you"
        message="Upgrade to Gold to see everyone who viewed your profile."
      />
    </SafeAreaView>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function pairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

function PersonCard({ theme, card, timeAgo }: { theme: any; card: UserCard; timeAgo: string }) {
  return (
    <View style={[styles.viewerCard, { backgroundColor: theme.backgroundTertiary }]}>
      {card.profilePhoto ? (
        <Image source={{ uri: card.profilePhoto }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Ionicons name="person" size={56} color={theme.textTertiary} />
        </View>
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.viewerShade} />
      <View style={styles.viewerBottom}>
        {(card.firstName || card.age) && (
          <Text style={styles.viewerName} numberOfLines={1}>
            {card.firstName ?? 'Someone'}{card.age ? `, ${card.age}` : ''}
          </Text>
        )}
        <View style={styles.viewerMetaRow}>
          <Ionicons name="eye" size={13} color="#fff" />
          <Text style={styles.viewerMeta} numberOfLines={1}>{timeAgo}</Text>
          {!!card.distanceLabel && <Text style={styles.viewerDist} numberOfLines={1}>{card.distanceLabel}</Text>}
        </View>
      </View>
    </View>
  );
}

function LockedTile({ theme, size, showUnlock, onPress }: { theme: any; size: number; showUnlock?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.locked, { width: size, height: size * 1.18, backgroundColor: theme.backgroundSecondary }]}>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Ionicons name="person" size={size * 0.4} color={theme.backgroundTertiary} />
      </View>
      {showUnlock && (
        <View style={[styles.unlockChip, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <Text style={styles.unlockChipText}>Unlock</Text>
          <View style={[styles.freePill, { backgroundColor: theme.planGold }]}>
            <Text style={styles.freePillText}>FREE</Text>
          </View>
        </View>
      )}
      <View style={styles.lockedBottom}>
        <Ionicons name="eye" size={13} color={theme.textSecondary} />
        <Text style={[styles.lockedTime, { color: theme.textSecondary }]}>Yesterday</Text>
      </View>
    </Pressable>
  );
}

function EmptyState({ theme, icon, title, body }: { theme: any; icon: any; title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={52} color={theme.textTertiary} />
      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },

  tabs: { flexDirection: 'row', marginBottom: 2 },
  tabBtn: { flex: 1, alignItems: 'center', paddingBottom: 10 },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  tabDot: { width: 8, height: 8, borderRadius: 4 },
  tabText: { fontSize: 16, fontWeight: '600' },
  tabUnderline: { height: 2, width: '70%', marginTop: 8, borderRadius: 2 },

  viewerCard: { flex: 1, overflow: 'hidden' },
  viewerShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  viewerBottom: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  viewerName: { color: '#fff', fontSize: 16, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 },
  viewerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  viewerMeta: { color: '#fff', fontSize: 12 },
  viewerDist: { color: '#E0E0E0', fontSize: 11, marginLeft: 'auto' },

  locked: { overflow: 'hidden' },
  unlockChip: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  unlockChipText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  freePill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  freePillText: { color: '#000', fontSize: 11, fontWeight: '800' },
  lockedBottom: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  lockedTime: { fontSize: 13, fontWeight: '600' },

  unlockBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 12, paddingHorizontal: 16 },
  unlockBar: { height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  unlockBarText: { fontSize: 17, fontWeight: '800' },

  tapRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tapThumb: { width: 88, height: 88, borderRadius: 14 },
  tapMid: { flex: 1, gap: 4 },
  tapNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tapName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  tapMeta: { fontSize: 15 },
  tapRight: { alignItems: 'flex-end', gap: 10 },
  tapTime: { fontSize: 13 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
