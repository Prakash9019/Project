import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import {
  useInterestStore,
  viewFromSocket,
  tapFromSocket,
} from '../../src/store/interestStore';
import { connectSocket } from '../../src/services/socket';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import { ViewsList } from '../../src/components/interest/ViewsList';
import { TapsList } from '../../src/components/interest/TapsList';
import { planAtLeast } from '../../src/lib/format';
import type { UserCard } from '../../src/types/api';

type Tab = 'views' | 'taps';

export default function Interest() {
  const { theme } = useTheme();
  const me = useAuthStore((s) => s.user);
  const plan = me?.plan ?? 'free';
  const userId = me?.id ?? null;
  const canSeeViews = planAtLeast(plan, 'gold');

  const views = useInterestStore((s) => s.views);
  const taps = useInterestStore((s) => s.taps);
  const loading = useInterestStore((s) => s.loading);
  const refreshing = useInterestStore((s) => s.refreshing);
  const error = useInterestStore((s) => s.error);
  const fetchInterest = useInterestStore((s) => s.fetchInterest);
  const bumpView = useInterestStore((s) => s.bumpView);
  const bumpTap = useInterestStore((s) => s.bumpTap);
  const reset = useInterestStore((s) => s.reset);

  const [tab, setTab] = useState<Tab>('views');
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const load = useCallback(
    (isRefresh = false) => {
      if (!userId) return;
      fetchInterest(canSeeViews, isRefresh);
    },
    [userId, canSeeViews, fetchInterest]
  );

  // Reset + reload when the signed-in user changes.
  useEffect(() => {
    if (!userId) {
      reset();
      return;
    }
    load(false);
  }, [userId, canSeeViews, load, reset]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  // Refresh when app returns to foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load(true);
    });
    return () => sub.remove();
  }, [load]);

  // Realtime: bump rows to top when views/taps arrive.
  useEffect(() => {
    if (!userId) return;
    let cleanup = () => {};
    (async () => {
      const socket = await connectSocket();
      if (!socket) return;

      const onTap = (p: { tapId?: string; senderCard?: UserCard; createdAt?: string }) => {
        const row = tapFromSocket(p);
        if (row) bumpTap(row);
      };
      const onView = (p: { viewId?: string; viewerCard?: UserCard; viewedAt?: string }) => {
        if (!canSeeViews) return;
        const row = viewFromSocket(p);
        if (row) bumpView(row);
      };

      socket.on('tap.received', onTap);
      socket.on('profile.viewed', onView);
      cleanup = () => {
        socket.off('tap.received', onTap);
        socket.off('profile.viewed', onView);
      };
    })();
    return () => cleanup();
  }, [userId, canSeeViews, bumpTap, bumpView]);

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

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Interest</Text>
      <View style={styles.tabs}>
        <TabButton value="views" label="Views" count={canSeeViews ? views.length : 0} />
        <TabButton value="taps" label="Taps" count={taps.length} dot={taps.length > 0} />
      </View>

      {tab === 'views' ? (
        <ViewsList
          views={views}
          loading={loading}
          refreshing={refreshing}
          error={error}
          canSeeViews={canSeeViews}
          onRefresh={() => load(true)}
          onUpgrade={() => setUpgradeOpen(true)}
        />
      ) : (
        <TapsList
          taps={taps}
          loading={loading}
          refreshing={refreshing}
          error={error}
          onRefresh={() => load(true)}
          onLimitReached={() => setUpgradeOpen(true)}
        />
      )}

      <UpgradeModal
        visible={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="See who's into you"
        message="Upgrade to Gold to see everyone who viewed your profile."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { fontSize: 26, fontWeight: '800', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  tabs: { flexDirection: 'row', marginBottom: 2 },
  tabBtn: { flex: 1, alignItems: 'center', paddingBottom: 10 },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  tabDot: { width: 8, height: 8, borderRadius: 4 },
  tabText: { fontSize: 16, fontWeight: '600' },
  tabUnderline: { height: 2, width: '70%', marginTop: 8, borderRadius: 2 },
});
