import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Modal,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import { ExpiringPhotoViewer } from '../../src/components/ExpiringPhotoViewer';
import { PhotoViewer } from '../../src/components/PhotoViewer';
import {
  listMessages,
  markConversationRead,
  sendMessage,
  initiateCall,
  uploadChatPhoto,
  consumeExpiringPhoto,
  listAlbums,
  getAlbum,
  ApiError,
} from '../../src/services/api';
import { connectSocket, emitTyping } from '../../src/services/socket';
import { useAuthStore } from '../../src/store/authStore';
import { useChatStore } from '../../src/store/chatStore';
import { clockTime, planAtLeast, chatDateHeader, sameCalendarDay } from '../../src/lib/format';
import { ChatSkeleton } from '../../src/components/Skeleton';
import { MessageTick } from '../../src/components/MessageTick';
import type { Message, AlbumSummary } from '../../src/types/api';

const CALL_DISABLED_TOOLTIP =
  'Calls will be enabled after the other person replies to your message at least once.';

type ChatRow =
  | { kind: 'date'; id: string; label: string }
  | { kind: 'message'; message: Message };

function buildRows(messages: Message[]): ChatRow[] {
  const rows: ChatRow[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || !sameCalendarDay(prev.createdAt, m.createdAt)) {
      rows.push({ kind: 'date', id: `d-${m.createdAt}`, label: chatDateHeader(m.createdAt) });
    }
    rows.push({ kind: 'message', message: m });
  });
  return rows;
}

function isViewOnce(msg: Message) {
  return msg.type === 'expiring_photo' || (msg.type === 'photo' && msg.viewOnce);
}

