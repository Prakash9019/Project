import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { CustomAlert } from '../../src/components/CustomAlert';
import { useAlert } from '../../src/hooks/useAlert';
import { listAlbums, getSharedAlbums, deleteAlbum, type SharedAlbum } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import type { AlbumSummary, Plan } from '../../src/types/api';

/** Per-plan album cap (mirrors backend: free=1, premium=3, gold=5, platinum=∞). */
function albumLimit(plan: Plan): number | null {
  switch (plan) {
    case 'premium': return 3;
    case 'gold': return 5;
    case 'platinum': return null; // unlimited
    default: return 1;
  }
}

export default function MyAlbums() {
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const plan = useAuthStore((s) => s.user?.plan ?? 'free');
  const { alertConfig, hideAlert, showAlert, deleteConfirm } = useAlert();

  const GAP = 12;
  const PAD = 16;
  const tile = (width - PAD * 2 - GAP) / 2;
  const cardH = tile * 1.3;

  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [shared, setShared] = useState<SharedAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const limit = albumLimit(plan);
  const atLimit = limit != null && albums.length >= limit;

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const [mine, sh] = await Promise.all([listAlbums(), getSharedAlbums()]);
      setAlbums(mine.albums);
      setShared(sh.albums);
    } catch {
      /* surfaced via empty state */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onCreate = () => {
    if (atLimit) {
      showAlert({
        title: 'Album limit reached',
        message: `Your plan allows ${limit} album${limit === 1 ? '' : 's'}. Upgrade to create more.`,
        icon: 'lock-closed',
        iconColor: theme.warning,
        buttons: [
          { label: 'Not now', style: 'cancel', onPress: hideAlert },
          { label: 'Upgrade', style: 'default', onPress: () => { hideAlert(); router.push('/(tabs)/store'); } },
        ],
      });
      return;
    }
    router.push('/albums/create');
  };

  const openMenu = (album: AlbumSummary) => {
    showAlert({
      title: album.title,
      buttons: [
        {
          label: 'Edit album',
          onPress: () => { hideAlert(); router.push({ pathname: '/albums/edit', params: { id: album.id, title: album.title } }); },
        },
        {
          label: 'Delete album',
          style: 'destructive',
          onPress: () =>
            deleteConfirm(
              'album',
              async () => {
                setAlbums((a) => a.filter((x) => x.id !== album.id));
                deleteAlbum(album.id).catch(() => load());
              },
              'This permanently removes the album and its photos.',
            ),
        },
        { label: 'Cancel', style: 'cancel', onPress: hideAlert },
      ],
    });
  };

  const CreateTile = (
    <Pressable
      style={[styles.card, { width: tile, height: cardH, backgroundColor: theme.surfaceElevated }]}
      onPress={onCreate}
    >
      <View style={styles.createInner}>
        <View style={[styles.plusCircle, { backgroundColor: atLimit ? theme.backgroundTertiary : theme.brand }]}>
          <Ionicons name={atLimit ? 'lock-closed' : 'add'} size={26} color={atLimit ? theme.textTertiary : theme.textInverse} />
        </View>
        <Text style={[styles.createLabel, { color: theme.textPrimary }]}>Create album</Text>
      </View>
    </Pressable>
  );

  const AlbumCard = (item: AlbumSummary) => (
    <Pressable
      key={item.id}
      style={[styles.card, { width: tile, height: cardH, backgroundColor: theme.backgroundTertiary }]}
      onPress={() => router.push({ pathname: '/albums/[id]', params: { id: item.id, title: item.title } })}
    >
      {item.coverPhoto ? (
        <Image source={{ uri: item.coverPhoto.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} cachePolicy="memory-disk" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Ionicons name="images" size={34} color={theme.textTertiary} />
        </View>
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.scrim} />
      <Pressable style={styles.menuBtn} hitSlop={8} onPress={() => openMenu(item)}>
        <Ionicons name="ellipsis-vertical" size={16} color="#fff" />
      </Pressable>
      <View style={styles.cardBottom}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardCount}>{item.photoCount} item{item.photoCount === 1 ? '' : 's'}</Text>
      </View>
    </Pressable>
  );

  const SharedCard = (item: SharedAlbum) => (
    <Pressable
      key={item.id}
      style={[styles.card, { width: tile, height: cardH, backgroundColor: theme.backgroundTertiary }]}
      onPress={() => router.push({ pathname: '/albums/[id]', params: { id: item.id, title: item.title, ownerId: item.owner.id } })}
    >
      {item.coverPhoto ? (
        <Image source={{ uri: item.coverPhoto.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} cachePolicy="memory-disk" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Ionicons name="lock-closed" size={30} color={theme.textTertiary} />
        </View>
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.scrim} />
      <View style={styles.cardBottom}>
        <View style={styles.ownerRow}>
          {item.owner.profilePhoto ? (
            <Image source={{ uri: item.owner.profilePhoto }} style={styles.ownerAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.ownerAvatar, styles.center, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name="person" size={12} color="#fff" />
            </View>
          )}
          <Text style={styles.ownerName} numberOfLines={1}>{item.owner.firstName ?? 'Someone'}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardCount}>{item.photoCount} item{item.photoCount === 1 ? '' : 's'}</Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.screenTitle, { color: theme.textPrimary }]}>My Albums</Text>
          <Text style={[styles.limitText, { color: theme.textTertiary }]}>
            {albums.length} / {limit == null ? '∞' : limit} albums
          </Text>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={theme.textPrimary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.brand} />}
        >
          <View style={[styles.grid, { paddingHorizontal: PAD, gap: GAP }]}>
            {CreateTile}
            {albums.map(AlbumCard)}
          </View>

          {atLimit && (
            <Pressable style={styles.xtraBanner} onPress={() => router.push('/(tabs)/store')}>
              <LinearGradient colors={theme.gradientWarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.xtraInner}>
                <Ionicons name="sparkles" size={20} color={theme.textInverse} />
                <Text style={[styles.xtraText, { color: theme.textInverse }]}>Unlock Multiple Albums</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.textInverse} />
              </LinearGradient>
            </Pressable>
          )}

          <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>SHARED WITH ME</Text>
          {shared.length === 0 ? (
            <View style={styles.emptyShared}>
              <Ionicons name="folder-open-outline" size={40} color={theme.textTertiary} />
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>No albums shared with you yet.</Text>
            </View>
          ) : (
            <View style={[styles.grid, { paddingHorizontal: PAD, gap: GAP }]}>
              {shared.map(SharedCard)}
            </View>
          )}
        </ScrollView>
      )}

      {alertConfig ? <CustomAlert visible onDismiss={hideAlert} {...alertConfig} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14 },
  screenTitle: { fontSize: 24, fontFamily: DisplayFont.bold, fontWeight: '800' },
  limitText: { fontSize: 12, fontFamily: FontFamily.medium, marginTop: 2 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { borderRadius: 14, overflow: 'hidden', justifyContent: 'flex-end' },
  createInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  plusCircle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  createLabel: { fontSize: 14, fontFamily: FontFamily.semibold, fontWeight: '600' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  menuBtn: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  cardBottom: { padding: 12, gap: 2 },
  cardTitle: { color: '#fff', fontSize: 16, fontFamily: DisplayFont.bold, fontWeight: '700' },
  cardCount: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: FontFamily.regular },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  ownerAvatar: { width: 20, height: 20, borderRadius: 10 },
  ownerName: { color: '#fff', fontSize: 12, fontFamily: FontFamily.semibold, fontWeight: '600', flex: 1 },
  xtraBanner: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, overflow: 'hidden' },
  xtraInner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, height: 56 },
  xtraText: { flex: 1, fontSize: 16, fontFamily: DisplayFont.bold, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontFamily: FontFamily.bold, fontWeight: '800', letterSpacing: 0.8, marginTop: 26, marginBottom: 12, paddingHorizontal: 16 },
  emptyShared: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 10, paddingHorizontal: 32 },
  emptyBody: { fontSize: 14, fontFamily: FontFamily.regular, textAlign: 'center' },
});
