import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme';
import { useChatStore } from '../../src/store/chatStore';
import { useAuthStore } from '../../src/store/authStore';
import { connectSocket } from '../../src/services/socket';
import { relativeTime } from '../../src/lib/format';
import { ListSkeleton } from '../../src/components/Skeleton';
import type { ConversationSummary } from '../../src/types/api';

export default function Inbox() {
  const router = useRouter();
  const { theme } = useTheme();
  const me = useAuthStore((s) => s.user);
  const [seg, setSeg] = useState<'inbox' | 'albums'>('inbox');
  const { conversations, loading, refreshing, error, fetchConversations, applyIncomingMessage } =
    useChatStore();

  // Fetch on focus.
  useFocusEffect(
    useCallback(() => {
      fetchConversations('inbox');
    }, [fetchConversations])
  );

  // Live updates: bump lastMessage + unread on incoming messages.
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const socket = await connectSocket();
      if (!socket) return;
      const onCreated = (p: any) => {
        const preview = p.content ?? (p.type ? `[${p.type}]` : 'New message');
        applyIncomingMessage(p.conversationId, preview, p.senderId === me?.id);
      };
      socket.on('message.created', onCreated);
      cleanup = () => socket.off('message.created', onCreated);
    })();
    return () => cleanup();
  }, [me?.id, applyIncomingMessage]);

  const renderRow = ({ item }: { item: ConversationSummary }) => {
    const online = item.peer.lastActiveAt?.toLowerCase() === 'online';
    return (
      <Pressable
        style={styles.row}
        onPress={() =>
          router.push({ pathname: '/chat/[id]', params: { id: item.id, peerName: item.peer.firstName ?? '' } })
        }
      >
        <View>
          {item.peer.profilePhoto ? (
            <Image source={{ uri: item.peer.profilePhoto }} style={[styles.thumb, { backgroundColor: theme.backgroundTertiary }]} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, { backgroundColor: theme.backgroundTertiary, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={28} color={theme.textTertiary} />
            </View>
          )}
          {online && <View style={[styles.onlineDot, { backgroundColor: theme.online, borderColor: theme.background }]} />}
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <View style={styles.nameWrap}>
              {item.isPinned && <Ionicons name="pin" size={13} color={theme.textTertiary} />}
              <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                {item.peer.firstName ?? 'Someone'}
              </Text>
              {item.peer.isVerified && <Ionicons name="checkmark-circle" size={13} color={theme.info} />}
            </View>
            <Text style={[styles.time, { color: theme.textTertiary }]}>{relativeTime(item.lastMessageAt)}</Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={1}>
              {item.lastMessage ?? 'Say hello 👋'}
            </Text>
            <View style={styles.rowIcons}>
              {item.audioCallEnabled && <Ionicons name="call" size={13} color={theme.callAudio} />}
              {item.videoCallEnabled && <Ionicons name="videocam" size={13} color={theme.callVideo} />}
              {!!item.unreadCount && item.unreadCount > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.brand }]}>
                  <Text style={[styles.badgeText, { color: theme.textInverse }]}>{item.unreadCount}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.titleRow}>
        <Pressable onPress={() => setSeg('inbox')}>
          <Text style={[styles.title, { color: seg === 'inbox' ? theme.textPrimary : theme.textTertiary }]}>Inbox</Text>
        </Pressable>
        <Pressable onPress={() => setSeg('albums')}>
          <Text style={[styles.title, { color: seg === 'albums' ? theme.textPrimary : theme.textTertiary }]}>Albums</Text>
        </Pressable>
      </View>

      {seg === 'albums' ? (
        <View style={styles.center}>
          <Ionicons name="images-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Albums</Text>
          <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>Create and share photo albums.</Text>
          <Pressable style={[styles.cta, { backgroundColor: theme.brand }]} onPress={() => router.push('/albums')}>
            <Text style={[styles.ctaText, { color: theme.textInverse }]}>Manage albums</Text>
          </Pressable>
        </View>
      ) : loading && conversations.length === 0 ? (
        <ListSkeleton />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: theme.border }]} />}
          renderItem={renderRow}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchConversations('inbox', true)} tintColor={theme.brand} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No conversations yet</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                {error ?? 'Tap someone on the grid to start chatting.'}
              </Text>
            </View>
          }
          contentContainerStyle={conversations.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  titleRow: { flexDirection: 'row', gap: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: '800' },
  sep: { height: 1, marginLeft: 92 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  thumb: { width: 60, height: 60, borderRadius: 8 },
  onlineDot: { position: 'absolute', left: 2, bottom: 2, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  rowBody: { flex: 1, gap: 6 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  name: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  time: { fontSize: 12 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  preview: { fontSize: 14, flex: 1 },
  rowIcons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cta: { marginTop: 8, height: 46, borderRadius: 999, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 15, fontWeight: '700' },
});
