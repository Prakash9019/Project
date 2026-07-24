import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
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
 */
export function VoiceRecorder({
  cancelling,
  locked = false,
  amplitudes = [],
}: {
  cancelling: boolean;
  locked?: boolean;
  amplitudes?: number[];
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

  return (
    <View style={[styles.wrap, { backgroundColor: theme.surfaceElevated }]}>
      <Animated.View style={micStyle}>
        <Ionicons name="mic" size={22} color={theme.error} />
      </Animated.View>
      <Text style={[styles.timer, { color: theme.textPrimary }]}>
        {mm}:{ss}
      </Text>
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
      <View style={styles.cancelHint}>
        {locked ? (
          <>
            <Ionicons name="lock-closed" size={15} color={theme.brand} />
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Tap stop to send</Text>
          </>
        ) : (
          <>
            <Ionicons name="chevron-back" size={16} color={cancelling ? theme.error : theme.textTertiary} />
            <Text style={[styles.cancelText, { color: cancelling ? theme.error : theme.textTertiary }]}>
              {cancelling ? 'Release to cancel' : 'Slide to cancel'}
            </Text>
          </>
        )}
      </View>
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
