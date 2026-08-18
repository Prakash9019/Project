import { useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RemoteImage } from '../RemoteImage';
import { measureThumbnail } from '../../utils/measureThumbnail';
import type { ThumbnailLayout } from '../MediaViewer';
import { FontFamily } from '../../theme';

/** mm:ss for a duration in whole seconds. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A video message bubble: poster frame + centred play button + duration badge.
 *
 * Tapping opens the in-app MediaViewer player — video messages used to render as
 * a generic "Video · Tap to play" card that `Linking.openURL`'d the raw file,
 * kicking the user out of the app into a browser (audit item #22).
 *
 * `thumbnailUrl` is the poster frame generated client-side at send time. When it
 * is missing (a video sent before thumbnails existed) the tile falls back to a
 * neutral placeholder rather than trying to render the .mp4 as an image.
 */
export function VideoBubble({
  thumbnailUrl,
  duration,
  stableId,
  onPress,
  onLongPress,
}: {
  thumbnailUrl?: string | null;
  /** Playback length in seconds. */
  duration?: number | null;
  /** Stable cache key so a rotated signed URL doesn't re-download the poster. */
  stableId: string;
  /** Receives the poster's measured rect so the viewer can zoom out of it. */
  onPress: (layout?: ThumbnailLayout) => void;
  onLongPress?: (pageY?: number) => void;
}) {
  const posterRef = useRef<View>(null);
  return (
    <Pressable
      onPress={() => measureThumbnail(posterRef, onPress)}
      onLongPress={onLongPress ? (e) => onLongPress(e.nativeEvent.pageY) : undefined}
      delayLongPress={220}
    >
      {/* collapsable={false} keeps the node measurable on Android, which
          otherwise flattens layout-only views out of the native tree. */}
      <View ref={posterRef} collapsable={false} style={styles.videoBubble}>
        {thumbnailUrl ? (
          <RemoteImage
            source={{ uri: thumbnailUrl }}
            stableId={stableId}
            style={styles.poster}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View style={[styles.poster, styles.posterFallback]}>
            <Ionicons name="videocam" size={32} color="rgba(255,255,255,0.75)" />
          </View>
        )}

        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playCircle}>
            {/* Nudged right — a play triangle's optical centre sits left of its box. */}
            <Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        </View>

        {duration != null ? (
          <View style={styles.durationBadge} pointerEvents="none">
            <Ionicons name="videocam" size={11} color="#fff" />
            <Text style={styles.durationText}>{formatDuration(duration)}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  videoBubble: { position: 'relative', borderRadius: 12, overflow: 'hidden', width: 220 },
  poster: { width: 220, aspectRatio: 16 / 9 },
  posterFallback: { backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: { color: '#fff', fontSize: 12, fontFamily: FontFamily.semibold },
});
