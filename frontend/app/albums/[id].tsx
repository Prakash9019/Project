import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { CustomAlert } from '../../src/components/CustomAlert';
import { useAlert } from '../../src/hooks/useAlert';
import { ShareAlbumSheet } from '../../src/components/ShareAlbumSheet';
import { getAlbum, getUserAlbum, uploadAlbumPhoto, ApiError } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import type { AlbumPhoto } from '../../src/types/api';

export default function AlbumDetail() {
  const { id, title, ownerId } = useLocalSearchParams<{ id: string; title?: string; ownerId?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { alertConfig, hideAlert, alertError } = useAlert();
  const { width } = useWindowDimensions();
  const tile = (width - 6) / 3;
  const me = useAuthStore((s) => s.user);

  const isOwnAlbum = !ownerId || ownerId === me?.id;

  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = isOwnAlbum ? await getAlbum(id) : await getUserAlbum(ownerId!, id);
      setPhotos(res.photos);
    } catch {
      /* surfaced via empty state */
    } finally {
      setLoading(false);
    }
  }, [id, ownerId, isOwnAlbum]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      orderedSelection: true,
    });
    if (res.canceled || res.assets.length === 0) return;
    setUploading(true);
    try {
      // Upload each selected photo in order, appending as each completes.
      for (const asset of res.assets) {
        const photo = await uploadAlbumPhoto(id, asset.uri);
        setPhotos((p) => [...p, photo]);
      }
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403) alertError('Limit reached', 'Upgrade for more photos per album.');
      else alertError('Upload failed', err.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>{title ?? 'Album'}</Text>
        {isOwnAlbum ? (
          <View style={styles.actions}>
            <Pressable onPress={() => setShareOpen(true)} hitSlop={10}>
              <Ionicons name="share-social-outline" size={22} color={theme.textPrimary} />
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/albums/edit', params: { id, title: title ?? '' } })} hitSlop={10}>
              <Ionicons name="create-outline" size={23} color={theme.textPrimary} />
            </Pressable>
          </View>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          numColumns={3}
          contentContainerStyle={{ gap: 3, flexGrow: photos.length === 0 ? 1 : undefined }}
          columnWrapperStyle={{ gap: 3 }}
          ListHeaderComponent={
            isOwnAlbum ? (
              <Pressable style={[styles.addRow, { backgroundColor: theme.surfaceElevated }]} onPress={add} disabled={uploading}>
                {uploading ? <ActivityIndicator color={theme.brand} /> : <Ionicons name="add" size={22} color={theme.brand} />}
                <Text style={[styles.addText, { color: theme.brand }]}>Add photos</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="image-outline" size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {isOwnAlbum ? 'No photos yet. Tap "Add photos".' : 'This album has no photos.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={{ width: tile, height: tile }} onPress={() => setViewer(item.url)}>
              <Image source={{ uri: item.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} cachePolicy="memory-disk" />
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewerRoot} onPress={() => setViewer(null)}>
          {viewer && <Image source={{ uri: viewer }} style={styles.viewerImg} contentFit="contain" />}
          <Pressable style={styles.viewerClose} onPress={() => setViewer(null)} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>

      <ShareAlbumSheet visible={shareOpen} onClose={() => setShareOpen(false)} albumId={id} albumTitle={title ?? 'Album'} />

      {alertConfig ? <CustomAlert visible onDismiss={hideAlert} {...alertConfig} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, gap: 12 },
  title: { fontSize: 18, fontFamily: DisplayFont.bold, fontWeight: '700', flex: 1, textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, marginHorizontal: 12, marginBottom: 10 },
  addText: { fontSize: 15, fontFamily: FontFamily.semibold, fontWeight: '600' },
  emptyBody: { fontSize: 14, fontFamily: FontFamily.regular, textAlign: 'center' },
  viewerRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', top: 54, right: 20 },
});
