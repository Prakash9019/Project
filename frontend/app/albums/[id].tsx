import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  useWindowDimensions,
  ActivityIndicator,
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
import { MediaViewer, type MediaViewerImage } from '../../src/components/MediaViewer';
import { getAlbum, getUserAlbum, uploadAlbumPhoto, addAlbumPhoto, ApiError } from '../../src/services/api';
import { generateAndUploadVideoThumbnail } from '../../src/utils/videoThumbnail';
import { uploadToR2 } from '../../src/utils/uploadToR2';
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
  const [cover, setCover] = useState<AlbumPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    setLocked(false);
    try {
      const res = isOwnAlbum ? await getAlbum(id) : await getUserAlbum(ownerId!, id);
      setPhotos(res.photos);
      setCover(res.coverPhoto);
    } catch (e) {
      if ((e as ApiError).status === 403) setLocked(true);
      /* other failures surfaced via empty state */
    } finally {
      setLoading(false);
    }
  }, [id, ownerId, isOwnAlbum]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: true,
      orderedSelection: true,
    });
    if (res.canceled || res.assets.length === 0) return;
    setUploading(true);
    try {
      // Upload each selected item in order, appending as each completes.
      for (const asset of res.assets) {
        if (asset.type === 'video') {
          const thumbnailUrl = (await generateAndUploadVideoThumbnail(asset.uri)) ?? undefined;
          const url = await uploadToR2(asset.uri, 'video', 'video/mp4');
          const photo = await addAlbumPhoto(id, url, { type: 'video', thumbnailUrl });
          setPhotos((p) => [...p, photo]);
        } else {
          const photo = await uploadAlbumPhoto(id, asset.uri);
          setPhotos((p) => [...p, photo]);
        }
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
      ) : locked ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>Start a conversation to unlock this album.</Text>
        </View>
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
          renderItem={({ item, index }) => {
            const isVideo = item.type === 'video';
            return (
              <Pressable style={{ width: tile, height: tile }} onPress={() => setViewerIndex(index)}>
                {isVideo && !item.thumbnailUrl ? (
                  <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.backgroundTertiary }]}>
                    <Ionicons name="videocam" size={26} color={theme.textTertiary} />
                  </View>
                ) : (
                  <Image source={{ uri: item.thumbnailUrl ?? item.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} cachePolicy="memory-disk" />
                )}
                {isVideo && (
                  <View style={styles.playBadge}>
                    <Ionicons name="play" size={13} color="#fff" />
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      <MediaViewer
        visible={viewerIndex !== null}
        images={photos.map((p): MediaViewerImage => ({
          uri: p.url,
          senderId: '',
          senderName: title ?? 'Album',
          createdAt: p.createdAt,
          kind: p.type === 'video' ? 'video' : 'image',
        }))}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />

      <ShareAlbumSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        albumId={id}
        albumTitle={title ?? 'Album'}
        coverPhotoUrl={cover?.url ?? null}
      />

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
  playBadge: { position: 'absolute', bottom: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});
