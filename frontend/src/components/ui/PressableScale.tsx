import { Pressable, Platform, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Fire a light haptic on press-in (default true). */
  haptic?: boolean;
  /** Pressed-state scale target (default 0.95). */
  scale?: number;
  disabled?: boolean;
  hitSlop?: PressableProps['hitSlop'];
  /** Disable the Android ripple (e.g. for irregularly-shaped targets). */
  ripple?: boolean;
  testID?: string;
};

/**
 * Shared tactile pressable (F49/F50): a Reanimated scale-down on press-in with a
 * light haptic, springing back on release, plus a material ripple on Android.
 * Use it in place of a bare `Pressable`/`TouchableOpacity` for any primary touch
 * target (grid tiles, list rows, send button, action buttons, plan cards …).
 *
 * When `disabled`, it renders at 0.5 opacity with no scale, haptic, or press.
 */
export function PressableScale({
  onPress,
  onLongPress,
  style,
  children,
  haptic = true,
  scale = 0.95,
  disabled = false,
  hitSlop,
  ripple = true,
  testID,
}: PressableScaleProps) {
  const { theme } = useTheme();
  const s = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }],
  }));

  return (
    <AnimatedPressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => {
        if (disabled) return;
        s.value = withSpring(scale, { damping: 15 });
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }}
      onPressOut={() => {
        if (disabled) return;
        s.value = withSpring(1, { damping: 15 });
      }}
      android_ripple={
        ripple && !disabled && Platform.OS === 'android'
          ? { color: theme.brand + '33', foreground: false }
          : undefined
      }
      style={[style, animatedStyle, disabled ? { opacity: 0.5 } : null]}
    >
      {children}
    </AnimatedPressable>
  );
}
