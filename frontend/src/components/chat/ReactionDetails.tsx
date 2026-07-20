import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../Avatar';
import { useTheme, FontFamily, FontSize } from '../../theme';
import { getMessageReactions, getRoomMessageReactions, type ReactionDetail } from '../../services/api';

/**
 * Bottom sheet listing who reacted to a message, grouped by emoji with an
 * emoji-filter tab row. Fetches from the 1:1 or room reactions endpoint.
 */
export function ReactionDetails({
  visible,
  onClose,
  scope,
  parentId,
  messageId,
}: {
  visible: boolean;
  onClose: () => void;
  /** 'chat' → conversation reactions; 'room' → room reactions. */
  scope: 'chat' | 'room';
  /** conversationId or roomId. */
  parentId: string;
  messageId: string | null;
}) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [reactions, setReactions] = useState<ReactionDetail[]>([]);
  const [activeEmoji, setActiveEmoji] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !messageId) return;
    let active = true;
    setLoading(true);
    setActiveEmoji(null);
    const fetcher = scope === 'room'
      ? getRoomMessageReactions(parentId, messageId)
      : getMessageReactions(parentId, messageId);
    fetcher
      .then((res) => {
        if (active) setReactions(res.reactions);
      })
      .catch(() => {
        if (active) setReactions([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, messageId, parentId, scope]);

  const total = useMemo(() => reactions.reduce((sum, r) => sum + r.users.length, 0), [reactions]);

  const shown = useMemo(() => {
    const flat = reactions.flatMap((r) => r.users.map((u) => ({ ...u, emoji: r.emoji })));
    return activeEmoji ? flat.filter((u) => u.emoji === activeEmoji) : flat;
  }, [reactions, activeEmoji]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grip} />
          <Text style={[styles.title, { color: theme.textPrimary }]}>Reactions</Text>

          {/* Emoji filter tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            <Pressable
              onPress={() => setActiveEmoji(null)}
              style={[styles.tab, { borderColor: activeEmoji === null ? theme.brand : 'transparent' }]}
            >
              <Text style={[styles.tabText, { color: theme.textPrimary }]}>All {total}</Text>
            </Pressable>
            {reactions.map((r) => (
              <Pressable
                key={r.emoji}
                onPress={() => setActiveEmoji(r.emoji)}
                style={[styles.tab, { borderColor: activeEmoji === r.emoji ? theme.brand : 'transparent' }]}
              >
                <Text style={styles.tabEmoji}>{r.emoji}</Text>
                <Text style={[styles.tabText, { color: theme.textSecondary }]}>{r.users.length}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {loading ? (
            <ActivityIndicator color={theme.brand} style={{ marginVertical: 24 }} />
          ) : (
            <FlatList
              data={shown}
              keyExtractor={(u, i) => `${u.id}-${u.emoji}-${i}`}
              style={{ maxHeight: 360 }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="happy-outline" size={36} color={theme.textTertiary} />
                  <Text style={[styles.emptyText, { color: theme.textTertiary }]}>No reactions yet</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <Avatar uri={item.profilePhotoUrl ?? item.profilePhoto ?? null} size={36} />
                  <Text style={[styles.name, { color: theme.textPrimary }]}>{item.firstName ?? 'Someone'}</Text>
                  <Text style={styles.rowEmoji}>{item.emoji}</Text>
                </View>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 30 },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', marginBottom: 10 },
  title: { fontSize: FontSize.lg, fontFamily: FontFamily.semibold, marginBottom: 10 },
  tabs: { gap: 8, paddingBottom: 12 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 34, borderRadius: 999, borderWidth: 1.5 },
  tabEmoji: { fontSize: 16 },
  tabText: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  name: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.medium },
  rowEmoji: { fontSize: 20 },
  empty: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyText: { fontSize: FontSize.md, fontFamily: FontFamily.medium },
});
