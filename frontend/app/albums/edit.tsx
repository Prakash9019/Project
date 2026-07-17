import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
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
import { relativeTime } from '../../src/lib/format';
import { showSuccess, toastApiError } from '../../src/lib/toast';
import {
  getAlbum,
  updateAlbum,
  deleteAlbum,
  uploadAlbumPhoto,
  removeAlbumPhoto,
  reorderAlbumPhotos,
  ApiError,
} from '../../src/services/api';
import type { AlbumPhoto } from '../../src/types/api';

export default function EditAlbum() {
  const { id, title: initialTitle } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { alertConfig, hideAlert, confirm, alertError, deleteConfirm } = useAlert();
  const { width } = useWindowDimensions();
  const cell = (width - 6) / 3;

  const [title, setTitle] = useState(initialTitle ?? '');
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [cover, setCover] = useState<AlbumPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reorderPick, setReorderPick] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [coverPicker, setCoverPicker] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const lastUpdated = photos.reduce<string | null>((acc, p) => (!acc || p.createdAt > acc ? p.createdAt : acc), null);

  const load = useCallback(async () => {
    try {
      const res = await getAlbum(id);
      setPhotos(res.photos);
      setCover(res.coverPhoto);
      setTitle((t) => t || res.title);
    } catch {
      /* empty state */
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const saveTitle = async () => {
    const t = title.trim();
    if (!t || t === initialTitle) return;
    try {
      await updateAlbum(id, { title: t });
    } catch (e) {
      toastApiError(e, 'Could not rename album');
    }
  };

  const addPhoto = async () => {
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

  const removePhoto = (photoId: string) => {
    confirm(
      'Remove photo',
      'Remove this photo from the album?',
      () => {
        setPhotos((p) => p.filter((x) => x.id !== photoId));
        removeAlbumPhoto(id, photoId).catch(() => load());
      },
      { destructive: true, confirmLabel: 'Remove', icon: 'trash', iconColor: theme.error },
    );
  };

  // Long-press one photo to "pick it up", tap another to swap → persist order.
  const onPhotoPress = (photo: AlbumPhoto) => {
    if (reorderPick) {
      if (reorderPick === photo.id) { setReorderPick(null); return; }
      setPhotos((prev) => {
        const from = prev.findIndex((x) => x.id === reorderPick);
        const to = prev.findIndex((x) => x.id === photo.id);
        if (from < 0 || to < 0) return prev;
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        reorderAlbumPhotos(id, next.map((p, i) => ({ photoId: p.id, order: i }))).catch(() => load());
        return next;
      });
      setReorderPick(null);
      return;
    }
    setViewer(photo.url);
  };

  const chooseCover = async (photo: AlbumPhoto) => {
    setCover(photo);
    setCoverPicker(false);
    try {
      await updateAlbum(id, { coverPhotoId: photo.id });
      showSuccess('Cover updated');
    } catch (e) {
      toastApiError(e, 'Could not set cover');
    }
  };

  const confirmDelete = () => {
    deleteConfirm(
      'album',
      async () => {
        try {
          await deleteAlbum(id);
          router.back();
        } catch (e) {
          toastApiError(e, 'Could not delete album');
        }
      },
      'This permanently removes the album and all its photos.',
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: theme.textPrimary }]}>Edit Album</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={theme.textPrimary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.topRow}>
            <Pressable style={[styles.coverCard, { backgroundColor: theme.surfaceElevated }]} onPress={() => photos.length && setCoverPicker(true)}>
              {cover ? (
                <Image source={{ uri: cover.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} blurRadius={2} />
              ) : null}
              <View style={styles.coverAvatar}>
                {cover ? (
                  <Image source={{ uri: cover.url }} style={styles.coverAvatarImg} contentFit="cover" />
                ) : (
                  <Ionicons name="person-circle" size={64} color={theme.textTertiary} />
                )}
              </View>
              <Text style={styles.coverTitle} numberOfLines={1}>{title}</Text>
              <View style={[styles.coverBadge, { backgroundColor: theme.overlay }]}>
                <Ionicons name="image" size={16} color="#fff" />
              </View>
            </Pressable>

            <View style={styles.nameCol}>
              <Text style={[styles.nameLabel, { color: theme.textTertiary }]}>Album Name</Text>
              <View style={styles.nameRow}>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  onEndEditing={saveTitle}
                  placeholder="Album Name"
                  placeholderTextColor={theme.textTertiary}
                  maxLength={50}
                  style={[styles.nameInput, { color: theme.textPrimary, borderBottomColor: theme.border }]}
                />
                <Ionicons name="pencil" size={18} color={theme.textTertiary} />
              </View>
              <Text style={[styles.hint, { color: theme.textTertiary }]}>Only you see the album name</Text>
              <Text style={[styles.meta, { color: theme.textTertiary }]}>{photos.length} item{photos.length === 1 ? '' : 's'}</Text>
              {lastUpdated ? <Text style={[styles.meta, { color: theme.textTertiary }]}>Last updated {relativeTime(lastUpdated)}</Text> : null}
              <Pressable style={[styles.sharedPill, { backgroundColor: theme.surfaceElevated }]} onPress={() => setShareOpen(true)}>
                <Ionicons name="people" size={18} color={theme.textPrimary} />
                <Text style={[styles.sharedText, { color: theme.textPrimary }]}>Shared with (0)</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.grid}>
            <Pressable style={[styles.cellBox, { width: cell, height: cell, backgroundColor: theme.surfaceElevated }]} onPress={addPhoto} disabled={uploading}>
              {uploading ? <ActivityIndicator color={theme.brand} /> : <Ionicons name="add" size={34} color={theme.textSecondary} />}
            </Pressable>
            {photos.map((p) => {
              const picked = reorderPick === p.id;
              return (
                <Pressable
                  key={p.id}
                  style={[styles.cellBox, { width: cell, height: cell }, picked && { opacity: 0.6, borderWidth: 2, borderColor: theme.brand }]}
                  onPress={() => onPhotoPress(p)}
                  onLongPress={() => setReorderPick(p.id)}
                >
                  <Image source={{ uri: p.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} cachePolicy="memory-disk" />
                  <Pressable style={[styles.trashBtn, { backgroundColor: theme.overlay }]} hitSlop={6} onPress={() => removePhoto(p.id)}>
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.caption, { color: theme.textTertiary }]}>
            {reorderPick ? 'Tap another photo to swap positions' : 'Tap to view · long-press to reorder'}
          </Text>

          <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
            <Ionicons name="trash-outline" size={18} color={theme.error} />
            <Text style={[styles.deleteText, { color: theme.error }]}>Delete Album</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Cover picker */}
      <Modal visible={coverPicker} transparent animationType="fade" onRequestClose={() => setCoverPicker(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={() => setCoverPicker(false)}>
          <Pressable style={[styles.pickerCard, { backgroundColor: theme.surface }]} onPress={() => {}}>
            <Text style={[styles.pickerTitle, { color: theme.textPrimary }]}>Choose cover photo</Text>
            <View style={styles.pickerGrid}>
              {photos.map((p) => (
                <Pressable key={p.id} onPress={() => chooseCover(p)} style={[styles.pickerCell, cover?.id === p.id && { borderWidth: 2, borderColor: theme.brand }]}>
                  <Image source={{ uri: p.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Photo viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewerRoot} onPress={() => setViewer(null)}>
          {viewer && <Image source={{ uri: viewer }} style={styles.viewerImg} contentFit="contain" />}
          <Pressable style={styles.viewerClose} onPress={() => setViewer(null)} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>

      <ShareAlbumSheet visible={shareOpen} onClose={() => setShareOpen(false)} albumId={id} albumTitle={title} />

      {alertConfig ? <CustomAlert visible onDismiss={hideAlert} {...alertConfig} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  screenTitle: { fontSize: 22, fontFamily: DisplayFont.bold, fontWeight: '700' },
  topRow: { flexDirection: 'row', gap: 20, paddingHorizontal: 20, marginTop: 8 },
  coverCard: { width: 128, height: 172, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverAvatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverAvatarImg: { width: 76, height: 76, borderRadius: 38 },
  coverTitle: { color: '#fff', fontSize: 15, fontFamily: DisplayFont.bold, fontWeight: '700', marginTop: 10, textShadowColor: '#000', textShadowRadius: 4 },
  coverBadge: { position: 'absolute', bottom: 10, alignSelf: 'center', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  nameCol: { flex: 1, paddingTop: 2 },
  nameLabel: { fontSize: 14, fontFamily: FontFamily.regular, marginBottom: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1, fontSize: 22, fontFamily: DisplayFont.regular, borderBottomWidth: 1, paddingBottom: 6 },
  hint: { fontSize: 13, fontFamily: FontFamily.regular, marginTop: 8 },
  meta: { fontSize: 13, fontFamily: FontFamily.regular, marginTop: 6 },
  sharedPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 999, marginTop: 14 },
  sharedText: { fontSize: 15, fontFamily: FontFamily.semibold, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 28, paddingHorizontal: 0 },
  cellBox: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  trashBtn: { position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 14, fontFamily: FontFamily.regular, paddingHorizontal: 20, marginTop: 14 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 32, paddingVertical: 12 },
  deleteText: { fontSize: 16, fontFamily: FontFamily.semibold, fontWeight: '600' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  pickerCard: { width: '100%', borderRadius: 18, padding: 18 },
  pickerTitle: { fontSize: 17, fontFamily: DisplayFont.bold, fontWeight: '700', marginBottom: 14 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickerCell: { width: 84, height: 84, borderRadius: 8, overflow: 'hidden' },
  viewerRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', top: 54, right: 20 },
});
