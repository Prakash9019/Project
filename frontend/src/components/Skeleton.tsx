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

/** Shimmering grid of tiles for the Browse loading state.
 *  Geometry mirrors the real grid (app/(tabs)/index.tsx: PAD 12, GAP 6, radius 16)
 *  so the skeleton→content swap doesn't jump. */
export function GridSkeleton({ cols = 3 }: { cols?: number }) {
  const { width } = useWindowDimensions();
  const pad = 12;
  const gap = 6;
  const tile = (width - pad * 2 - gap * (cols - 1)) / cols;
  const rows = 6;
  return (
    <View style={{ paddingHorizontal: pad }}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap, marginBottom: gap }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} width={tile} height={tile} radius={16} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Message bubble skeletons for the chat loading state (WhatsApp-style, no spinner).
 *  Heights and widths deliberately vary — a column of identical 44px blocks reads
 *  as a grid, not as a conversation. */
const CHAT_SKELETON_ROWS: { height: number; isOwn: boolean; width: `${number}%` }[] = [
  { height: 38, isOwn: false, width: '52%' },
  { height: 56, isOwn: true, width: '64%' },
  { height: 44, isOwn: true, width: '46%' },
  { height: 70, isOwn: false, width: '72%' },
  { height: 32, isOwn: true, width: '38%' },
  { height: 52, isOwn: false, width: '60%' },
  { height: 44, isOwn: false, width: '55%' },
  { height: 38, isOwn: true, width: '50%' },
  { height: 62, isOwn: false, width: '68%' },
  { height: 44, isOwn: true, width: '58%' },
];

export function ChatSkeleton() {
  const { theme } = useTheme();
  return (
    <View style={styles.chat}>
      {CHAT_SKELETON_ROWS.map((row, i) => (
        <View
          key={i}
          style={[styles.chatRow, { justifyContent: row.isOwn ? 'flex-end' : 'flex-start' }]}
        >
          {!row.isOwn && (
            <View style={[styles.chatAvatar, { backgroundColor: theme.surfaceElevated }]} />
          )}
          <Skeleton width={row.width} height={row.height} radius={16} />
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

/** Room card skeletons for the Groups tabs (My Groups + Discover) loading state. */
export function RoomListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 20 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.roomRow}>
          <Skeleton width={56} height={56} radius={28} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="55%" height={15} />
            <Skeleton width="85%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Member row skeletons for the room members list loading state. */
export function MemberListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 12, gap: 18 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.memberRow}>
          <Skeleton width={48} height={48} radius={24} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="45%" height={14} />
            <Skeleton width="30%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chat: { flex: 1, padding: 16, gap: 12, justifyContent: 'flex-end' },
  chatRow: { flexDirection: 'row', alignItems: 'center' },
  chatAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
