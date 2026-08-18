import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { RemoteImage } from '../RemoteImage';
import { useTheme, FontFamily } from '../../theme';

/** How long we wait for Open Graph metadata before giving up silently. */
const FETCH_TIMEOUT_MS = 3000;

type PreviewData = {
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string;
};

/**
 * Module-level cache — deliberately NOT state and NOT a store.
 *
 * Each URL is fetched at most once per app session, so scrolling a conversation
 * back and forth never re-hits the network, and every bubble quoting the same
 * link shares one result. `null` is cached too: a failed/timed-out lookup must
 * not be retried on every re-render.
 */
const previewCache = new Map<string, PreviewData | null>();

/** In-flight requests, so N bubbles with the same URL make ONE network call. */
const inFlight = new Map<string, Promise<PreviewData | null>>();

function domainOf(url: string): string {
  // No URL polyfill guarantees on RN — parse the host out directly.
  const m = url.match(/^https?:\/\/([^/?#]+)/i);
  return (m?.[1] ?? url).replace(/^www\./i, '');
}

async function fetchPreview(url: string): Promise<PreviewData | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // microlink.io resolves Open Graph metadata without an API key.
    const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      data?: { title?: string; description?: string; image?: { url?: string } | null; url?: string };
    };
    if (json.status !== 'success' || !json.data) return null;
    const { title, description, image } = json.data;
    // A card with no title AND no image is just a restatement of the URL.
    if (!title && !image?.url) return null;
    return {
      title: title ?? null,
      description: description ?? null,
      image: image?.url ?? null,
      domain: domainOf(json.data.url ?? url),
    };
  } catch {
    // Network error, non-JSON body, or the 3s abort — all fail silently.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function loadPreview(url: string): Promise<PreviewData | null> {
  const existing = inFlight.get(url);
  if (existing) return existing;
  const p = fetchPreview(url).then((data) => {
    previewCache.set(url, data);
    inFlight.delete(url);
    return data;
  });
  inFlight.set(url, p);
  return p;
}

/**
 * Rich Open Graph preview card rendered under a message's text.
 *
 * Renders nothing at all when the metadata is unavailable, times out, or the
 * link has no title/image — a failed lookup must never leave a broken shell in
 * the bubble. While loading it shows a single-line skeleton sized to the final
 * title row, so resolving the preview doesn't shift the message above it.
 */
export function LinkPreview({ url, isOwn }: { url: string; isOwn: boolean }) {
  const { theme } = useTheme();
  // Synchronously seed from cache so a re-render never re-flashes the skeleton.
  const cached = previewCache.get(url);
  const [data, setData] = useState<PreviewData | null | undefined>(cached);
  const [loading, setLoading] = useState(cached === undefined);

  useEffect(() => {
    if (previewCache.has(url)) {
      setData(previewCache.get(url));
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    loadPreview(url).then((result) => {
      if (!active) return;
      setData(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [url]);

  // Colors adapt to the bubble: own bubbles sit on the warm gradient.
  const surface = isOwn ? 'rgba(255,255,255,0.15)' : theme.backgroundTertiary;
  const accent = isOwn ? '#fff' : theme.brand;
  const titleColor = isOwn ? '#fff' : theme.textPrimary;
  const bodyColor = isOwn ? 'rgba(255,255,255,0.85)' : theme.textSecondary;
  const metaColor = isOwn ? 'rgba(255,255,255,0.7)' : theme.textTertiary;

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: surface, borderLeftColor: accent }]}>
        <View style={[styles.skeletonLine, { backgroundColor: metaColor, opacity: 0.35 }]} />
      </View>
    );
  }

  if (!data) return null;

  return (
    <Animated.View entering={FadeIn.duration(180)}>
      <Pressable
        onPress={() => Linking.openURL(url).catch(() => {})}
        style={[styles.card, { backgroundColor: surface, borderLeftColor: accent }]}
      >
        <View style={styles.body}>
          {data.title ? (
            <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
              {data.title}
            </Text>
          ) : null}
          {data.description ? (
            <Text style={[styles.description, { color: bodyColor }]} numberOfLines={2}>
              {data.description}
            </Text>
          ) : null}
          <Text style={[styles.domain, { color: metaColor }]} numberOfLines={1}>
            {data.domain}
          </Text>
        </View>
        {data.image ? (
          <RemoteImage
            source={{ uri: data.image }}
            stableId={`link-${data.image}`}
            style={styles.thumb}
            contentFit="cover"
            transition={120}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    // Keeps the card from stretching past the bubble on short messages.
    maxWidth: 260,
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontFamily: FontFamily.semibold },
  description: { fontSize: 12, fontFamily: FontFamily.regular, lineHeight: 16 },
  domain: { fontSize: 11, fontFamily: FontFamily.regular },
  thumb: { width: 80, height: 80, borderRadius: 6 },
  // One line, sized to the title row, so resolving the preview doesn't reflow.
  skeletonLine: { height: 14, borderRadius: 4, flex: 1 },
});
