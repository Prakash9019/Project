import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../src/theme';
import { getAlbum, addAlbumPhoto, removeAlbumPhoto, ApiError } from '../../src/services/api';
import type { AlbumPhoto } from '../../src/types/api';

export default function AlbumDetail() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const tile = (width - 6) / 3;

  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getAlbum(id);
      setPhotos(res.photos);
    } catch {
      /* surfaced via empty state */
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    setUploading(true);
    try {
      await addAlbumPhoto(id, res.assets[0].uri);
      load();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403) Alert.alert('Limit reached', 'Upgrade for more photos per album.');
      else Alert.alert('Upload failed', err.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  const remove = (photoId: string) => {
    Alert.alert('Remove photo', 'Remove this photo from the album?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setPhotos((p) => p.filter((x) => x.id !== photoId));
          removeAlbumPhoto(id, photoId).catch(() => load());
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>{title ?? 'Album'}</Text>
        <Pressable onPress={add} hitSlop={12} disabled={uploading}>
          {uploading ? <ActivityIndicator color={theme.brand} /> : <Ionicons name="add" size={26} color={theme.brand} />}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          numColumns={3}
          contentContainerStyle={{ gap: 3 }}
          columnWrapperStyle={{ gap: 3 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="image-outline" size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>No photos yet. Tap + to add.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={{ width: tile, height: tile }} onLongPress={() => remove(item.id)}>
              <Image source={{ uri: item.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  emptyBody: { fontSize: 14, textAlign: 'center' },
});
