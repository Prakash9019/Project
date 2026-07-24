import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont, spacing, radius } from '../../theme';
import { AppBottomSheet, BottomSheetTextInput } from '../ui/AppBottomSheet';

const SNAP_POINTS = ['75%'];

// Strip any surrounding quotes — a quote-wrapped value in .env would otherwise
// travel into the request path and KLIPY rejects it as an invalid key.
const KLIPY_KEY = (process.env.EXPO_PUBLIC_KLIPY_API_KEY ?? '').replace(/^["']|["']$/g, '');
const GAP = 6;

export interface GifResult {
  id: string;
  url: string; // full gif to send
  preview: string; // thumbnail preview
  aspect: number; // width / height
}

// Raw KLIPY API response shapes. Each item's media lives under
// `file.<size>.<format>` (e.g. file.md.gif.url); the list itself is wrapped as
// { result, data: { data: [...] } }. We also tolerate a couple of legacy/flat
// shapes so a KLIPY response tweak degrades gracefully instead of showing empty.
interface KlipyMediaFormat {
  url: string;
  width: number;
  height: number;
  size?: number;
}
type KlipyFileSize = { gif?: KlipyMediaFormat; webp?: KlipyMediaFormat; jpg?: KlipyMediaFormat };
interface KlipyGifItem {
  id?: string | number;
  title?: string;
  slug?: string;
  file?: { hd?: KlipyFileSize; md?: KlipyFileSize; sm?: KlipyFileSize; xs?: KlipyFileSize };
  // Legacy/flat fallbacks.
  gif?: KlipyMediaFormat;
  preview?: KlipyMediaFormat;
  url?: string;
}
interface KlipyResponse {
  result?: boolean;
  data?: { data?: KlipyGifItem[] } | KlipyGifItem[];
}

// Choose a mid-size gif to send and a small one to preview. Falls back across
// sizes and finally to any legacy/flat url so we never drop a renderable item.
function pickFormats(item: KlipyGifItem): { full?: KlipyMediaFormat; preview?: KlipyMediaFormat } {
  const f = item.file;
  if (f) {
    const full = f.md?.gif ?? f.hd?.gif ?? f.sm?.gif ?? f.xs?.gif;
    const preview = f.sm?.gif ?? f.xs?.gif ?? f.md?.gif ?? full;
    if (full) return { full, preview };
  }
  if (item.gif?.url) return { full: item.gif, preview: item.preview ?? item.gif };
  if (item.url) return { full: { url: item.url, width: 0, height: 0 } };
  return {};
}

function adaptKlipyGif(item: KlipyGifItem): GifResult | null {
  const { full, preview } = pickFormats(item);
  if (!full?.url) return null;
  const width = preview?.width || full.width;
  const height = preview?.height || full.height;
  return {
    id: String(item.id ?? item.slug ?? full.url),
    url: full.url,
    preview: preview?.url ?? full.url,
    aspect: width && height ? width / height : 1,
  };
}

function extractItems(json: KlipyResponse): KlipyGifItem[] | null {
  if (Array.isArray(json.data)) return json.data;
  if (json.data && Array.isArray(json.data.data)) return json.data.data;
  return null;
}

function mapResults(items: KlipyGifItem[]): GifResult[] {
  return items.map(adaptKlipyGif).filter((g): g is GifResult => g !== null);
}

/** Bottom-sheet KLIPY GIF search + trending picker. */
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
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGifs = useCallback(async (q: string) => {
    if (!KLIPY_KEY) return;
    setLoading(true);
    setError(null);
    try {
      const url = q.trim()
        ? `https://api.klipy.com/api/v1/${KLIPY_KEY}/gifs/search?q=${encodeURIComponent(q.trim())}`
        : `https://api.klipy.com/api/v1/${KLIPY_KEY}/gifs/trending`;

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
      } catch (networkError: unknown) {
        const message = networkError instanceof Error ? networkError.message : 'Unknown error';
        if (message.includes('Abort') || message.toLowerCase().includes('timeout')) {
          throw new Error('Request timed out. Check your internet connection.');
        }
        throw new Error(`Network error: ${message}`);
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Invalid KLIPY API key. Check EXPO_PUBLIC_KLIPY_API_KEY in .env');
        }
        if (res.status === 429) {
          throw new Error('Rate limit exceeded. Please wait before searching again.');
        }
        if (res.status >= 500) {
          throw new Error(`KLIPY server error (${res.status}). Try again later.`);
        }
        if (__DEV__) console.warn('[GifPicker]', res.status, url.replace(KLIPY_KEY, '***'));
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }

      let json: KlipyResponse;
      try {
        json = (await res.json()) as KlipyResponse;
      } catch {
        throw new Error('Invalid response from KLIPY. Could not parse JSON.');
      }
      const items = extractItems(json);
      if (!items) {
        throw new Error('Unexpected KLIPY response format.');
      }
      setGifs(mapResults(items));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load GIFs');
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trending on open; refetch (debounced) as the query changes.
  useEffect(() => {
    if (!visible || !KLIPY_KEY) return;
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

  const configured = !!KLIPY_KEY;

  return (
    // Fixed-height sheet; content-panning is disabled so the masonry FlashList
    // scrolls freely (gorhom has no FlashList scrollable) — the handle still closes it.
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={SNAP_POINTS}
      enableContentPanningGesture={false}
    >
      <View style={styles.container}>
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
              <BottomSheetTextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search GIFs"
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
                  <View>
                    <Text style={[styles.empty, { color: theme.textTertiary }]}>
                      {error ? 'Could not load GIFs' : 'No GIFs found'}
                    </Text>
                    {error && __DEV__ ? (
                      <Text style={[styles.empty, { color: theme.textTertiary, marginTop: spacing.sm, fontSize: 12 }]}>
                        {error}
                      </Text>
                    ) : null}
                  </View>
                }
              />
            )}

            <Text style={[styles.attribution, { color: theme.textTertiary }]}>Powered by KLIPY</Text>
          </>
        ) : (
          <View style={styles.center}>
            <Ionicons name="film-outline" size={48} color={theme.textTertiary} />
            <Text style={[styles.placeholderTitle, { color: theme.textSecondary }]}>GIF support coming soon</Text>
            <Text style={[styles.placeholderBody, { color: theme.textTertiary }]}>
              Set EXPO_PUBLIC_KLIPY_API_KEY in .env to enable GIF search.
            </Text>
          </View>
        )}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: spacing.xs },
  title: { fontSize: 18, fontFamily: DisplayFont.bold },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 42, borderRadius: radius.lg, paddingHorizontal: spacing.md, marginHorizontal: spacing.md, marginTop: spacing.md },
  searchInput: { flex: 1, fontSize: 15, fontFamily: FontFamily.regular },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  empty: { textAlign: 'center', marginTop: spacing.xxxl, fontFamily: FontFamily.regular, fontSize: 15 },
  attribution: { textAlign: 'center', fontSize: 11, fontFamily: FontFamily.regular, paddingVertical: 4 },
  placeholderTitle: { fontSize: 16, fontFamily: FontFamily.semibold, textAlign: 'center' },
  placeholderBody: { fontSize: 13, fontFamily: FontFamily.regular, textAlign: 'center' },
});
