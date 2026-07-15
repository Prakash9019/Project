import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont } from '../../theme';
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
      <Pressable onPress={onBack} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
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
            <Text style={[styles.sub, { color: theme.textSecondary }]} numberOfLines={1}>
              {formatCount(room.memberCount)} members
              {room.onlineCount > 0 ? ` · ${formatCount(room.onlineCount)} online` : ''}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <Pressable onPress={onSearch} hitSlop={8} style={styles.action}>
        <Ionicons name="search" size={22} color={theme.textPrimary} />
      </Pressable>
      <Pressable onPress={onMenu} hitSlop={8} style={styles.action}>
        <Ionicons name="ellipsis-vertical" size={22} color={theme.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.05)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  roleBadgeText: { fontSize: 10, fontFamily: FontFamily.semibold },
  title: { fontSize: 17, fontFamily: DisplayFont.bold, flexShrink: 1 },
  sub: { fontSize: 12, fontFamily: FontFamily.regular, marginTop: 1 },
  action: { padding: 4 },
});
