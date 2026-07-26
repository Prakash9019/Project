import { memo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme, FontFamily, FontSize, DisplayFont, spacing, radius } from '../../theme';
import { PressableScale } from '../ui/PressableScale';
import { categoryMeta, formatCount, relativeTime } from '../../lib/rooms';
import type { RoomCard, JoinedRoomCard } from '../../types/api';

/** Circular cover image, or a colored category icon fallback. */
function GroupAvatar({ room, size }: { room: RoomCard; size: number }) {
  const { theme } = useTheme();
  const meta = categoryMeta(theme, room.category);
  const cover = typeof room.coverImageUrl === 'string' ? room.coverImageUrl.trim() : null;
  if (cover) {
    return (
      <Image
        source={{ uri: cover }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.backgroundTertiary }}
        contentFit="cover"
        transition={120}
        cachePolicy="memory-disk"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: meta.color + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={meta.icon} size={Math.round(size * 0.5)} color={meta.color} />
    </View>
  );
}

export type GroupCardVariant = 'joined' | 'discover';

function GroupCardBase({
  room,
  variant,
  joining,
  onJoin,
  onPress,
}: {
  room: RoomCard | JoinedRoomCard;
  variant: GroupCardVariant;
  joining?: boolean;
  onJoin?: () => void;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const meta = categoryMeta(theme, room.category);
  const joined = variant === 'joined' ? (room as JoinedRoomCard) : null;

  // Success pulse when a Discover card is joined (before it animates out).
  const scale = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pulse = () => {
    scale.value = withSequence(withTiming(1.04, { duration: 120 }), withTiming(1, { duration: 160 }));
  };

  const handleJoin = () => {
    pulse();
    onJoin?.();
  };

  const isJoined = variant === 'joined';

  return (
    <Animated.View style={pulseStyle}>
      <PressableScale
        onPress={onPress}
        scale={1}
        style={
          isJoined
            ? styles.row
            : [styles.card, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]
        }
      >
        <GroupAvatar room={room} size={isJoined ? 56 : 54} />

        <View style={{ flex: 1 }}>
          {/* Title row */}
          <View style={styles.titleRow}>
            <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
              {room.name}
            </Text>
            {room.isOfficial ? <Ionicons name="checkmark-circle" size={15} color={theme.info} /> : null}
            {joined && joined.role !== 'member' ? (
              <View style={[styles.adminBadge, { backgroundColor: theme.brand + '22' }]}>
                <Text style={[styles.adminBadgeText, { color: theme.brand }]}>Admin</Text>
              </View>
            ) : null}
            {variant === 'joined' ? (
              <Text style={[styles.time, { color: theme.textTertiary }]}>{relativeTime(room.lastActivityAt)}</Text>
            ) : null}
          </View>

          {/* Discover: category chip + city */}
          {variant === 'discover' ? (
            <View style={styles.metaRow}>
              <View style={[styles.catChip, { backgroundColor: meta.color + '22' }]}>
                <Text style={[styles.catChipText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              {room.city ? <Text style={[styles.city, { color: theme.textTertiary }]}>{room.city}</Text> : null}
            </View>
          ) : null}

          {/* Description */}
          {room.description ? (
            <Text
              style={[styles.desc, { color: theme.textSecondary }]}
              numberOfLines={variant === 'discover' ? 2 : 1}
            >
              {room.description}
            </Text>
          ) : null}

          {/* Stats */}
          <View style={styles.statsRow}>
            <Text style={[styles.stat, { color: theme.textTertiary }]}>{formatCount(room.memberCount)} members</Text>
            {room.onlineCount > 0 ? (
              <View style={styles.onlineWrap}>
                <View style={[styles.onlineDot, { backgroundColor: theme.online }]} />
                <Text style={[styles.stat, { color: theme.success }]}>{formatCount(room.onlineCount)} online</Text>
              </View>
            ) : null}
            {joined && joined.unreadCount > 0 ? (
              <View style={[styles.unreadBadge, { backgroundColor: theme.brand }]}>
                <Text style={styles.unreadBadgeText}>{joined.unreadCount > 99 ? '99+' : joined.unreadCount}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Discover: Join button */}
        {variant === 'discover' ? (
          <Pressable onPress={handleJoin} disabled={joining} hitSlop={6}>
            <LinearGradient
              colors={theme.gradientWarm}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.joinBtn, { opacity: joining ? 0.7 : 1 }]}
            >
              {joining ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.joinBtnText}>Join</Text>
              )}
            </LinearGradient>
          </Pressable>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
}

/** Memoized so list scroll doesn't re-render every card. */
export const GroupCard = memo(GroupCardBase, (prev, next) => {
  const a = prev.room as JoinedRoomCard;
  const b = next.room as JoinedRoomCard;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.memberCount === b.memberCount &&
    a.onlineCount === b.onlineCount &&
    a.lastActivityAt === b.lastActivityAt &&
    (a.unreadCount ?? 0) === (b.unreadCount ?? 0) &&
    a.role === b.role &&
    prev.joining === next.joining &&
    prev.variant === next.variant
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // My Groups uses a transparent chat-list row (avatar + text + divider),
  // so it never blends into the search bar / into the next card.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  unreadBadgeText: { color: '#fff', fontSize: FontSize.xs, fontFamily: FontFamily.semibold },
  adminBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
  adminBadgeText: { fontSize: FontSize.xs, fontFamily: FontFamily.semibold },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: FontSize.lg, fontFamily: DisplayFont.medium, flexShrink: 1 },
  time: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginLeft: 'auto' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
  catChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  catChipText: { fontSize: FontSize.xs, fontFamily: FontFamily.semibold },
  city: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  desc: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 3, lineHeight: 18 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 4 },
  stat: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  onlineWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  joinBtn: { paddingHorizontal: 20, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  joinBtnText: { color: '#fff', fontSize: FontSize.md, fontFamily: FontFamily.bold },
});
