import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme';
import { listAlbums, createAlbum, ApiError } from '../../src/services/api';
import type { AlbumSummary } from '../../src/types/api';

export default function Albums() {
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const tile = (width - 48) / 2;

  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await listAlbums();
      setAlbums(res.albums);
      setError(null);
    } catch (e) {
      setError((e as ApiError).message ?? 'Could not load albums');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      await createAlbum(title.trim());
      setTitle('');
      setCreateOpen(false);
      load();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403) Alert.alert('Limit reached', 'Upgrade your plan for more albums.');
      else Alert.alert('Could not create album', err.message ?? 'Try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Albums</Text>
        <Pressable onPress={() => setCreateOpen(true)} hitSlop={12}>
          <Ionicons name="add" size={26} color={theme.brand} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <FlatList
          data={albums}
          keyExtractor={(a) => a.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 16, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 16, paddingVertical: 16 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="images-outline" size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No albums yet</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>{error ?? 'Create your first album.'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.album, { width: tile, height: tile * 1.1, backgroundColor: theme.backgroundTertiary }]}
              onPress={() => router.push({ pathname: '/albums/[id]', params: { id: item.id, title: item.title } })}
            >
              {item.coverPhoto ? (
                <Image source={{ uri: item.coverPhoto.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.center]}>
                  <Ionicons name="images" size={32} color={theme.textTertiary} />
                </View>
              )}
              <View style={styles.albumShade} />
              <View style={styles.albumBottom}>
                <Text style={styles.albumName} numberOfLines={1}>{item.title}</Text>
                <View style={styles.countTag}>
                  <Ionicons name="images" size={12} color="#fff" />
                  <Text style={styles.count}>{item.photoCount}</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>New album</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Album title"
              placeholderTextColor={theme.textTertiary}
              maxLength={50}
              style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.textPrimary }]}
            />
            <Pressable style={[styles.createBtn, { backgroundColor: title.trim() ? theme.brand : theme.callDisabled }]} onPress={create} disabled={!title.trim() || creating}>
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createText}>Create</Text>}
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => setCreateOpen(false)}>
              <Text style={{ color: theme.textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  album: { borderRadius: 14, overflow: 'hidden', justifyContent: 'flex-end' },
  albumShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', backgroundColor: 'rgba(0,0,0,0.45)' },
  albumBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  albumName: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1, textShadowColor: '#000', textShadowRadius: 4 },
  countTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  count: { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', borderRadius: 18, padding: 22, alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '800' },
  input: { width: '100%', height: 50, borderRadius: 12, paddingHorizontal: 16, marginTop: 16, fontSize: 16 },
  createBtn: { width: '100%', height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  createText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancel: { marginTop: 14 },
});
