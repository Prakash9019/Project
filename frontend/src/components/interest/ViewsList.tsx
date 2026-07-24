import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { RemoteImage } from '../RemoteImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { GridSkeleton } from '../Skeleton';
import { inboxDateLabel } from '../../lib/format';
import type { ProfileViewItem } from '../../services/api';
import type { UserCard } from '../../types/api';

/** Card sizing — cards are ~10% smaller than a full half-width tile. */
const GAP = 12;
const H_PAD = 12;

interface ViewsListProps {
  views: ProfileViewItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  canSeeViews: boolean;
  onRefresh: () => void;
  onUpgrade: () => void;
}

export function ViewsList({
  views,
  loading,
  refreshing,
  error,
  canSeeViews,
  onRefresh,
  onUpgrade,
}: ViewsListProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tile = (width - 36) / 2;

  const openProfile = (id: string) => router.push({ pathname: '/profile/[id]', params: { id } });

  const refresh = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />
  );

  if (loading && views.length === 0) return <GridSkeleton cols={2} />;

  if (!canSeeViews) {
    const cells = Array.from({ length: 6 }, (_, i) => i);
    return (
      <View style={{ flex: 1 }}>
        <FlatList
          data={pairs(cells)}
          keyExtractor={(_, i) => `lrow-${i}`}
          contentContainerStyle={{ paddingHorizontal: H_PAD, paddingBottom: 96 }}
          refreshControl={refresh}
          renderItem={({ item, index }) => (
            <View style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
              {item.map((n) => (
                <LockedTile
                  key={n}
                  theme={theme}
                  size={tile}
                  showUnlock={index === 0 && item[0] === n}
                  onPress={onUpgrade}
                />
              ))}
            </View>
          )}
        />
        <View style={styles.unlockBarWrap} pointerEvents="box-none">
          <Pressable style={[styles.unlockBar, { backgroundColor: theme.planGold }]} onPress={() => router.push('/(tabs)/store')}>
            <Text style={[styles.unlockBarText, { color: '#000' }]}>Unlock All With Gold</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (views.length === 0) {
    return (
      <EmptyState theme={theme} icon="eye-outline" title="No views yet"
        body={error ?? "When someone checks out your profile, they'll show up here."} />
    );
  }

  return (
    <FlatList
      data={pairs(views)}
      keyExtractor={(row) => row.map((v) => v.id).join('-')}
      refreshControl={refresh}
      contentContainerStyle={{ paddingHorizontal: H_PAD, paddingBottom: 24 }}
      renderItem={({ item }) => (
        <View style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
          {item.map((it) => (
            <Pressable key={it.id} onPress={() => openProfile(it.viewer.id)} style={{ width: tile, height: tile * 1.18 }}>
              <PersonCard theme={theme} card={it.viewer} timeAgo={inboxDateLabel(it.viewedAt)} />
            </Pressable>
          ))}
        </View>
      )}
    />
  );
}

function pairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

function PersonCard({ theme, card, timeAgo }: { theme: any; card: UserCard; timeAgo: string }) {
  return (
    <View style={[styles.viewerCard, { backgroundColor: theme.backgroundTertiary }]}>
      {card.profilePhoto ? (
        <RemoteImage source={{ uri: card.profilePhoto }} stableId={card.id} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
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
            <Text style={styles.freePillText}>GOLD</Text>
          </View>
        </View>
      )}
      <View style={styles.lockedBottom}>
        <Ionicons name="eye" size={13} color={theme.textSecondary} />
        <Text style={[styles.lockedTime, { color: theme.textSecondary }]}>—</Text>
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
  center: { alignItems: 'center', justifyContent: 'center' },
  viewerCard: { flex: 1, overflow: 'hidden' },
  viewerShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  viewerBottom: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  viewerName: { color: '#fff', fontSize: 15, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 },
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
