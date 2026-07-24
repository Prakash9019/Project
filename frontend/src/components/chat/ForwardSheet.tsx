import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, TextInput, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RemoteImage } from '../RemoteImage';
import { useTheme, FontFamily, FontSize } from '../../theme';
import { useChatStore } from '../../store/chatStore';
import type { ConversationSummary } from '../../types/api';

export function ForwardSheet({
  visible,
  onClose,
  onForward,
  excludeConversationId,
}: {
  visible: boolean;
  onClose: () => void;
  onForward: (targetConversationIds: string[]) => Promise<void>;
  excludeConversationId?: string;
}) {
  const { theme } = useTheme();
  const conversations = useChatStore((s) => s.conversations);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setSelected(new Set());
      fetchConversations('inbox').catch(() => {});
    }
  }, [visible, fetchConversations]);

  const candidates = useMemo(
    () => conversations.filter((c) => c.id !== excludeConversationId),
    [conversations, excludeConversationId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => (c.peer.firstName ?? '').toLowerCase().includes(q));
  }, [candidates, query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleForward = async () => {
    if (selected.size === 0 || sending) return;
    setSending(true);
    try {
      await onForward([...selected]);
    } finally {
      setSending(false);
    }
  };

  const renderRow = ({ item }: { item: ConversationSummary }) => {
    const isSelected = selected.has(item.id);
    const preview =
      typeof item.lastMessage === 'string'
        ? item.lastMessage
        : item.lastMessage?.content ?? (item.lastMessage ? 'Media' : '');
    return (
      <Pressable style={styles.row} onPress={() => toggle(item.id)}>
        {item.peer.profilePhoto ? (
          <RemoteImage source={{ uri: item.peer.profilePhoto }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.backgroundTertiary, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="person" size={18} color={theme.textTertiary} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
            {item.peer.firstName || 'Someone'}
          </Text>
          <Text style={[styles.preview, { color: theme.textTertiary }]} numberOfLines={1}>
            {preview}
          </Text>
        </View>
        <View
          style={[
            styles.checkbox,
            {
              borderColor: isSelected ? theme.brand : theme.border,
              backgroundColor: isSelected ? theme.brand : 'transparent',
            },
          ]}
        >
          {isSelected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Forward to</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={theme.textPrimary} />
            </Pressable>
          </View>

          <View style={[styles.searchBar, { backgroundColor: theme.surfaceElevated }]}>
            <Ionicons name="search" size={16} color={theme.textTertiary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search chats"
              placeholderTextColor={theme.textTertiary}
              style={[styles.searchInput, { color: theme.textPrimary }]}
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            renderItem={renderRow}
            style={{ maxHeight: 380 }}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: theme.textSecondary }]}>No chats found</Text>
            }
          />

          <Pressable
            disabled={selected.size === 0 || sending}
            onPress={handleForward}
            style={[
              styles.forwardBtn,
              { backgroundColor: selected.size === 0 ? theme.backgroundTertiary : theme.brand },
            ]}
          >
            <Text style={[styles.forwardBtnText, { color: selected.size === 0 ? theme.textTertiary : '#fff' }]}>
              Forward{selected.size > 0 ? ` (${selected.size})` : ''}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '75%' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', alignSelf: 'center', marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: FontSize.lg, fontFamily: FontFamily.semibold },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.regular },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  name: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  preview: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', paddingVertical: 24 },
  forwardBtn: { marginTop: 14, borderRadius: 12, alignItems: 'center', paddingVertical: 13 },
  forwardBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
});
