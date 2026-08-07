import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily } from '../../theme';
import { categoryMeta, formatCount } from '../../lib/rooms';
import type { RoomDetail } from '../../types/api';

/** Redesigned chat header: back · avatar+name+members (→ info) · search · menu. */
export function RoomHeader({
  room,
  onBack,
  onOpenInfo,
  onSearch,
  onMenu,
}: {
  room: RoomDetail | null;
  onBack: () => void;
  onOpenInfo: () => void;
  onSearch: () => void;
  onMenu: () => void;
}) {
  const { theme } = useTheme();
  const meta = room ? categoryMeta(theme, room.category) : null;
  const cover = typeof room?.coverImageUrl === 'string' ? room.coverImageUrl.trim() : null;
  const isCreator = room?.isCreator === true;
  const isAdmin = isCreator || room?.myRole === 'admin';

  return (
    <View style={[styles.header, { borderBottomColor: theme.border }]}>
      <Pressable onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
      </Pressable>

      <Pressable style={styles.center} onPress={onOpenInfo}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
        ) : meta ? (
          <View style={[styles.avatar, { backgroundColor: meta.color + '22', alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.surfaceElevated }]} />
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
              {room?.name ?? 'Room'}
            </Text>
            {isAdmin ? (
              <View style={[styles.roleBadge, { backgroundColor: (isCreator ? theme.planGold : theme.info) + '22' }]}>
                <Ionicons
                  name={isCreator ? 'ribbon' : 'shield-checkmark'}
                  size={11}
                  color={isCreator ? theme.planGold : theme.info}
                />
                <Text style={[styles.roleBadgeText, { color: isCreator ? theme.planGold : theme.info }]}>
                  {isCreator ? 'Creator' : 'Admin'}
                </Text>
              </View>
            ) : null}
          </View>
          {room ? (
            <Text style={[styles.sub, { color: theme.textTertiary }]} numberOfLines={1}>
              {formatCount(room.memberCount)} members
              {room.onlineCount > 0 ? ` · ${formatCount(room.onlineCount)} online` : ''}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable onPress={onSearch} hitSlop={10}>
          <Ionicons name="search" size={22} color={theme.textPrimary} />
        </Pressable>
        <Pressable onPress={onMenu} hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={20} color={theme.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 56, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.05)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  roleBadgeText: { fontSize: 10, fontFamily: FontFamily.semibold },
  title: { fontSize: 15, fontFamily: FontFamily.semibold, flexShrink: 1 },
  sub: { fontSize: 12, fontFamily: FontFamily.regular, marginTop: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingLeft: 4, paddingRight: 4 },
});
