import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native';
import { RemoteImage } from '../RemoteImage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { GridSkeleton } from '../Skeleton';
import { showError, showSuccess } from '../../lib/toast';
import { relativeTime } from '../../lib/format';
import { tapUser, ApiError, type TapItem } from '../../services/api';
import type { UserCard } from '../../types/api';

interface TapsListProps {
  taps: TapItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  /** Called when a tap-back hits the free-tier interaction limit (403). */
  onLimitReached: () => void;
}

export function TapsList({ taps, loading, refreshing, error, onRefresh, onLimitReached }: TapsListProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const [tappedBack, setTappedBack] = useState<Set<string>>(new Set());
  const [tappingBack, setTappingBack] = useState<string | null>(null);

  const openProfile = (id: string) => router.push({ pathname: '/profile/[id]', params: { id } });

  const tapBack = async (sender: UserCard) => {
    if (tappingBack) return;
    setTappingBack(sender.id);
    try {
      await tapUser(sender.id);
      setTappedBack((prev) => new Set(prev).add(sender.id));
      showSuccess('Tap sent', 'Tapped back');
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403 && err.code === 'interaction_limit_reached') onLimitReached();
      else showError(err.message ?? 'Could not tap back');
    } finally {
      setTappingBack(null);
    }
  };

  const refresh = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />
  );

  if (loading && taps.length === 0) return <GridSkeleton cols={2} />;

  if (taps.length === 0) {
    return (
      <EmptyState theme={theme} icon="flame-outline" title="No taps yet"
        body={error ?? "Taps are a quick way to show interest. You'll see who tapped you here."} />
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
              <RemoteImage source={{ uri: s.profilePhoto }} stableId={s.id} style={[styles.tapThumb, { backgroundColor: theme.backgroundTertiary }]} contentFit="cover" transition={120} />
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
  center: { alignItems: 'center', justifyContent: 'center' },
  tapRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tapThumb: { width: 80, height: 80, borderRadius: 14 },
  tapMid: { flex: 1, gap: 4 },
  tapNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tapName: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  tapMeta: { fontSize: 15 },
  tapRight: { alignItems: 'flex-end', gap: 10 },
  tapTime: { fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
