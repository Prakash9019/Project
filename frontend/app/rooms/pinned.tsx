import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Avatar } from '../../src/components/Avatar';
import { useTheme, FontFamily, DisplayFont, FontSize, spacing } from '../../src/theme';
import { getRoom, listRoomMessages, pinRoomMessage } from '../../src/services/api';
import { toastApiError } from '../../src/lib/toast';
import type { RoomMessageCard } from '../../src/types/api';

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function previewOf(msg: RoomMessageCard): string {
  if (msg.content) return msg.content;
  switch (msg.type) {
    case 'image':
      return '📷 Photo';
    case 'voice':
      return '🎤 Voice message';
    default:
      return 'Message';
  }
}

export default function PinnedMessages() {
  const { theme } = useTheme();
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const id = String(roomId);

  const [pinned, setPinned] = useState<RoomMessageCard[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [r, m] = await Promise.all([getRoom(id), listRoomMessages(id, { limit: 100 })]);
      setIsAdmin(r.room.isCreator === true || r.room.myRole === 'admin');
      setPinned(m.messages.filter((x) => x.isPinned && !x.isDeleted));
    } catch (e) {
      toastApiError(e, 'Could not load pinned messages');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const unpin = async (msg: RoomMessageCard) => {
    setPinned((prev) => prev.filter((m) => m.id !== msg.id));
    try {
      await pinRoomMessage(id, msg.id, false);
    } catch (e) {
      toastApiError(e, 'Could not unpin message');
      load();
    }
  };

  const goToMessage = (msg: RoomMessageCard) => {
    router.push({ pathname: '/rooms/[id]', params: { id, scrollTo: msg.id } });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Pinned Messages</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : pinned.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="pin-outline" size={44} color={theme.textTertiary} />
          <Text style={[styles.empty, { color: theme.textTertiary }]}>No pinned messages yet</Text>
        </View>
      ) : (
        <FlatList
          data={pinned}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingVertical: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => goToMessage(item)}>
              <Avatar uri={item.sender.profilePhotoUrl} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sender, { color: theme.textPrimary }]} numberOfLines={1}>
                  {item.sender.firstName ?? 'Someone'}
                </Text>
                <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={2}>
                  {previewOf(item)}
                </Text>
                <Text style={[styles.time, { color: theme.textTertiary }]}>{timeLabel(item.createdAt)}</Text>
              </View>
              {isAdmin ? (
                <Pressable hitSlop={10} onPress={() => unpin(item)}>
                  <Ionicons name="pin" size={20} color={theme.brand} />
                </Pressable>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 18, fontFamily: DisplayFont.bold },
  empty: { fontFamily: FontFamily.regular, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sender: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  preview: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 2 },
  time: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
});
