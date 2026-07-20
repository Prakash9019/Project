import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, SectionList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Avatar } from '../src/components/Avatar';
import { useTheme, FontFamily, FontSize, DisplayFont } from '../src/theme';
import { getStarredMessages, type StarredMessageItem } from '../src/services/api';

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function StarredMessages() {
  const router = useRouter();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StarredMessageItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStarredMessages();
      setItems(res.starred);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Group by conversation/room title.
  const sections = useMemo(() => {
    const byTitle = new Map<string, StarredMessageItem[]>();
    for (const it of items) {
      const key = it.title;
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key)!.push(it);
    }
    return [...byTitle.entries()].map(([title, data]) => ({ title, data }));
  }, [items]);

  const openMessage = (it: StarredMessageItem) => {
    if (it.type === 'room' && it.roomId) router.push(`/rooms/${it.roomId}` as Href);
    else if (it.conversationId) router.push({ pathname: '/chat/[id]', params: { id: it.conversationId, peerName: it.title } });
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Starred Messages</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="star-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No starred messages</Text>
          <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>Star important messages to find them here</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionHeader, { color: theme.textTertiary, backgroundColor: theme.background }]}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openMessage(item)}>
              <Avatar uri={item.avatarUrl} size={40} />
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>{item.senderName}</Text>
                  <Ionicons name="star" size={14} color={theme.brand} />
                </View>
                <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={1}>{item.preview}</Text>
                <Text style={[styles.time, { color: theme.textTertiary }]}>{timeLabel(item.createdAt)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, fontWeight: '700', marginTop: 4 },
  emptyBody: { fontSize: FontSize.md, fontFamily: FontFamily.regular, textAlign: 'center' },
  sectionHeader: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  preview: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 1 },
  time: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
});
