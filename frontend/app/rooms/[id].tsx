import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Avatar } from '../../src/components/Avatar';
import { MiniProfile } from '../../src/components/MiniProfile';
import { useTheme, FontFamily, DisplayFont, spacing, radius } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import {
  getRoom,
  listRoomMessages,
  sendRoomMessage,
  reactToRoomMessage,
  deleteRoomMessage,
  reportRoomMessage,
  muteRoom,
  reportRoom,
  leaveRoom,
} from '../../src/services/api';
import { connectSocket, getSocket, emitRoomJoin, emitRoomLeave, emitRoomTyping } from '../../src/services/socket';
import { formatCount } from '../../src/lib/rooms';
import { toastApiError, showSuccess, showError } from '../../src/lib/toast';
import type { RoomDetail, RoomMessageCard, RoomReaction, RoomUserCard } from '../../src/types/api';

const PAGE = 30;
const EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function RoomChat() {
  const { theme } = useTheme();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = String(id);

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<RoomMessageCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<RoomMessageCard | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMsg, setContextMsg] = useState<RoomMessageCard | null>(null);
  const [miniUser, setMiniUser] = useState<RoomUserCard | null>(null);

  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingSent = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  // ── Initial load ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([getRoom(roomId), listRoomMessages(roomId, { limit: PAGE })]);
      setRoom(r.room);
      setMessages(m.messages);
      setHasMore(m.hasMore);
      setCursor(m.nextCursor);
    } catch (e) {
      toastApiError(e, 'Could not open room');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [roomId, router]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Socket wiring ──
  useEffect(() => {
    let mounted = true;
    (async () => {
      await connectSocket();
      if (!mounted) return;
      const socket = getSocket();
      if (!socket) return;
      emitRoomJoin(roomId);

      const onMessage = (msg: RoomMessageCard) => {
        if (msg.roomId !== roomId) return;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
      };
      const onReaction = (p: { messageId: string; emoji: string; count: number; userId: string; added: boolean }) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== p.messageId) return m;
            const reactions = applyReaction(m.reactions, p, me?.id);
            return { ...m, reactions };
          }),
        );
      };
      const onDeleted = (p: { messageId: string }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === p.messageId ? { ...m, isDeleted: true, content: 'Message removed' } : m)),
        );
      };
      const onTyping = (p: { userId: string; firstName: string | null; isTyping: boolean }) => {
        if (p.userId === me?.id) return;
        setTypingUsers((prev) => {
          const next = { ...prev };
          if (p.isTyping) {
            next[p.userId] = p.firstName ?? 'Someone';
            clearTimeout(typingTimers.current[p.userId]);
            typingTimers.current[p.userId] = setTimeout(() => {
              setTypingUsers((cur) => {
                const c = { ...cur };
                delete c[p.userId];
                return c;
              });
            }, 4000);
          } else {
            delete next[p.userId];
          }
          return next;
        });
      };

      socket.on('room:message', onMessage);
      socket.on('room:message_reaction', onReaction);
      socket.on('room:message_deleted', onDeleted);
      socket.on('room:typing', onTyping);

      // Store cleanup on the socket instance via closure
      cleanupRef.current = () => {
        socket.off('room:message', onMessage);
        socket.off('room:message_reaction', onReaction);
        socket.off('room:message_deleted', onDeleted);
        socket.off('room:typing', onTyping);
        emitRoomLeave(roomId);
      };
    })();

    return () => {
      mounted = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
      Object.values(typingTimers.current).forEach(clearTimeout);
    };
  }, [roomId, me?.id]);

  // ── Load older (inverted list → onEndReached is the top) ──
  const loadOlder = async () => {
    if (loadingOlder || !hasMore || !cursor) return;
    setLoadingOlder(true);
    try {
      const res = await listRoomMessages(roomId, { before: cursor, limit: PAGE });
      setMessages((prev) => [...prev, ...res.messages]);
      setHasMore(res.hasMore);
      setCursor(res.nextCursor);
    } catch (e) {
      toastApiError(e, 'Could not load older messages');
    } finally {
      setLoadingOlder(false);
    }
  };

  // ── Send ──
  const onChangeText = (t: string) => {
    setText(t);
    const now = Date.now();
    if (now - lastTypingSent.current > 1500) {
      emitRoomTyping(roomId, true);
      lastTypingSent.current = now;
    }
  };

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const msg = await sendRoomMessage(roomId, {
        content,
        type: 'text',
        replyToId: replyTo?.id,
      });
      setText('');
      setReplyTo(null);
      emitRoomTyping(roomId, false);
      // Optimistic append (socket echo is de-duped by id).
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
    } catch (e: unknown) {
      const err = e as { status?: number; code?: string };
      if (err.status === 451 || err.code === 'message_flagged') {
        showError('Your message was flagged for review');
      } else {
        toastApiError(e, 'Could not send message');
      }
    } finally {
      setSending(false);
    }
  };

  // ── Reactions ──
  const toggleReaction = async (msg: RoomMessageCard, emoji: string) => {
    try {
      await reactToRoomMessage(roomId, msg.id, emoji);
      // Server emits room:message_reaction to everyone incl. us — state updates there.
    } catch (e) {
      toastApiError(e, 'Could not react');
    }
    setContextMsg(null);
  };

  const doDelete = async (msg: RoomMessageCard) => {
    setContextMsg(null);
    try {
      await deleteRoomMessage(roomId, msg.id);
    } catch (e) {
      toastApiError(e, 'Could not delete');
    }
  };

  const doReport = async (msg: RoomMessageCard) => {
    setContextMsg(null);
    try {
      await reportRoomMessage(roomId, msg.id, 'inappropriate');
      showSuccess('Message reported');
    } catch (e) {
      toastApiError(e, 'Could not report');
    }
  };

  // ── Room menu actions ──
  const handleMute = async () => {
    setMenuOpen(false);
    try {
      const res = await muteRoom(roomId);
      showSuccess(res.muted ? 'Room muted' : 'Room unmuted');
    } catch (e) {
      toastApiError(e);
    }
  };
  const handleReportRoom = async () => {
    setMenuOpen(false);
    try {
      await reportRoom(roomId, 'inappropriate');
      showSuccess('Room reported');
    } catch (e) {
      toastApiError(e);
    }
  };
  const handleLeave = async () => {
    setMenuOpen(false);
    try {
      await leaveRoom(roomId);
      router.back();
    } catch (e) {
      toastApiError(e);
    }
  };

  const typingText = (() => {
    const names = Object.values(typingUsers);
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names.length} people are typing…`;
  })();

  const renderItem = ({ item, index }: { item: RoomMessageCard; index: number }) => {
    // Inverted list: the next-older message is at index+1.
    const older = messages[index + 1];
    const showDateSep = !older || dayKey(older.createdAt) !== dayKey(item.createdAt);
    const isOwn = item.senderId === me?.id;
    return (
      <View>
        <MessageBubble
          msg={item}
          isOwn={isOwn}
          onAvatar={() => setMiniUser(item.sender)}
          onLongPress={() => setContextMsg(item)}
          onToggleReaction={(emoji) => toggleReaction(item, emoji)}
        />
        {showDateSep ? <DateSeparator label={dayLabel(item.createdAt)} /> : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </Pressable>
        <Pressable style={styles.headerCenter} onPress={() => openMembers(router, roomId)}>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            {room?.name ?? 'Room'}
          </Text>
          {room ? (
            <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
              {formatCount(room.memberCount)} members
              {room.onlineCount > 0 ? ` · ${formatCount(room.onlineCount)} online` : ''}
            </Text>
          ) : null}
        </Pressable>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={22} color={theme.textPrimary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        style={{ flex: 1 }}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.brand} />
          </View>
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md }}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingOlder ? <ActivityIndicator color={theme.brand} style={{ marginVertical: spacing.md }} /> : null
            }
            keyboardShouldPersistTaps="handled"
          />
        )}

        {typingText ? (
          <Text style={[styles.typing, { color: theme.textTertiary }]}>{typingText}</Text>
        ) : null}

        {/* Reply preview */}
        {replyTo ? (
          <View style={[styles.replyBar, { backgroundColor: theme.surfaceElevated, borderLeftColor: theme.brand }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyName, { color: theme.brand }]}>{replyTo.sender.firstName ?? 'Reply'}</Text>
              <Text style={[styles.replyContent, { color: theme.textSecondary }]} numberOfLines={1}>
                {replyTo.content}
              </Text>
            </View>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.textTertiary} />
            </Pressable>
          </View>
        ) : null}

        {/* Input bar */}
        <View style={[styles.inputBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <View style={[styles.inputWrap, { backgroundColor: theme.surfaceElevated }]}>
            <TextInput
              value={text}
              onChangeText={onChangeText}
              placeholder="Message"
              placeholderTextColor={theme.textTertiary}
              style={[styles.input, { color: theme.textPrimary }]}
              multiline
            />
          </View>
          <Pressable onPress={send} disabled={!text.trim() || sending}>
            <LinearGradient
              colors={theme.gradientWarm}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.sendBtn, { opacity: text.trim() ? 1 : 0.4 }]}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={22} color="#fff" />}
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Room three-dot menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: theme.overlay }]} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { backgroundColor: theme.surface }]}>
            <MenuItem icon="people-outline" label="View Members" onPress={() => { setMenuOpen(false); openMembers(router, roomId); }} />
            <MenuItem icon="notifications-off-outline" label="Mute Room" onPress={handleMute} />
            <MenuItem icon="flag-outline" label="Report Room" onPress={handleReportRoom} />
            <MenuItem icon="exit-outline" label="Leave Room" destructive onPress={handleLeave} />
          </View>
        </Pressable>
      </Modal>

      {/* Message context menu */}
      <Modal visible={!!contextMsg} transparent animationType="fade" onRequestClose={() => setContextMsg(null)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: theme.overlay }]} onPress={() => setContextMsg(null)}>
          <View style={[styles.menu, { backgroundColor: theme.surface }]}>
            <View style={styles.emojiRow}>
              {EMOJIS.map((e) => (
                <Pressable key={e} onPress={() => contextMsg && toggleReaction(contextMsg, e)} hitSlop={6}>
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <MenuItem icon="arrow-undo-outline" label="Reply" onPress={() => { setReplyTo(contextMsg); setContextMsg(null); }} />
            {contextMsg && contextMsg.senderId !== me?.id ? (
              <MenuItem icon="flag-outline" label="Report" onPress={() => contextMsg && doReport(contextMsg)} />
            ) : null}
            {contextMsg && contextMsg.senderId === me?.id ? (
              <MenuItem icon="trash-outline" label="Delete" destructive onPress={() => contextMsg && doDelete(contextMsg)} />
            ) : null}
          </View>
        </Pressable>
      </Modal>

      <MiniProfile
        visible={!!miniUser}
        member={miniUser}
        onClose={() => setMiniUser(null)}
      />
    </SafeAreaView>
  );
}

function openMembers(router: ReturnType<typeof useRouter>, roomId: string) {
  router.push(`/rooms/members?roomId=${roomId}` as never);
}

/* ── Reaction merge helper ── */
function applyReaction(
  reactions: RoomReaction[],
  p: { emoji: string; count: number; userId: string; added: boolean },
  myId?: string,
): RoomReaction[] {
  const isMe = p.userId === myId;
  const next = reactions.map((r) => ({ ...r }));
  const idx = next.findIndex((r) => r.emoji === p.emoji);
  if (p.count <= 0) {
    return next.filter((r) => r.emoji !== p.emoji);
  }
  if (idx === -1) {
    next.push({ emoji: p.emoji, count: p.count, userReacted: isMe ? p.added : false });
  } else {
    next[idx].count = p.count;
    if (isMe) next[idx].userReacted = p.added;
  }
  return next;
}

/* ── Message bubble ── */
function MessageBubble({
  msg,
  isOwn,
  onAvatar,
  onLongPress,
  onToggleReaction,
}: {
  msg: RoomMessageCard;
  isOwn: boolean;
  onAvatar: () => void;
  onLongPress: () => void;
  onToggleReaction: (emoji: string) => void;
}) {
  const { theme } = useTheme();
  const s = msg.sender;

  return (
    <View style={[styles.msgRow, isOwn ? styles.msgRowOwn : null]}>
      {!isOwn ? (
        <Pressable onPress={onAvatar} style={{ marginRight: 8 }}>
          <Avatar uri={s.profilePhotoUrl} size={36} online={s.isOnline} />
        </Pressable>
      ) : null}

      <View style={{ maxWidth: '78%' }}>
        {!isOwn ? (
          <Pressable onPress={onAvatar} style={styles.senderRow}>
            <Text style={[styles.senderName, { color: theme.brand }]}>{s.firstName ?? 'Someone'}</Text>
            {s.age != null ? <Text style={[styles.senderAge, { color: theme.textTertiary }]}>{s.age}</Text> : null}
            {s.isVerified ? <Ionicons name="checkmark-circle" size={12} color={theme.info} /> : null}
            {s.distanceLabel ? <Text style={[styles.senderDist, { color: theme.textTertiary }]}>{s.distanceLabel}</Text> : null}
          </Pressable>
        ) : null}

        <Pressable onLongPress={onLongPress} delayLongPress={250}>
          {/* reply quote */}
          {msg.replyTo ? (
            <View style={[styles.quote, { backgroundColor: isOwn ? '#ffffff22' : theme.backgroundTertiary, borderLeftColor: isOwn ? '#fff' : theme.brand }]}>
              <Text style={[styles.quoteName, { color: isOwn ? '#fff' : theme.brand }]}>{msg.replyTo.senderFirstName ?? '—'}</Text>
              <Text style={[styles.quoteText, { color: isOwn ? '#ffffffcc' : theme.textSecondary }]} numberOfLines={1}>
                {msg.replyTo.content}
              </Text>
            </View>
          ) : null}

          {isOwn ? (
            <LinearGradient
              colors={theme.gradientWarm}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bubble, styles.bubbleOwn]}
            >
              <Text style={[styles.bubbleText, { color: '#fff', fontStyle: msg.isDeleted ? 'italic' : 'normal' }]}>
                {msg.content}
              </Text>
            </LinearGradient>
          ) : (
            <View style={[styles.bubble, styles.bubbleOther, { backgroundColor: theme.surfaceElevated }]}>
              <Text
                style={[
                  styles.bubbleText,
                  { color: msg.isDeleted ? theme.textTertiary : theme.textPrimary, fontStyle: msg.isDeleted ? 'italic' : 'normal' },
                ]}
              >
                {msg.content}
              </Text>
            </View>
          )}
        </Pressable>

        {/* timestamp + reactions */}
        <View style={[styles.metaRow, isOwn ? { justifyContent: 'flex-end' } : null]}>
          <Text style={[styles.time, { color: theme.textTertiary }]}>{timeLabel(msg.createdAt)}</Text>
        </View>
        {msg.reactions.length > 0 ? (
          <View style={[styles.reactionsRow, isOwn ? { justifyContent: 'flex-end' } : null]}>
            {msg.reactions.map((r) => (
              <Pressable
                key={r.emoji}
                onPress={() => onToggleReaction(r.emoji)}
                style={[
                  styles.reactionPill,
                  { backgroundColor: r.userReacted ? theme.brand + '33' : theme.backgroundTertiary, borderColor: r.userReacted ? theme.brand : 'transparent' },
                ]}
              >
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                <Text style={[styles.reactionCount, { color: theme.textSecondary }]}>{r.count}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DateSeparator({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.dateSepWrap}>
      <View style={[styles.dateSep, { backgroundColor: theme.surfaceElevated }]}>
        <Text style={[styles.dateSepText, { color: theme.textTertiary }]}>{label}</Text>
      </View>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { theme } = useTheme();
  const color = destructive ? theme.error : theme.textPrimary;
  return (
    <Pressable onPress={onPress} style={styles.menuItem}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.menuItemText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontFamily: DisplayFont.bold },
  headerSub: { fontSize: 13, fontFamily: FontFamily.regular, marginTop: 1 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 4, alignSelf: 'flex-start', maxWidth: '100%' },
  msgRowOwn: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  senderName: { fontSize: 13, fontFamily: FontFamily.semibold },
  senderAge: { fontSize: 12, fontFamily: FontFamily.regular },
  senderDist: { fontSize: 11, fontFamily: FontFamily.regular },

  bubble: { paddingVertical: 10, paddingHorizontal: 12 },
  bubbleOther: { borderTopLeftRadius: 4, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  bubbleOwn: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: FontFamily.regular, lineHeight: 20 },

  quote: { borderLeftWidth: 2, paddingLeft: 8, paddingVertical: 4, paddingRight: 8, borderTopLeftRadius: 6, borderTopRightRadius: 6, marginBottom: 2 },
  quoteName: { fontSize: 12, fontFamily: FontFamily.semibold },
  quoteText: { fontSize: 12, fontFamily: FontFamily.regular },

  metaRow: { flexDirection: 'row', marginTop: 2 },
  time: { fontSize: 10, fontFamily: FontFamily.regular },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1 },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 11, fontFamily: FontFamily.medium },

  dateSepWrap: { alignItems: 'center', marginVertical: spacing.sm },
  dateSep: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  dateSepText: { fontSize: 12, fontFamily: FontFamily.medium },

  typing: { fontSize: 12, fontFamily: FontFamily.regular, paddingHorizontal: spacing.lg, paddingBottom: 4 },

  replyBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderLeftWidth: 2, borderRadius: radius.sm },
  replyName: { fontSize: 13, fontFamily: FontFamily.semibold },
  replyContent: { fontSize: 13, fontFamily: FontFamily.regular },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  inputWrap: { flex: 1, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: Platform.OS === 'ios' ? 10 : 4, maxHeight: 110, justifyContent: 'center' },
  input: { fontSize: 15, fontFamily: FontFamily.regular, maxHeight: 90 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  menuBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  menu: { minWidth: 240, borderRadius: radius.lg, paddingVertical: spacing.sm, gap: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  menuItemText: { fontSize: 15, fontFamily: FontFamily.medium },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  emoji: { fontSize: 28 },
});
