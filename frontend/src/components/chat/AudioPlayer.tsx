import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, type AudioPlayer as ExpoAudioPlayer, type AudioStatus } from 'expo-audio';
import { useTheme, FontFamily, FontSize } from '../../theme';
import { parseVoiceAmplitudes } from '../../lib/audioAmplitude';

const WAVE_BARS = 30;
const SPEEDS = [1, 1.5, 2];

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Inline WhatsApp-style audio bubble player (play/pause, waveform, tap-to-seek,
 * duration, playback speed). Shared by 1:1 chat and group rooms so both behave
 * identically — rooms used to ship a reduced copy with no speed control.
 */
export function AudioPlayer({
  mediaUrl,
  isOwn,
  waveformSource,
  duration,
}: {
  mediaUrl: string;
  isOwn: boolean;
  /**
   * Encoded amplitude string used to draw the waveform. 1:1 chat stores it on the
   * message `caption`; rooms store it on `metadata`. Either is parsed the same way.
   */
  waveformSource?: string | null;
  /**
   * Server-recorded clip length in SECONDS. Without it the bubble reads "0:00"
   * until the audio has been loaded (which only happens on first play), because
   * expo-audio only reports a duration once the file is decoded.
   */
  duration?: number | null;
}) {
  const { theme } = useTheme();
  const playerRef = useRef<ExpoAudioPlayer | null>(null);
  const bars = useMemo(() => parseVoiceAmplitudes(waveformSource, WAVE_BARS), [waveformSource]);

  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [error, setError] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  // Measured width of the waveform track so tap-to-seek maps to the real bar
  // area instead of a hardcoded 150px (F58). Falls back to 150 until measured.
  const [waveWidth, setWaveWidth] = useState(150);

  useEffect(() => {
    return () => {
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

  const onStatus = (status: AudioStatus) => {
    if (!status.isLoaded) return;
    setDurationMs(status.duration * 1000);
    setPositionMs(status.currentTime * 1000);
    setPlaying(status.playing);
    if (status.didJustFinish) {
      setPlaying(false);
      playerRef.current?.pause();
      playerRef.current?.seekTo(0).catch(() => {});
    }
  };

  const load = () => {
    setLoading(true);
    setError(false);
    try {
      const player = createAudioPlayer(mediaUrl);
      player.addListener('playbackStatusUpdate', onStatus);
      playerRef.current = player;
      player.play();
      setLoading(false);
    } catch {
      setLoading(false);
      setError(true);
    }
  };

  const toggle = () => {
    if (error) return load();
    if (!playerRef.current) return load();
    if (playing) playerRef.current.pause();
    else playerRef.current.play();
  };

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    playerRef.current?.setPlaybackRate(SPEEDS[next], 'high');
  };

  const seekTo = (ratio: number) => {
    if (!playerRef.current || durationMs <= 0) return;
    playerRef.current.seekTo((ratio * durationMs) / 1000).catch(() => {});
  };

  const fg = isOwn ? '#fff' : theme.textPrimary;
  const track = isOwn ? 'rgba(255,255,255,0.35)' : theme.border;
  const fill = isOwn ? '#fff' : theme.brand;
  const iconColor = isOwn ? '#fff' : theme.brand;
  // Prefer the decoded duration once the file has loaded; fall back to the
  // server value so the length is correct from first paint.
  const knownDurationMs = durationMs > 0 ? durationMs : (duration ?? 0) * 1000;
  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const label = playing || positionMs > 0 ? fmt(positionMs) : fmt(knownDurationMs);

  if (error) {
    return (
      <Pressable style={styles.errorRow} onPress={load}>
        <Ionicons name="alert-circle-outline" size={20} color={fg} />
        <Text style={[styles.errorText, { color: fg }]}>Could not load audio · Retry</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable onPress={toggle} hitSlop={6}>
        {loading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={36} color={iconColor} />
        )}
      </Pressable>
      <Pressable
        style={styles.wave}
        onLayout={(e) => setWaveWidth(e.nativeEvent.layout.width)}
        onPress={(e) => seekTo(Math.min(1, Math.max(0, e.nativeEvent.locationX / waveWidth)))}
      >
        {bars.map((b, i) => {
          const active = i / WAVE_BARS <= progress;
          return (
            <View
              key={i}
              style={{ width: 2.5, height: 20 * b, borderRadius: 2, backgroundColor: active ? fill : track }}
            />
          );
        })}
      </Pressable>
      <Text style={[styles.time, { color: fg }]}>{label}</Text>
      <Pressable
        onPress={cycleSpeed}
        style={[styles.speedBtn, { backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : theme.brand + '22' }]}
      >
        <Text style={[styles.speedText, { color: fg }]}>{SPEEDS[speedIndex]}x</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 220, paddingVertical: 2 },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 24, width: 150 },
  time: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, width: 34, textAlign: 'right' },
  speedBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  speedText: { fontSize: FontSize.xs, fontFamily: FontFamily.semibold },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 200 },
  errorText: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },
});
