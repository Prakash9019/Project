import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme, FontFamily, FontSize } from '../../theme';

/**
 * Thin upload progress bar shown above the composer input row while a media
 * upload is in flight. `progress` is 0-100; the parent owns the value.
 * Shared by inbox + group chat via ChatComposer.
 */
export function UploadProgressBar({ progress }: { progress: number }) {
  const { theme } = useTheme();
  const w = useSharedValue(progress);

  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(100, progress)), { duration: 180 });
  }, [progress, w]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${w.value}%` }));

  return (
    <View style={styles.wrap}>
      <View style={[styles.track, { backgroundColor: theme.surfaceElevated }]}>
        <Animated.View style={[styles.fill, { backgroundColor: theme.brand }, fillStyle]} />
      </View>
      <Text style={[styles.label, { color: theme.textTertiary }]}>
        Uploading… {Math.round(progress)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 6, gap: 3 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  label: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },
});
