import { Pressable, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme, FontFamily, FontSize } from '../../theme';

/**
 * A reaction chip that briefly pulses (1.0 → 1.4 → 1.0, 200ms) with a selection
 * haptic when ADDING a reaction; removing one is silent (WhatsApp behavior).
 * Opens the reaction-details sheet on long-press.
 */
export function ReactionPill({
  emoji,
  count,
  userReacted,
  onPress,
  onLongPress,
}: {
  emoji: string;
  count: number;
  userReacted: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    // Adding (not yet reacted) → haptic + pulse. Removing → quiet, no pulse.
    if (!userReacted) {
      Haptics.selectionAsync().catch(() => {});
      scale.value = withSequence(
        withTiming(1.4, { duration: 100, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 100, easing: Easing.out(Easing.quad) }),
      );
    }
    onPress();
  };

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={handlePress}
        onLongPress={onLongPress}
        style={[
          styles.pill,
          {
            backgroundColor: userReacted ? theme.brand + '33' : theme.surfaceElevated,
            borderColor: userReacted ? theme.brand : 'transparent',
          },
        ]}
      >
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={[styles.count, { color: theme.textSecondary }]}>{count}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  emoji: { fontSize: FontSize.sm },
  count: { fontSize: FontSize.xs, fontFamily: FontFamily.medium },
});