export default function Chat() {
  const params = useLocalSearchParams<{ id: string; peerName?: string; peerPhoto?: string }>();
  const conversationId = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const peerName = Array.isArray(params.peerName) ? params.peerName[0] : params.peerName;
  const peerPhoto = Array.isArray(params.peerPhoto) ? params.peerPhoto[0] : params.peerPhoto;
  const router = useRouter();
  const { theme } = useTheme();
  const me = useAuthStore((s) => s.user);
  const markRead = useChatStore((s) => s.markRead);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const canReadReceipts = planAtLeast(me?.plan, 'premium');
  const listRef = useRef<FlatList<ChatRow>>(null);

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
  const [attachOpen, setAttachOpen] = useState(false);
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [expiringView, setExpiringView] = useState<{ url: string | null; seconds: number; loading: boolean } | null>(null);
  const [photoViewUrl, setPhotoViewUrl] = useState<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = useMemo(() => buildRows(messages), [messages]);

  const upsert = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) {
        return prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m));
      }
      return [...prev, msg];
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setDraft('');
    setBanner(null);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    (async () => {
      try {
        const res = await listMessages(conversationId);
        if (!active) return;
        setMessages(res.messages.reverse());
        setAudioEnabled(res.audioCallEnabled);
        setVideoEnabled(res.videoCallEnabled);
      } catch (e) {
        if (active) setBanner((e as ApiError).message ?? 'Could not load messages');
      } finally {
        if (active) setLoading(false);
      }
    })();
    markRead(conversationId);
    markConversationRead(conversationId).catch(() => {});
    return () => { active = false; };
  }, [conversationId, markRead]);

  useEffect(() => {
    if (!conversationId) return;
    let cleanup = () => {};
    (async () => {
      const socket = await connectSocket();
      if (!socket) return;
      socket.emit('conversation:join', { conversationId });

      const onCreated = (p: Message & { conversationId: string }) => {
        if (p.conversationId !== conversationId) return;
        upsert(p);
        if (p.senderId !== me?.id) setPeerTyping(false);
      };
      const onRead = (p: { conversationId: string }) => {
        if (p.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((m) => (m.senderId === me?.id && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m))
        );
      };
      const onUnsend = (p: { conversationId: string; messageId: string }) => {
        if (p.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === p.messageId ? { ...m, isUnsent: true, content: null } : m))
        );
      };
      const onEdited = (p: { conversationId: string; messageId: string; content: string }) => {
        if (p.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === p.messageId ? { ...m, content: p.content, isEdited: true } : m))
        );
      };
      const onViewed = (p: { conversationId: string; messageId: string; viewedAt: string }) => {
        if (p.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === p.messageId ? { ...m, viewedAt: p.viewedAt, mediaUrls: [] } : m))
        );
      };
      const onCallEnabled = () => {
        setAudioEnabled(true);
        setVideoEnabled(true);
      };
      const onTyping = (p: { conversationId: string; userId: string; isTyping: boolean }) => {
        if (p.conversationId !== conversationId || p.userId === me?.id) return;
        setPeerTyping(!!p.isTyping);
      };

      socket.on('message.created', onCreated);
      socket.on('message.read', onRead);
      socket.on('message.unsend', onUnsend);
      socket.on('message.edited', onEdited);
      socket.on('message.viewed', onViewed);
      socket.on('call.enabled', onCallEnabled);
      socket.on('typing', onTyping);

      cleanup = () => {
        socket.off('message.created', onCreated);
        socket.off('message.read', onRead);
        socket.off('message.unsend', onUnsend);
        socket.off('message.edited', onEdited);
        socket.off('message.viewed', onViewed);
        socket.off('call.enabled', onCallEnabled);
        socket.off('typing', onTyping);
      };
    })();
    return () => cleanup();
  }, [conversationId, me?.id, upsert]);

  const onChangeDraft = (t: string) => {
    setDraft(t);
    if (me && conversationId) emitTyping(conversationId, me.id, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => me && conversationId && emitTyping(conversationId, me.id, false),
      1500
    );
  };

  const postMessage = async (body: Parameters<typeof sendMessage>[1]) => {
    if (!conversationId || sending) return;
    setSending(true);
    setBanner(null);
    try {
      const res = await sendMessage(conversationId, body);
      const { audioCallEnabled, videoCallEnabled, ...msg } = res;
      upsert(msg as Message);
      setAudioEnabled(audioCallEnabled);
      setVideoEnabled(videoCallEnabled);
      fetchConversations('inbox', true).catch(() => {});
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 451) setBanner('Your message is under review.');
      else if (err.status === 403 && err.code === 'interaction_limit_reached') setUpgradeOpen(true);
      else if (err.status === 403 && err.code === 'plan_required') setUpgradeOpen(true);
      else setBanner(err.message ?? 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const content = draft.trim();
    if (!content) return;
    await postMessage({ type: 'text', content });
    setDraft('');
  };

  // Upload + send a single photo as its own message. Adds an optimistic bubble
  // immediately, replaces it with the server message, and re-throws on failure
  // so the caller can stop a batch and surface the error.
  const uploadAndSendPhoto = async (localUri: string, viewOnce: boolean) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Show the local image immediately so the user sees it right away.
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        conversationId,
        senderId: me?.id ?? '',
        type: viewOnce ? 'expiring_photo' : 'photo',
        ciphertext: null,
        content: null,
        mediaUrls: [localUri],
        mediaUrl: localUri,
        viewOnce,
        expiresInSeconds: null,
        viewedAt: null,
        expiresAfterView: false,
        isUnsent: false,
        unsentAt: null,
        isEdited: false,
        editedAt: null,
        translatedContent: null,
        flaggedOffensive: false,
        moderationFlagged: false,
        readAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
      } as Message,
    ]);

    try {
      const gcsPath = await uploadChatPhoto(localUri);
      const apiRes = await sendMessage(conversationId, {
        type: viewOnce ? 'expiring_photo' : 'photo',
        mediaUrls: [gcsPath],
      });
      const { audioCallEnabled, videoCallEnabled, ...msg } = apiRes;
      // Replace the optimistic entry with the real server message (has signed URLs).
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? (msg as Message) : m))
      );
      setAudioEnabled(audioCallEnabled);
      setVideoEnabled(videoCallEnabled);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw e;
    }
  };

  const pickAndSendPhoto = async (viewOnce: boolean) => {
    setAttachOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      orderedSelection: true,
    });
    if (res.canceled || res.assets.length === 0) return;

    setSending(true);
    setBanner(null);
    try {
      // Send each selected photo as its own message, in selection order.
      for (const asset of res.assets) {
        await uploadAndSendPhoto(asset.uri, viewOnce);
      }
      fetchConversations('inbox', true).catch(() => {});
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403 && err.code === 'interaction_limit_reached') setUpgradeOpen(true);
      else if (err.status === 403 && err.code === 'plan_required') setUpgradeOpen(true);
      else setBanner(err.message ?? 'Could not send photo');
    } finally {
      setSending(false);
    }
  };

  const openAlbumPicker = async () => {
    setAttachOpen(false);
    setAlbumPickerOpen(true);
    setAlbumsLoading(true);
    try {
      const res = await listAlbums();
      setAlbums(res.albums);
    } catch {
      Alert.alert('Could not load albums');
      setAlbumPickerOpen(false);
    } finally {
      setAlbumsLoading(false);
    }
  };

  const shareAlbum = async (album: AlbumSummary) => {
    setAlbumPickerOpen(false);
    setSending(true);
    try {
      const detail = await getAlbum(album.id);
      const paths = detail.photos.slice(0, 10).map((p) => p.path ?? p.url);
      if (paths.length === 0) {
        Alert.alert('Empty album', 'Add photos to this album first.');
        return;
      }
      await postMessage({
        type: 'photo',
        content: `📁 ${album.title}`,
        mediaUrls: paths,
      });
    } catch (e) {
      setBanner((e as ApiError).message ?? 'Could not share album');
    } finally {
      setSending(false);
    }
  };

  const openViewOnce = async (item: Message) => {
    const mine = item.senderId === me?.id;
    if (mine) {
      const url = item.mediaUrls[0] ?? item.mediaUrl;
      if (url) setPhotoViewUrl(url);
      return;
    }
    if (item.viewedAt) return;
    setExpiringView({ url: null, seconds: item.expiresInSeconds ?? 10, loading: true });
    try {
      const res = await consumeExpiringPhoto(conversationId, item.id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === item.id ? { ...m, viewedAt: res.viewedAt, mediaUrls: [] } : m
        )
      );
      setExpiringView({
        url: res.url,
        seconds: res.expiresInSeconds ?? item.expiresInSeconds ?? 10,
        loading: false,
      });
    } catch (e) {
      setExpiringView(null);
      setBanner((e as ApiError).message ?? 'Could not open photo');
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
      const res = await initiateCall(conversationId, type);
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

  const renderMessageBody = (item: Message, mine: boolean) => {
    if (item.isUnsent) {
      return <Text style={[styles.removed, { color: mine ? theme.textInverse : theme.textTertiary }]}>message removed</Text>;
    }

    if (isViewOnce(item)) {
      const opened = !!item.viewedAt && !mine;
      const thumb = item.mediaUrls[0] ?? item.mediaUrl;
      return (
        <Pressable onPress={() => openViewOnce(item)} disabled={opened && !mine}>
          <View style={[styles.snapTile, opened && !mine && styles.snapOpened]}>
            {thumb && mine ? (
              <Image source={{ uri: thumb }} style={styles.snapImage} contentFit="cover" transition={120} cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.snapPlaceholder, { backgroundColor: mine ? 'rgba(255,255,255,0.15)' : theme.backgroundTertiary }]}>
                <Ionicons name="eye-off-outline" size={28} color={mine ? '#fff' : theme.brand} />
              </View>
            )}
            <View style={styles.snapLabel}>
              <Ionicons name="eye-off-outline" size={14} color={mine ? '#fff' : theme.textPrimary} />
              <Text style={mine ? styles.textMe : { color: theme.textPrimary, fontSize: 13 }}>
                {opened && !mine ? 'Opened' : mine ? 'View once · Sent' : 'Tap to view'}
              </Text>
            </View>
          </View>
        </Pressable>
      );
    }

    if (item.type === 'photo' && item.mediaUrls.length > 0) {
      const isAlbum = item.content?.startsWith('📁 ');
      return (
        <Pressable onPress={() => setPhotoViewUrl(item.mediaUrls[0] ?? item.mediaUrl)}>
          <View style={styles.photoStack}>
            <Image source={{ uri: item.mediaUrls[0] }} style={styles.chatPhoto} contentFit="cover" transition={120} cachePolicy="memory-disk" />
            {item.mediaUrls.length > 1 && (
              <View style={styles.multiBadge}>
                <Text style={styles.multiBadgeText}>+{item.mediaUrls.length - 1}</Text>
              </View>
            )}
            {isAlbum && (
              <Text style={[styles.albumCaption, mine ? styles.textMe : { color: theme.textPrimary }]}>
                {item.content}
              </Text>
            )}
          </View>
        </Pressable>
      );
    }

    if (item.type === 'video') {
      return (
        <View style={styles.mediaChip}>
          <Ionicons name="videocam" size={16} color={mine ? theme.textInverse : theme.textPrimary} />
          <Text style={mine ? styles.textMe : { color: theme.textPrimary }}>Video</Text>
        </View>
      );
    }

    if (item.type === 'voice' || item.type === 'voice_note') {
      return (
        <View style={styles.mediaChip}>
          <Ionicons name="mic" size={16} color={mine ? theme.textInverse : theme.textPrimary} />
          <Text style={mine ? styles.textMe : { color: theme.textPrimary }}>Voice message</Text>
        </View>
      );
    }

    return (
      <Text style={mine ? styles.textMe : { color: theme.textPrimary, fontSize: 15, fontFamily: FontFamily.regular }}>
        {item.content}
      </Text>
    );
  };

  const renderRow = ({ item: row }: { item: ChatRow }) => {
    if (row.kind === 'date') {
      return (
        <View style={styles.dateRow}>
          <Text style={[styles.dateLabel, { color: theme.textTertiary, backgroundColor: theme.surfaceElevated }]}>
            {row.label}
          </Text>
        </View>
      );
    }

    const item = row.message;
    const mine = item.senderId === me?.id;
    const body = renderMessageBody(item, mine);

    return (
      <View style={[styles.bubbleRow, mine ? styles.right : styles.left]}>
        {mine ? (
          <LinearGradient colors={theme.gradientWarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, isViewOnce(item) ? styles.snapBubble : null, { borderBottomRightRadius: 4 }]}>
            {body}
          </LinearGradient>
        ) : (
          <View style={[styles.bubble, isViewOnce(item) ? styles.snapBubble : null, { backgroundColor: theme.surfaceElevated, borderBottomLeftRadius: 4 }]}>
            {body}
          </View>
        )}
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
        {peerPhoto ? (
          <Image source={{ uri: peerPhoto }} style={styles.headAvatar} contentFit="cover" transition={120} cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.headAvatar, { backgroundColor: theme.backgroundTertiary, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="person" size={20} color={theme.textTertiary} />
          </View>
        )}
        <View style={styles.headProfile}>
          <Text style={[styles.headName, { color: theme.textPrimary }]} numberOfLines={1}>
            {peerName || 'Chat'}
          </Text>
          {peerTyping && <Text style={[styles.headStatus, { color: theme.online }]}>typing…</Text>}
        </View>
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

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1 }}>
        {loading ? (
          <ChatSkeleton />
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => (r.kind === 'date' ? r.id : r.message.id)}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={renderRow}
            automaticallyAdjustKeyboardInsets
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        <View style={[styles.composer, { borderTopColor: theme.border }]}>
          <Pressable onPress={() => setAttachOpen(true)} style={styles.attachBtn} disabled={sending}>
            <Ionicons name="image-outline" size={24} color={theme.brand} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={onChangeDraft}
            placeholder="Say something…"
            placeholderTextColor={theme.textTertiary}
            multiline
            style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.textPrimary }]}
          />
          <Pressable onPress={send} disabled={!draft.trim() || sending}>
            <LinearGradient
              colors={draft.trim() ? theme.gradientWarm : [theme.callDisabled, theme.callDisabled]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendBtn}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="arrow-up" size={20} color="#fff" />
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={attachOpen} transparent animationType="slide" onRequestClose={() => setAttachOpen(false)}>
        <Pressable style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]} onPress={() => setAttachOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Send</Text>
            <Pressable style={styles.sheetRow} onPress={() => pickAndSendPhoto(false)}>
              <Ionicons name="image" size={22} color={theme.brand} />
              <Text style={[styles.sheetLabel, { color: theme.textPrimary }]}>Photo</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={() => pickAndSendPhoto(true)}>
              <Ionicons name="eye-off" size={22} color={theme.brand} />
              <Text style={[styles.sheetLabel, { color: theme.textPrimary }]}>View once</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={openAlbumPicker}>
              <Ionicons name="albums" size={22} color={theme.brand} />
              <Text style={[styles.sheetLabel, { color: theme.textPrimary }]}>Share album</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={albumPickerOpen} transparent animationType="slide" onRequestClose={() => setAlbumPickerOpen(false)}>
        <View style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.sheet, { backgroundColor: theme.surface, maxHeight: '60%' }]}>
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Share album</Text>
            {albumsLoading ? (
              <ActivityIndicator color={theme.brand} style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={albums}
                keyExtractor={(a) => a.id}
                ListEmptyComponent={
                  <Text style={[styles.emptyAlbums, { color: theme.textSecondary }]}>No albums yet. Create one from Inbox → Albums.</Text>
                }
                renderItem={({ item }) => (
                  <Pressable style={styles.sheetRow} onPress={() => shareAlbum(item)}>
                    <Ionicons name="folder" size={22} color={theme.brand} />
                    <Text style={[styles.sheetLabel, { color: theme.textPrimary }]}>{item.title} ({item.photoCount})</Text>
                  </Pressable>
                )}
              />
            )}
            <Pressable style={styles.cancelSheet} onPress={() => setAlbumPickerOpen(false)}>
              <Text style={{ color: theme.textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ExpiringPhotoViewer
        visible={!!expiringView}
        url={expiringView?.url ?? null}
        expiresInSeconds={expiringView?.seconds ?? 10}
        loading={expiringView?.loading}
        onClose={() => setExpiringView(null)}
      />
      <PhotoViewer visible={!!photoViewUrl} url={photoViewUrl} onClose={() => setPhotoViewUrl(null)} />

      <UpgradeModal visible={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  headAvatar: { width: 36, height: 36, borderRadius: 18 },
  headProfile: { flex: 1 },
  headName: { fontSize: 17, fontFamily: DisplayFont.bold, fontWeight: '700' },
  headStatus: { fontSize: 12, fontFamily: FontFamily.medium },
  callBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  tooltip: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10 },
  banner: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10 },
  tooltipText: { fontSize: 12, fontFamily: FontFamily.regular, lineHeight: 17 },
  dateRow: { alignItems: 'center', marginVertical: 8 },
  dateLabel: { fontSize: 12, fontFamily: FontFamily.medium, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  bubbleRow: { maxWidth: '82%' },
  left: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  snapBubble: { padding: 6 },
  textMe: { color: '#fff', fontSize: 15, fontFamily: FontFamily.regular },
  removed: { fontSize: 14, fontFamily: FontFamily.regular, fontStyle: 'italic' },
  mediaChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  snapTile: { width: 160, borderRadius: 12, overflow: 'hidden' },
  snapOpened: { opacity: 0.55 },
  snapImage: { width: 160, height: 200 },
  snapPlaceholder: { width: 160, height: 200, alignItems: 'center', justifyContent: 'center' },
  snapLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  chatPhoto: { width: 200, height: 200, borderRadius: 12 },
  photoStack: { gap: 6 },
  multiBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  multiBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  albumCaption: { fontSize: 13, fontFamily: FontFamily.medium },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, marginHorizontal: 4 },
  time: { fontSize: 11, fontFamily: FontFamily.regular },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  attachBtn: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, maxHeight: 120, fontSize: 15, fontFamily: FontFamily.regular },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetLabel: { fontSize: 16, fontWeight: '600' },
  cancelSheet: { alignItems: 'center', marginTop: 8 },
  emptyAlbums: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
});
