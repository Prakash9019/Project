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
import { listMessages } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { toastApiError } from '../../src/lib/toast';
import { MediaViewer, type MediaViewerImage } from '../../src/components/MediaViewer';
import type { Message } from '../../src/types/api';

const GAP = 2;
const TABS = ['media', 'links', 'documents'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { media: 'Media', links: 'Links', documents: 'Documents' };

type MediaEntry = { id: string; uri: string; senderId: string; createdAt: string };
type LinkEntry = { id: string; url: string; createdAt: string };
type DocEntry = { id: string; url: string; name: string; createdAt: string };

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
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ChatMedia() {
  const { theme } = useTheme();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const { id, peerName, tab: initialTab } = useLocalSearchParams<{ id: string; peerName?: string; tab?: string }>();
  const conversationId = String(id);
  const { width } = useWindowDimensions();
  const cols = 3;
  const size = (width - GAP * (cols - 1)) / cols;

  const [tab, setTab] = useState<Tab>(
    initialTab && (TABS as readonly string[]).includes(initialTab) ? (initialTab as Tab) : 'media',
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const res = await listMessages(conversationId, { limit: 100 });
      setMessages(res.messages);
    } catch (e) {
      toastApiError(e, 'Could not load media');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Client-side classification (inbox has no dedicated media endpoint).
  const media = useMemo<MediaEntry[]>(() => {
    const out: MediaEntry[] = [];
    messages.forEach((m) => {
      if (m.isUnsent || m.type !== 'photo' || m.viewOnce) return;
      const urls = m.mediaUrls.length ? m.mediaUrls : m.mediaUrl ? [m.mediaUrl] : [];
      urls.forEach((uri, i) => uri && out.push({ id: `${m.id}-${i}`, uri, senderId: m.senderId, createdAt: m.createdAt }));
    });
    return out;
  }, [messages]);

  const links = useMemo<LinkEntry[]>(() => {
    const out: LinkEntry[] = [];
    messages.forEach((m) => {
      if (m.isUnsent || m.type !== 'text' || !m.content) return;
      const url = extractUrl(m.content);
      if (url) out.push({ id: m.id, url, createdAt: m.createdAt });
    });
    return out;
  }, [messages]);

  const docs = useMemo<DocEntry[]>(() => {
    const out: DocEntry[] = [];
    messages.forEach((m) => {
      const url = m.mediaUrls[0];
      if (m.isUnsent || m.type !== 'text' || !url || !m.content) return;
      if (!m.content.startsWith('📄') && !m.content.startsWith('🎵')) return;
      out.push({ id: m.id, url, name: m.content.replace(/^(📄|🎵)\s*/, '') || 'File', createdAt: m.createdAt });
    });
    return out;
  }, [messages]);

  const viewerImages = useMemo<MediaViewerImage[]>(
    () =>
      media.map((e) => ({
        uri: e.uri,
        senderId: e.senderId,
        senderName: e.senderId === me?.id ? 'You' : peerName || 'Someone',
        createdAt: e.createdAt,
      })),
    [media, peerName, me?.id],
  );

  const openViewer = (uri: string) => {
    const idx = viewerImages.findIndex((e) => e.uri === uri);
    setViewerIndex(idx < 0 ? 0 : idx);
    setViewerOpen(true);
  };

  const count = tab === 'media' ? media.length : tab === 'links' ? links.length : docs.length;
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : count === 0 ? (
        <View style={styles.center}>
          <Ionicons name={emptyLabel.icon} size={44} color={theme.textTertiary} />
          <Text style={[styles.empty, { color: theme.textTertiary }]}>{emptyLabel.text}</Text>
        </View>
      ) : tab === 'media' ? (
        <FlatList
          key="media-grid"
          data={media}
          numColumns={cols}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => openViewer(item.uri)}>
              <Image
                source={{ uri: item.uri }}
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
          data={links}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingVertical: spacing.sm }}
          renderItem={({ item }) => {
            const domain = domainOf(item.url);
            return (
              <Pressable style={styles.linkRow} onPress={() => Linking.openURL(item.url).catch(() => {})}>
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
                    {item.url}
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
          data={docs}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingVertical: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable style={styles.docRow} onPress={() => Linking.openURL(item.url).catch(() => {})}>
              <View style={[styles.docIcon, { backgroundColor: theme.brand + '22' }]}>
                <Ionicons name="document-text" size={22} color={theme.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {item.name}
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
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  favicon: { width: 40, height: 40, borderRadius: 8 },
  linkDomain: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  linkUrl: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 1 },
  linkTime: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  docIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docName: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
});
