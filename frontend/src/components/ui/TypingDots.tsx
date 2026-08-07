import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';

function Dot({ delay, color, size }: { delay: number; color: string; size: number }) {
  const y = useSharedValue(0);

  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(-3, { duration: 300 }), withTiming(0, { duration: 300 })),
        -1,
      ),
    );
    return () => {
      y.value = 0;
    };
  }, [delay, y]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

/**
 * WhatsApp-style typing indicator: three dots with a staggered bounce.
 * Defaults to textTertiary; pass `color` to match the surrounding text
 * (e.g. theme.online in the chat header).
 */
export function TypingDots({ color, size = 5 }: { color?: string; size?: number }) {
  const { theme } = useTheme();
  const c = color ?? theme.textTertiary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: size + 6 }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 150} color={c} size={size} />
      ))}
    </View>
  );
}
