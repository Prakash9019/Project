import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useTheme, FontFamily } from '../../theme';

const BAR_COUNT = 28;

function WaveBar({ index, cancelling }: { index: number; cancelling: boolean }) {
  const { theme } = useTheme();
  const h = useSharedValue(6);
  useEffect(() => {
    h.value = withDelay(
      index * 40,
      withRepeat(withTiming(Math.random() * 20 + 6, { duration: 400 }), -1, true),
    );
    // index changes never; random seeded once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[styles.bar, style, { backgroundColor: cancelling ? theme.error : theme.brand }]} />;
}

/**
 * Recording overlay: pulsing mic, animated waveform, mm:ss timer and a
 * "slide to cancel" hint. Actual capture/upload is wired by the parent.
 */
export function VoiceRecorder({ cancelling }: { cancelling: boolean }) {
  const { theme } = useTheme();
  const [seconds, setSeconds] = useState(0);

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
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <WaveBar key={i} index={i} cancelling={cancelling} />
        ))}
      </View>
      <View style={styles.cancelHint}>
        <Ionicons name="chevron-back" size={16} color={cancelling ? theme.error : theme.textTertiary} />
        <Text style={[styles.cancelText, { color: cancelling ? theme.error : theme.textTertiary }]}>
          {cancelling ? 'Release to cancel' : 'Slide to cancel'}
        </Text>
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
