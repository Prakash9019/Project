import { useEffect } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { PressableScale } from '../ui/PressableScale';
import { useTheme, FontFamily } from '../../theme';

/**
 * Floating "jump to latest" pill for the chat + rooms message lists (F26).
 * Fades in and slides up when the user has scrolled away from the newest message,
 * fades out and slides down at the bottom. Shows an unread count badge for
 * messages that arrived while scrolled up.
 */
export function ScrollToBottomButton({
  visible,
  count = 0,
  onPress,
}: {
  visible: boolean;
  count?: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(visible ? 1 : 0, { duration: 200 });
  }, [visible, p]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 20 }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.wrap, animatedStyle]}
    >
      <PressableScale
        onPress={onPress}
        haptic={false}
        ripple={false}
        style={[styles.btn, { backgroundColor: theme.brand }]}
      >
        <Ionicons name="chevron-down" size={22} color="#fff" />
      </PressableScale>
      {count > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.error, borderColor: theme.background }]} pointerEvents="none">
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 80, right: 16 },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
      android: { elevation: 5 },
    }),
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  badgeText: { color: '#fff', fontSize: 11, fontFamily: FontFamily.bold, fontWeight: '700' },
});
