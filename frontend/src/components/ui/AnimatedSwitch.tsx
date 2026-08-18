import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';

type Size = 'sm' | 'md';

/** Track/knob geometry per size. `travel` is the knob's on-state translateX. */
const DIMS: Record<Size, { w: number; h: number; knob: number; pad: number }> = {
  md: { w: 51, h: 31, knob: 27, pad: 2 },
  sm: { w: 39, h: 23, knob: 19, pad: 2 },
};

/**
 * iOS-style toggle with a sprung knob and a cross-fading track (F39/F45).
 *
 * Replaces the hand-rolled `<View style={{ transform: [{ translateX: on ? x : y }] }}>`
 * knobs that teleported between states across Right Now, Filters and Settings.
 * The knob springs; the track colour cross-fades over 150ms; a light haptic
 * fires on every tap.
 */
export function AnimatedSwitch({
  value,
  onValueChange,
  disabled = false,
  size = 'md',
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  size?: Size;
}) {
  const { theme } = useTheme();
  const { w, h, knob, pad } = DIMS[size];
  const travel = w - knob - pad * 2;

  // Both the knob offset and the track colour are driven off `value` directly —
  // Reanimated animates from the current rendered value, so no shared state or
  // mount effect is needed and the switch can never desync from its prop.
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(value ? theme.brand : theme.border, { duration: 150 }),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: withSpring(value ? travel : 0, { damping: 18, stiffness: 250 }) },
    ],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onValueChange(!value);
      }}
    >
      <Animated.View
        style={[
          {
            width: w,
            height: h,
            borderRadius: h / 2,
            padding: pad,
            justifyContent: 'center',
            opacity: disabled ? 0.5 : 1,
          },
          trackStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: knob,
              height: knob,
              borderRadius: knob / 2,
              backgroundColor: '#FFFFFF',
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            },
            knobStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
