import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '../theme';

/** A shimmering placeholder block. */
export function Skeleton({ width, height, radius = 8, style }: { width: number | string; height: number; radius?: number; style?: any }) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ width: width as any, height, borderRadius: radius, backgroundColor: theme.surfaceElevated, opacity }, style]}
    />
  );
}

/** Shimmering grid of tiles for the Browse loading state. */
export function GridSkeleton({ cols = 3 }: { cols?: number }) {
  const { width } = useWindowDimensions();
  const gap = 2;
  const tile = (width - gap * (cols - 1)) / cols;
  const rows = 6;
  return (
    <View>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap, marginBottom: gap }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} width={tile} height={tile} radius={0} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Message bubble skeletons for the chat loading state. */
export function ChatSkeleton() {
  return (
    <View style={styles.chat}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end' }}>
          <Skeleton width={160 + (i % 3) * 40} height={38} radius={18} />
        </View>
      ))}
    </View>
  );
}

/** Conversation row skeletons for the inbox loading state. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <View style={{ padding: 16, gap: 18 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.listRow}>
          <Skeleton width={60} height={60} radius={8} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="50%" height={14} />
            <Skeleton width="80%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chat: { padding: 16, gap: 12 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
