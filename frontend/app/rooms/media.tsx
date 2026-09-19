import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, FontFamily, DisplayFont, FontSize, spacing } from '../../src/theme';
import { listRoomMedia } from '../../src/services/api';
import { toastApiError } from '../../src/lib/toast';
import { MediaViewer, type MediaViewerImage } from '../../src/components/MediaViewer';
import type { RoomMessageCard } from '../../src/types/api';

const GAP = 2;
const TABS = ['media', 'links', 'documents'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { media: 'Media', links: 'Links', documents: 'Documents' };
const TAB_TYPE: Record<Tab, 'image' | 'link' | 'document'> = {
  media: 'image',
  links: 'link',
  documents: 'document',
};

function extractUrl(text: string): string | null {
  const m = text.match(/(https?:\/\/[^\s]+)|(www\.[^\s]+)/i);
  if (!m) return null;
  const raw = m[0];
  return raw.startsWith('http') ? raw : `https://${raw}`;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function fileNameOf(msg: RoomMessageCard): string {
  const stripped = (msg.content ?? '').replace(/^(📄|🎵)\s*/, '').trim();
  if (stripped) return stripped;
  const path = (msg.mediaUrl ?? '').split('?')[0];
  const last = path.split('/').pop();
  return last || 'Document';
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RoomMedia() {
  const { theme } = useTheme();
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { width } = useWindowDimensions();
  const cols = 3;
  const size = (width - GAP * (cols - 1)) / cols;

  const [tab, setTab] = useState<Tab>('media');
  // Cache per-tab results so switching tabs is instant after first load.
  const [data, setData] = useState<Record<Tab, RoomMessageCard[]>>({ media: [], links: [], documents: [] });
  const [loaded, setLoaded] = useState<Record<Tab, boolean>>({ media: false, links: false, documents: false });
  const [cursor, setCursor] = useState<Record<Tab, string | null>>({ media: null, links: null, documents: null });
  const [hasMore, setHasMore] = useState<Record<Tab, boolean>>({ media: false, links: false, documents: false });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const load = useCallback(
    async (which: Tab) => {
      if (!roomId) return;
      setLoading(true);
      try {
        const res = await listRoomMedia(String(roomId), { type: TAB_TYPE[which], limit: 50 });
        setData((prev) => ({ ...prev, [which]: res.media }));
        setLoaded((prev) => ({ ...prev, [which]: true }));
        setCursor((prev) => ({ ...prev, [which]: res.nextCursor }));
        setHasMore((prev) => ({ ...prev, [which]: res.hasMore }));
      } catch (e) {
        toastApiError(e, 'Could not load media');
      } finally {
        setLoading(false);
      }
    },
    [roomId],
  );

  const loadMore = useCallback(
    async (which: Tab) => {
      if (!roomId || loadingMore || !hasMore[which] || !cursor[which]) return;
      setLoadingMore(true);
      try {
        const res = await listRoomMedia(String(roomId), { type: TAB_TYPE[which], limit: 50, cursor: cursor[which]! });
        setData((prev) => ({ ...prev, [which]: [...prev[which], ...res.media] }));
        setCursor((prev) => ({ ...prev, [which]: res.nextCursor }));
        setHasMore((prev) => ({ ...prev, [which]: res.hasMore }));
      } catch (e) {
        toastApiError(e, 'Could not load more');
      } finally {
        setLoadingMore(false);
      }
    },
    [roomId, loadingMore, hasMore, cursor],
  );

  useEffect(() => {
    if (!loaded[tab]) load(tab);
  }, [tab, loaded, load]);

  const current = data[tab];

  const viewerImages = useMemo<MediaViewerImage[]>(
    () =>
      data.media
        .filter((m) => !!m.mediaUrl)
        .map((m) => ({
          uri: m.mediaUrl as string,
          senderId: m.senderId,
          senderName: m.sender.firstName ?? 'Someone',
          createdAt: m.createdAt,
        })),
    [data.media],
  );

  const openViewer = (mediaUrl: string) => {
    const idx = viewerImages.findIndex((e) => e.uri === mediaUrl);
    setViewerIndex(idx < 0 ? 0 : idx);
    setViewerOpen(true);
  };

  const renderFooter = () =>
    loadingMore ? (
      <View style={styles.footerLoading}>
        <ActivityIndicator color={theme.brand} />
      </View>
    ) : null;

  const emptyLabel =
    tab === 'media'
      ? { icon: 'image-outline' as const, text: 'No photos shared yet' }
      : tab === 'links'
        ? { icon: 'link-outline' as const, text: 'No links shared yet' }
        : { icon: 'document-outline' as const, text: 'No documents shared yet' };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Media, Links & Docs</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        {TABS.map((t) => {
          const active = tab === t;
          return (
            <Pressable key={t} style={styles.tabBtn} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, { color: active ? theme.textPrimary : theme.textTertiary }]}>
                {TAB_LABEL[t]}
              </Text>
              {active ? <View style={[styles.tabUnderline, { backgroundColor: theme.brand }]} /> : null}
            </Pressable>
          );
        })}
      </View>

      {loading && !loaded[tab] ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : current.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name={emptyLabel.icon} size={44} color={theme.textTertiary} />
          <Text style={[styles.empty, { color: theme.textTertiary }]}>{emptyLabel.text}</Text>
        </View>
      ) : tab === 'media' ? (
        <FlatList
          key="media-grid"
          data={current}
          numColumns={cols}
          keyExtractor={(m) => m.id}
          onEndReached={() => loadMore('media')}
          onEndReachedThreshold={0.4}
          ListFooterComponent={renderFooter}
          renderItem={({ item }) => (
            <Pressable onPress={() => item.mediaUrl && openViewer(item.mediaUrl)}>
              <Image
                source={{ uri: item.mediaUrl ?? undefined }}
                style={{ width: size, height: size, margin: GAP / 2, backgroundColor: theme.surfaceElevated }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </Pressable>
          )}
        />
      ) : tab === 'links' ? (
        <FlatList
          key="links-list"
          data={current}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingVertical: spacing.sm }}
          onEndReached={() => loadMore('links')}
          onEndReachedThreshold={0.4}
          ListFooterComponent={renderFooter}
          renderItem={({ item }) => {
            const url = extractUrl(item.content ?? '');
            if (!url) return null;
            const domain = domainOf(url);
            return (
              <Pressable style={styles.linkRow} onPress={() => Linking.openURL(url).catch(() => {})}>
                <Image
                  source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=64` }}
                  style={[styles.favicon, { backgroundColor: theme.surfaceElevated }]}
                  contentFit="contain"
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.linkDomain, { color: theme.textPrimary }]} numberOfLines={1}>
                    {domain}
                  </Text>
                  <Text style={[styles.linkUrl, { color: theme.textSecondary }]} numberOfLines={1}>
                    {url}
                  </Text>
                  <Text style={[styles.linkTime, { color: theme.textTertiary }]}>{timeLabel(item.createdAt)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          key="docs-list"
          data={current}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingVertical: spacing.sm }}
          onEndReached={() => loadMore('documents')}
          onEndReachedThreshold={0.4}
          ListFooterComponent={renderFooter}
          renderItem={({ item }) => (
            <Pressable
              style={styles.docRow}
              onPress={() => item.mediaUrl && Linking.openURL(item.mediaUrl).catch(() => {})}
            >
              <View style={[styles.docIcon, { backgroundColor: theme.brand + '22' }]}>
                <Ionicons name="document-text" size={22} color={theme.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {fileNameOf(item)}
                </Text>
                <Text style={[styles.linkTime, { color: theme.textTertiary }]}>{timeLabel(item.createdAt)}</Text>
              </View>
              <Ionicons name="download-outline" size={22} color={theme.textSecondary} />
            </Pressable>
          )}
        />
      )}

      <MediaViewer
        visible={viewerOpen}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  title: { fontSize: 18, fontFamily: DisplayFont.bold },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  tabUnderline: { height: 2, width: '60%', marginTop: 8, borderRadius: 2 },
  empty: { fontFamily: FontFamily.regular, fontSize: 15 },
  footerLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  favicon: { width: 40, height: 40, borderRadius: 8 },
  linkDomain: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  linkUrl: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 1 },
  linkTime: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  docIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docName: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
});
