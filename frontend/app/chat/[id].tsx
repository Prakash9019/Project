import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { T } from '../../src/components/ui';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import {
  listMessages,
  sendMessage,
  initiateCall,
  ApiError,
} from '../../src/services/api';
import { connectSocket, emitTyping } from '../../src/services/socket';
import { useAuthStore } from '../../src/store/authStore';
import { useChatStore } from '../../src/store/chatStore';
import { clockTime, planAtLeast } from '../../src/lib/format';
import { ChatSkeleton } from '../../src/components/Skeleton';
import { MessageTick } from '../../src/components/MessageTick';
import type { Message } from '../../src/types/api';

const CALL_DISABLED_TOOLTIP =
  'Calls will be enabled after the other person replies to your message at least once.';

export default function Chat() {
  const { id, peerName } = useLocalSearchParams<{ id: string; peerName?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const me = useAuthStore((s) => s.user);
  const markRead = useChatStore((s) => s.markRead);
  const canReadReceipts = planAtLeast(me?.plan, 'premium'); // effectiveLimits.readReceipts
  const listRef = useRef<FlatList<Message>>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upsert = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) {
        return prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m));
      }
      return [...prev, msg];
    });
  }, []);

  // Initial load + mark read.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await listMessages(id);
        if (!active) return;
        setMessages(res.messages);
        setAudioEnabled(res.audioCallEnabled);
        setVideoEnabled(res.videoCallEnabled);
      } catch (e) {
        if (active) setBanner((e as ApiError).message ?? 'Could not load messages');
      } finally {
        if (active) setLoading(false);
      }
    })();
    markRead(id);
    return () => {
      active = false;
    };
  }, [id, markRead]);

  // Socket wiring.
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const socket = await connectSocket();
      if (!socket) return;
      socket.emit('conversation:join', { conversationId: id });

      const onCreated = (p: any) => {
        if (p.conversationId !== id) return;
        upsert(p as Message);
        if (p.senderId !== me?.id) {
          // peer replied → call gate likely opens; the next list refresh / call.enabled confirms
          setPeerTyping(false);
        }
      };
      const onRead = (p: any) => {
        if (p.conversationId !== id) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === me?.id && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m
          )
        );
      };
      const onUnsend = (p: any) => {
        if (p.conversationId !== id) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === p.messageId ? { ...m, isUnsent: true, content: null } : m))
        );
      };
      const onEdited = (p: any) => {
        if (p.conversationId !== id) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === p.messageId ? { ...m, content: p.content, isEdited: true } : m))
        );
      };
      const onCallEnabled = () => {
        setAudioEnabled(true);
        setVideoEnabled(true);
      };
      const onTyping = (p: any) => {
        if (p.conversationId !== id || p.userId === me?.id) return;
        setPeerTyping(!!p.isTyping);
      };

      socket.on('message.created', onCreated);
      socket.on('message.read', onRead);
      socket.on('message.unsend', onUnsend);
      socket.on('message.edited', onEdited);
      socket.on('call.enabled', onCallEnabled);
      socket.on('typing', onTyping);

      cleanup = () => {
        socket.off('message.created', onCreated);
        socket.off('message.read', onRead);
        socket.off('message.unsend', onUnsend);
        socket.off('message.edited', onEdited);
        socket.off('call.enabled', onCallEnabled);
        socket.off('typing', onTyping);
      };
    })();
    return () => cleanup();
  }, [id, me?.id, upsert]);

  const onChangeDraft = (t: string) => {
    setDraft(t);
    if (me) emitTyping(id, me.id, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => me && emitTyping(id, me.id, false), 1500);
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setBanner(null);
    try {
      const res = await sendMessage(id, { type: 'text', content });
      const { audioCallEnabled, videoCallEnabled, ...msg } = res;
      upsert(msg as Message);
      setAudioEnabled(audioCallEnabled);
      setVideoEnabled(videoCallEnabled);
      setDraft('');
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 451) setBanner('Your message is under review.');
      else if (err.status === 403 && err.code === 'interaction_limit_reached') setUpgradeOpen(true);
      else setBanner(err.message ?? 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const startCall = async (type: 'audio' | 'video') => {
    const enabled = type === 'audio' ? audioEnabled : videoEnabled;
    if (!enabled) {
      setTooltip(CALL_DISABLED_TOOLTIP);
      setTimeout(() => setTooltip(null), 3000);
      return;
    }
    try {
      const res = await initiateCall(id, type);
      router.push({
        pathname: '/call/[id]',
        params: {
          id: res.id,
          channel: res.agoraChannelName,
          token: res.agoraToken,
          type: res.type,
          peerName: peerName ?? '',
        },
      });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403 && err.code === 'calls_not_yet_enabled') {
        setTooltip(CALL_DISABLED_TOOLTIP);
        setTimeout(() => setTooltip(null), 3000);
      } else setBanner(err.message ?? 'Could not start call');
    }
  };

  const renderMessage = (item: Message) => {
    const mine = item.senderId === me?.id;
    let body: React.ReactNode;
    if (item.isUnsent) {
      body = <Text style={[styles.removed, { color: mine ? theme.textInverse : theme.textTertiary }]}>message removed</Text>;
    } else if (item.type === 'expiring_photo' || (item.type === 'photo' && item.viewOnce)) {
      body = (
        <View style={styles.mediaChip}>
          <Ionicons name="eye-off-outline" size={16} color={mine ? theme.textInverse : theme.textPrimary} />
          <Text style={mine ? styles.textMe : { color: theme.textPrimary }}>View-once photo</Text>
        </View>
      );
    } else if (item.type === 'photo' || item.type === 'video') {
      body = (
        <View style={styles.mediaChip}>
          <Ionicons name={item.type === 'photo' ? 'image' : 'videocam'} size={16} color={mine ? theme.textInverse : theme.textPrimary} />
          <Text style={mine ? styles.textMe : { color: theme.textPrimary }}>{item.type === 'photo' ? 'Photo' : 'Video'}</Text>
        </View>
      );
    } else if (item.type === 'voice' || item.type === 'voice_note') {
      body = (
        <View style={styles.mediaChip}>
          <Ionicons name="mic" size={16} color={mine ? theme.textInverse : theme.textPrimary} />
          <Text style={mine ? styles.textMe : { color: theme.textPrimary }}>Voice message</Text>
        </View>
      );
    } else {
      body = <Text style={mine ? styles.textMe : { color: theme.textPrimary, fontSize: 15 }}>{item.content}</Text>;
    }

    return (
      <View style={[styles.bubbleRow, mine ? styles.right : styles.left]}>
        <View
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: theme.brand, borderBottomRightRadius: 4 }
              : { backgroundColor: theme.surfaceElevated, borderBottomLeftRadius: 4 },
          ]}
        >
          {body}
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.time, { color: theme.textTertiary }]}>{clockTime(item.createdAt)}</Text>
          {item.isEdited && !item.isUnsent && (
            <Text style={[styles.time, { color: theme.textTertiary }]}> · edited</Text>
          )}
          {mine && !item.isUnsent && (
            <MessageTick status={item.readAt ? 'read' : 'delivered'} isPremium={canReadReceipts} />
          )}
        </View>
      </View>
    );
  };

  const CallButton = ({ type }: { type: 'audio' | 'video' }) => {
    const enabled = type === 'audio' ? audioEnabled : videoEnabled;
    const color = enabled ? (type === 'audio' ? theme.callAudio : theme.callVideo) : theme.callDisabled;
    return (
      <Pressable
        onPress={() => startCall(type)}
        onLongPress={() => {
          if (!enabled) {
            setTooltip(CALL_DISABLED_TOOLTIP);
            setTimeout(() => setTooltip(null), 3000);
          }
        }}
        hitSlop={8}
        style={styles.callBtn}
      >
        <Ionicons name={type === 'audio' ? 'call' : 'videocam'} size={22} color={color} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headProfile}>
          <Text style={[styles.headName, { color: theme.textPrimary }]} numberOfLines={1}>
            {peerName || 'Chat'}
          </Text>
          {peerTyping && <Text style={[styles.headStatus, { color: theme.online }]}>typing…</Text>}
        </View>
        {/* Both call buttons ALWAYS visible; enabled state from API flags. */}
        <CallButton type="audio" />
        <CallButton type="video" />
      </View>

      {tooltip && (
        <View style={[styles.tooltip, { backgroundColor: theme.surfaceElevated }]}>
          <Text style={[styles.tooltipText, { color: theme.textSecondary }]}>{tooltip}</Text>
        </View>
      )}
      {banner && (
        <View style={[styles.banner, { backgroundColor: theme.warning + '22' }]}>
          <Text style={[styles.tooltipText, { color: theme.warning }]}>{banner}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={{ flex: 1 }}
      >
        {loading ? (
          <ChatSkeleton />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => renderMessage(item)}
            automaticallyAdjustKeyboardInsets
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        <View style={[styles.composer, { borderTopColor: theme.border }]}>
          <TextInput
            value={draft}
            onChangeText={onChangeDraft}
            placeholder="Say something…"
            placeholderTextColor={theme.textTertiary}
            multiline
            style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.textPrimary }]}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            style={[styles.sendBtn, { backgroundColor: draft.trim() ? theme.brand : theme.callDisabled }]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.textInverse} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={theme.textInverse} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <UpgradeModal visible={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  headProfile: { flex: 1 },
  headName: { fontSize: 17, fontWeight: '700' },
  headStatus: { fontSize: 12 },
  callBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  tooltip: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10 },
  banner: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10 },
  tooltipText: { fontSize: 12, lineHeight: 17 },
  bubbleRow: { maxWidth: '80%' },
  left: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  textMe: { color: '#fff', fontSize: 15 },
  removed: { fontSize: 14, fontStyle: 'italic' },
  mediaChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, marginHorizontal: 4 },
  time: { fontSize: 11 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, maxHeight: 120, fontSize: 15 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
