import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont, spacing, radius } from '../../theme';

const TENOR_KEY = process.env.EXPO_PUBLIC_TENOR_API_KEY ?? '';
const GAP = 6;

export interface GifResult {
  id: string;
  url: string; // full gif to send
  preview: string; // tinygif preview
  aspect: number; // width / height
}

interface TenorMediaFormat {
  url: string;
  dims?: [number, number];
}
interface TenorItem {
  id: string;
  media_formats?: { gif?: TenorMediaFormat; tinygif?: TenorMediaFormat };
}

function mapResults(items: TenorItem[]): GifResult[] {
  return items
    .map((it) => {
      const gif = it.media_formats?.gif;
      const tiny = it.media_formats?.tinygif ?? gif;
      if (!gif?.url) return null;
      const dims = gif.dims ?? tiny?.dims ?? [1, 1];
      const aspect = dims[0] && dims[1] ? dims[0] / dims[1] : 1;
      return { id: it.id, url: gif.url, preview: tiny?.url ?? gif.url, aspect };
    })
    .filter((x): x is GifResult => x !== null);
}

/** Bottom-sheet Tenor GIF search + trending picker. */
export function GifPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (gif: GifResult) => void;
}) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const colWidth = (width - spacing.md * 2 - GAP) / 2;

  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGifs = useCallback(async (q: string) => {
    if (!TENOR_KEY) return;
    setLoading(true);
    setError(false);
    try {
      const base = q.trim()
        ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q.trim())}`
        : 'https://tenor.googleapis.com/v2/featured?';
      const url = `${base}&key=${TENOR_KEY}&limit=24&media_filter=gif,tinygif`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Tenor ${res.status}`);
      const json = (await res.json()) as { results?: TenorItem[] };
      setGifs(mapResults(json.results ?? []));
    } catch {
      setError(true);
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trending on open; refetch (debounced) as the query changes.
  useEffect(() => {
    if (!visible || !TENOR_KEY) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchGifs(query), query.trim() ? 400 : 0);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [visible, query, fetchGifs]);

  // Reset query each time the sheet is dismissed.
  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const configured = !!TENOR_KEY;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>GIFs</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          {configured ? (
            <>
              <View style={[styles.search, { backgroundColor: theme.surfaceElevated }]}>
                <Ionicons name="search" size={18} color={theme.textTertiary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search Tenor"
                  placeholderTextColor={theme.textTertiary}
                  style={[styles.searchInput, { color: theme.textPrimary }]}
                  autoCorrect={false}
                />
                {query.length > 0 ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
                  </Pressable>
                ) : null}
              </View>

              {loading ? (
                <View style={styles.center}>
                  <ActivityIndicator color={theme.brand} />
                </View>
              ) : (
                <FlashList
                  data={gifs}
                  masonry
                  numColumns={2}
                  keyExtractor={(g) => g.id}
                  contentContainerStyle={{ padding: spacing.md }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable onPress={() => onSelect(item)} style={{ margin: GAP / 2 }}>
                      <Image
                        source={{ uri: item.preview }}
                        style={{
                          width: colWidth,
                          height: colWidth / (item.aspect || 1),
                          borderRadius: radius.md,
                          backgroundColor: theme.surfaceElevated,
                        }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <Text style={[styles.empty, { color: theme.textTertiary }]}>
                      {error ? 'Could not load GIFs — check your connection' : 'No GIFs found'}
                    </Text>
                  }
                />
              )}

              <Text style={[styles.attribution, { color: theme.textTertiary }]}>Powered by Tenor</Text>
            </>
          ) : (
            <View style={styles.center}>
              <Ionicons name="film-outline" size={48} color={theme.textTertiary} />
              <Text style={[styles.placeholderTitle, { color: theme.textSecondary }]}>GIF support coming soon</Text>
              <Text style={[styles.placeholderBody, { color: theme.textTertiary }]}>
                Set EXPO_PUBLIC_TENOR_API_KEY in .env to enable GIF search.
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '75%', paddingBottom: spacing.md },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  title: { fontSize: 18, fontFamily: DisplayFont.bold },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 42, borderRadius: radius.lg, paddingHorizontal: spacing.md, marginHorizontal: spacing.md, marginTop: spacing.md },
  searchInput: { flex: 1, fontSize: 15, fontFamily: FontFamily.regular },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  empty: { textAlign: 'center', marginTop: spacing.xxxl, fontFamily: FontFamily.regular, fontSize: 15 },
  attribution: { textAlign: 'center', fontSize: 11, fontFamily: FontFamily.regular, paddingVertical: 4 },
  placeholderTitle: { fontSize: 16, fontFamily: FontFamily.semibold, textAlign: 'center' },
  placeholderBody: { fontSize: 13, fontFamily: FontFamily.regular, textAlign: 'center' },
});
