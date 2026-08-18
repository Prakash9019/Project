import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolation,
  FadeIn,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme, FontFamily } from '../../theme';

const BAR_COUNT = 28;
const MIN_BAR_HEIGHT = 4;
const MAX_BAR_HEIGHT = 28;

/**
 * Recording overlay: pulsing mic, a REAL live waveform driven by the mic
 * amplitude samples the parent feeds in (`amplitudes`, 0..1 — from the
 * recorder's metering, F60), mm:ss timer and a "slide to cancel" hint. Actual
 * capture/upload is wired by the parent. When `locked`, the finger has been
 * released and recording continues, so the slide-to-cancel hint is replaced by
 * a lock indicator.
 *
 * `panX` is the live horizontal drag from the parent's pan gesture: the cancel
 * hint fades UP and drifts left as the finger slides toward the cancel
 * threshold, instead of hard-cutting at it (F8 — "bind pan translation to
 * transforms").
 */
export function VoiceRecorder({
  cancelling,
  locked = false,
  amplitudes = [],
  panX,
}: {
  cancelling: boolean;
  locked?: boolean;
  amplitudes?: number[];
  /** Live pan translationX (≤ 0 while sliding left toward cancel). */
  panX?: SharedValue<number>;
}) {
  const { theme } = useTheme();
  const [seconds, setSeconds] = useState(0);

  // Right-align the newest samples: pad the left with silence so bars scroll in
  // from the right as the clip grows, then map each 0..1 sample to a bar height.
  const barColor = cancelling ? theme.error : theme.brand;
  const recent = amplitudes.slice(-BAR_COUNT);
  const padded = [...Array(Math.max(0, BAR_COUNT - recent.length)).fill(0), ...recent];

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.4, { duration: 700 }), -1, true);
  }, [pulse]);
  const micStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // The hint tracks the finger: it becomes fully opaque exactly as the cancel
  // threshold (-80) is reached, and drifts a few px left along the way. Falls
  // back to a plain always-visible hint if the parent doesn't supply `panX`.
  const fallbackX = useSharedValue(0);
  const dragX = panX ?? fallbackX;
  const hintStyle = useAnimatedStyle(() => ({
    opacity: panX ? interpolate(dragX.value, [0, -40, -80], [0.45, 0.75, 1], Extrapolation.CLAMP) : 1,
    transform: [{ translateX: interpolate(dragX.value, [0, -80], [0, -8], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={[styles.wrap, { backgroundColor: theme.surfaceElevated }]}>
      <Animated.View style={micStyle}>
        <Ionicons name="mic" size={22} color={theme.error} />
      </Animated.View>
      {/* Timer fades in rather than hard-cutting when recording starts. */}
      <Animated.Text entering={FadeIn.duration(200)} style={[styles.timer, { color: theme.textPrimary }]}>
        {mm}:{ss}
      </Animated.Text>
      <View style={styles.wave}>
        {padded.map((amp, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: MIN_BAR_HEIGHT + amp * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT),
                backgroundColor: barColor,
              },
            ]}
          />
        ))}
      </View>
      {locked ? (
        <View style={styles.cancelHint}>
          <Ionicons name="lock-closed" size={15} color={theme.brand} />
          <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Tap stop to send</Text>
        </View>
      ) : (
        <Animated.View style={[styles.cancelHint, hintStyle]}>
          <Ionicons name="chevron-back" size={16} color={cancelling ? theme.error : theme.textTertiary} />
          <Text style={[styles.cancelText, { color: cancelling ? theme.error : theme.textTertiary }]}>
            {cancelling ? 'Release to cancel' : 'Slide to cancel'}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderRadius: 22, paddingHorizontal: 14, flex: 1 },
  timer: { fontSize: 14, fontFamily: FontFamily.semibold, width: 46 },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 30, overflow: 'hidden' },
  bar: { width: 2.5, borderRadius: 2 },
  cancelHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cancelText: { fontSize: 12, fontFamily: FontFamily.medium },
});
