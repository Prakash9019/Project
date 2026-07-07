import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { MiniProfile } from '../../src/components/MiniProfile';
import { RoomHeader } from '../../src/components/rooms/RoomHeader';
import { MessageBubble } from '../../src/components/rooms/MessageBubble';
import { ReplyPreview } from '../../src/components/rooms/ReplyPreview';
import { EmojiPicker } from '../../src/components/rooms/EmojiPicker';
import { AttachmentSheet, type AttachmentKind } from '../../src/components/rooms/AttachmentSheet';
import type { GifResult } from '../../src/components/rooms/GifPicker';
import { ContextMenu } from '../../src/components/rooms/ContextMenu';
import { VoiceRecorder } from '../../src/components/rooms/VoiceRecorder';
import { useTheme, FontFamily, FontSize, spacing, radius } from '../../src/theme';
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
  pinRoomMessage,
} from '../../src/services/api';
import {
  connectSocket,
  getSocket,
  emitRoomJoin,
  emitRoomLeave,
  emitRoomTyping,
  emitRoomMessageDelivered,
} from '../../src/services/socket';
import { uploadToR2 } from '../../src/utils/uploadToR2';
import { toastApiError, showSuccess, showError } from '../../src/lib/toast';
import type { RoomDetail, RoomMessageCard, RoomReaction, RoomUserCard } from '../../src/types/api';

const PAGE = 30;

type PendingImage = { id: string; uri: string; status: 'queued' | 'uploading' | 'failed' };

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

export default function RoomChat() {
  const { theme } = useTheme();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const params = useLocalSearchParams<{ id: string; unread?: string }>();
  const roomId = String(params.id);
  const initialUnread = params.unread ? parseInt(params.unread, 10) || 0 : 0;

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

  const [showEmoji, setShowEmoji] = useState(false);
  const [reactTarget, setReactTarget] = useState<RoomMessageCard | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [pinnedDismissed, setPinnedDismissed] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Image sending — supports multi-select with sequential upload + per-image retry.
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [uploadingInfo, setUploadingInfo] = useState<{ current: number; total: number } | null>(null);
  const imageSeq = useRef(0);

  // Search-in-chat
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);

  const listRef = useRef<FlashListRef<RoomMessageCard>>(null);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingSent = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordCancelled = useRef(false);
  const holdingRef = useRef(false);

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

  // ── Socket wiring (unchanged logic) ──
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
        // Report delivery for other members' messages so their tick goes double-grey.
        if (msg.senderId !== me?.id) emitRoomMessageDelivered(roomId, msg.id);
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
      };
      const onDelivered = (p: { messageId: string }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === p.messageId ? { ...m, deliveredCount: m.deliveredCount + 1 } : m)),
        );
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

      const onInfoUpdated = (p: { name?: string; description?: string | null; coverImageUrl?: string }) => {
        setRoom((prev) =>
          prev
            ? {
                ...prev,
                ...(p.name !== undefined ? { name: p.name } : {}),
                ...(p.description !== undefined ? { description: p.description } : {}),
                ...(p.coverImageUrl !== undefined ? { coverImageUrl: p.coverImageUrl } : {}),
              }
            : prev,
        );
      };
      const onPinned = (p: { messageId: string; isPinned: boolean }) => {
        setPinnedDismissed(false);
        setMessages((prev) => prev.map((m) => (m.id === p.messageId ? { ...m, isPinned: p.isPinned } : m)));
      };
      const onMemberRemoved = (p: { userId: string }) => {
        if (p.userId === me?.id) {
          showError('You were removed from this group');
          router.replace('/(tabs)/groups' as Href);
        }
      };
      const onRoleChanged = (p: { userId: string; role: 'admin' | 'member' }) => {
        // If my own role changed, refresh admin affordances (pin, etc.).
        if (p.userId === me?.id) setRoom((prev) => (prev ? { ...prev, myRole: p.role } : prev));
      };
      const onRoomDeleted = (p: { roomId: string }) => {
        if (p.roomId !== roomId) return;
        showError('This group has been deleted');
        router.replace('/(tabs)/groups' as Href);
      };
      const onOwnershipTransferred = (p: { newCreatorId: string }) => {
        // Creator status is derived from the new creatorId; update my affordances.
        setRoom((prev) => (prev ? { ...prev, isCreator: p.newCreatorId === me?.id } : prev));
      };

      socket.on('room:message', onMessage);
      socket.on('room:message_delivered', onDelivered);
      socket.on('room:message_reaction', onReaction);
      socket.on('room:message_deleted', onDeleted);
      socket.on('room:typing', onTyping);
      socket.on('room:info_updated', onInfoUpdated);
      socket.on('room:message_pinned', onPinned);
      socket.on('room:member_removed', onMemberRemoved);
      socket.on('room:member_role_changed', onRoleChanged);
      socket.on('room:deleted', onRoomDeleted);
      socket.on('room:ownership_transferred', onOwnershipTransferred);

      cleanupRef.current = () => {
        socket.off('room:message', onMessage);
        socket.off('room:message_delivered', onDelivered);
        socket.off('room:message_reaction', onReaction);
        socket.off('room:message_deleted', onDeleted);
        socket.off('room:typing', onTyping);
        socket.off('room:info_updated', onInfoUpdated);
        socket.off('room:message_pinned', onPinned);
        socket.off('room:member_removed', onMemberRemoved);
        socket.off('room:member_role_changed', onRoleChanged);
        socket.off('room:deleted', onRoomDeleted);
        socket.off('room:ownership_transferred', onOwnershipTransferred);
        emitRoomLeave(roomId);
      };
    })();

    return () => {
      mounted = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
      Object.values(typingTimers.current).forEach(clearTimeout);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, [roomId, me?.id]);

  // ── Load older ──
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

  // ── Send text ──
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
      const msg = await sendRoomMessage(roomId, { content, type: 'text', replyToId: replyTo?.id });
      setText('');
      setReplyTo(null);
      setShowEmoji(false);
      emitRoomTyping(roomId, false);
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

  // ── Send image(s) — direct-to-R2 room_image upload, one message per image ──
  // Uploads happen sequentially (avoids rate-limiting); each image gets its own
  // preview chip that shows progress and, on failure, an individual retry button.
  const uploadOneImage = async (uri: string) => {
    const url = await uploadToR2(uri, 'room_image', 'image/jpeg', { roomId });
    const msg = await sendRoomMessage(roomId, {
      content: '',
      type: 'image',
      mediaUrl: url,
      replyToId: replyTo?.id,
    });
    appendMessage(msg);
  };

  const processImages = useCallback(
    async (items: PendingImage[]) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setUploadingInfo({ current: i + 1, total: items.length });
        setPendingImages((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading' } : p)));
        try {
          await uploadOneImage(item.uri);
          setPendingImages((prev) => prev.filter((p) => p.id !== item.id));
        } catch (e) {
          setPendingImages((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'failed' } : p)));
          toastApiError(e, 'Could not send photo');
        }
      }
      setUploadingInfo(null);
    },
    // uploadOneImage closes over roomId/replyTo which are stable enough here
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomId, replyTo?.id],
  );

  const queueImages = (uris: string[]) => {
    const items: PendingImage[] = uris.map((uri) => ({
      id: `img-${imageSeq.current++}`,
      uri,
      status: 'queued',
    }));
    setPendingImages((prev) => [...prev, ...items]);
    processImages(items);
  };

  const retryImage = (item: PendingImage) => {
    processImages([item]);
  };

  const removePendingImage = (id: string) => {
    setPendingImages((prev) => prev.filter((p) => p.id !== id));
  };

  // Run an R2 upload with a visible progress bar, then reset.
  const runUpload = async (fn: () => Promise<void>) => {
    setUploadProgress(0);
    try {
      await fn();
    } catch (e) {
      toastApiError(e, 'Upload failed');
    } finally {
      setUploadProgress(null);
    }
  };

  const appendMessage = (msg: RoomMessageCard) => {
    setReplyTo(null);
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
  };

  const sendVideo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.7,
    });
    if (res.canceled || !res.assets[0]) return;
    await runUpload(async () => {
      const url = await uploadToR2(res.assets[0].uri, 'video', 'video/mp4', { onProgress: setUploadProgress });
      const msg = await sendRoomMessage(roomId, { content: '', type: 'image', mediaUrl: url, replyToId: replyTo?.id });
      appendMessage(msg);
    });
  };

  const sendDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const file = res.assets[0];
    const ext = file.name?.includes('.') ? file.name.split('.').pop() : undefined;
    await runUpload(async () => {
      const url = await uploadToR2(file.uri, 'document', file.mimeType || 'application/octet-stream', {
        ext,
        onProgress: setUploadProgress,
      });
      const msg = await sendRoomMessage(roomId, {
        content: `📄 ${file.name ?? 'Document'}`,
        type: 'text',
        mediaUrl: url,
        replyToId: replyTo?.id,
      });
      appendMessage(msg);
    });
  };

  const sendAudioFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const file = res.assets[0];
    await runUpload(async () => {
      const url = await uploadToR2(file.uri, 'audio', file.mimeType || 'audio/mpeg', {
        onProgress: setUploadProgress,
      });
      const msg = await sendRoomMessage(roomId, {
        content: `🎵 ${file.name ?? 'Audio'}`,
        type: 'text',
        mediaUrl: url,
        replyToId: replyTo?.id,
      });
      appendMessage(msg);
    });
  };

  // ── Send GIF (Tenor URL is already hosted — no R2 upload) ──
  const sendGif = async (gif: GifResult) => {
    setSending(true);
    try {
      const msg = await sendRoomMessage(roomId, {
        content: '',
        type: 'image',
        mediaUrl: gif.url,
        replyToId: replyTo?.id,
      });
      setReplyTo(null);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
    } catch (e) {
      toastApiError(e, 'Could not send GIF');
    } finally {
      setSending(false);
    }
  };

  // ── Reactions ──
  const toggleReaction = async (msg: RoomMessageCard, emoji: string) => {
    setContextMsg(null);
    setReactTarget(null);
    try {
      await reactToRoomMessage(roomId, msg.id, emoji);
    } catch (e) {
      toastApiError(e, 'Could not react');
    }
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

  const doCopy = async (msg: RoomMessageCard) => {
    setContextMsg(null);
    await Clipboard.setStringAsync(msg.content);
    showSuccess('Copied');
  };

  const isAdmin = room?.isCreator === true || room?.myRole === 'admin';

  const doPin = async (msg: RoomMessageCard) => {
    setContextMsg(null);
    const next = !msg.isPinned;
    // Optimistic: banner updates immediately; socket echo keeps others in sync.
    setPinnedDismissed(false);
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isPinned: next } : m)));
    try {
      await pinRoomMessage(roomId, msg.id, next);
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isPinned: !next } : m)));
      toastApiError(e, 'Could not pin message');
    }
  };

  // ── Room menu actions ──
  const handleMute = async () => {
    setMenuOpen(false);
    try {
      const res = await muteRoom(roomId);
      showSuccess(res.muted ? 'Notifications muted' : 'Notifications unmuted');
    } catch (e) {
      toastApiError(e);
    }
  };
  const handleReportRoom = async () => {
    setMenuOpen(false);
    try {
      await reportRoom(roomId, 'inappropriate');
      showSuccess('Group reported');
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

  const openInfo = () => router.push(`/rooms/info?roomId=${roomId}` as Href);

  // ── Attachments ──
  const onPickAttachment = async (kind: AttachmentKind) => {
    if (kind === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return showError('Camera permission needed');
      const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!res.canceled && res.assets[0]) queueImages([res.assets[0].uri]);
    } else if (kind === 'gallery') {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.8,
      });
      if (!res.canceled && res.assets.length) queueImages(res.assets.map((a) => a.uri));
    } else if (kind === 'location') {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return showError('Location permission needed');
        const pos = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = pos.coords;
        const msg = await sendRoomMessage(roomId, {
          content: `📍 Location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          type: 'text',
        });
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]));
      } catch {
        showError('Could not get location');
      }
    } else if (kind === 'video') {
      await sendVideo();
    } else if (kind === 'document') {
      await sendDocument();
    } else if (kind === 'audio') {
      await sendAudioFile();
    } else if (kind === 'sticker') {
      showSuccess('Sticker packs coming soon');
    } else {
      showSuccess('Coming soon');
    }
  };

  // ── Voice recording (expo-audio → R2 → { type:'voice' }) ──
  const startRecording = async () => {
    holdingRef.current = true;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        showError('Microphone permission needed');
        holdingRef.current = false;
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      // User already released before init finished — discard immediately.
      if (!holdingRef.current) {
        await audioRecorder.stop().catch(() => {});
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        return;
      }
      audioRecorder.record();
      recordCancelled.current = false;
      setRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {
      showError('Could not start recording');
      holdingRef.current = false;
    }
  };

  const stopRecording = async () => {
    holdingRef.current = false;
    if (!audioRecorder.isRecording) return;
    setRecording(false);
    let uri: string | null = null;
    let durationMs = 0;
    try {
      await audioRecorder.stop();
      const status = audioRecorder.getStatus();
      durationMs = status.durationMillis ?? 0;
      uri = audioRecorder.uri;
    } catch {
      /* already stopped */
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});

    // Discard cancelled or too-short (< 1s) recordings.
    if (recordCancelled.current || !uri || durationMs < 1000) {
      recordCancelled.current = false;
      return;
    }

    await runUpload(async () => {
      const url = await uploadToR2(uri!, 'voice_clip', 'audio/mp4', { onProgress: setUploadProgress });
      const msg = await sendRoomMessage(roomId, {
        content: '',
        type: 'voice',
        mediaUrl: url,
        replyToId: replyTo?.id,
      });
      appendMessage(msg);
    });
  };

  // ── Reply / swipe ──
  const onSwipeReply = useCallback((msg: RoomMessageCard) => {
    setReplyTo(msg);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const scrollToMessage = useCallback(
    (messageId: string) => {
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return;
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      setHighlightId(messageId);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 1500);
    },
    [messages],
  );

  const typingText = (() => {
    const names = Object.values(typingUsers);
    if (names.length === 0) return null;
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return 'Several people are typing…';
  })();

  const pinned = useMemo(
    () => (pinnedDismissed ? null : messages.find((m) => m.isPinned && !m.isDeleted) ?? null),
    [messages, pinnedDismissed],
  );

  // ── Search matches ──
  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as number[];
    const idxs: number[] = [];
    messages.forEach((m, i) => {
      if (!m.isDeleted && m.content.toLowerCase().includes(q)) idxs.push(i);
    });
    return idxs;
  }, [searchQuery, messages]);

  useEffect(() => {
    setMatchIdx(0);
  }, [searchQuery]);

  const jumpMatch = (dir: 1 | -1) => {
    if (matches.length === 0) return;
    const next = (matchIdx + dir + matches.length) % matches.length;
    setMatchIdx(next);
    const idx = matches[next];
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setHighlightId(messages[idx]?.id ?? null);
  };

  const searchHighlightId = searchMode && matches.length ? messages[matches[matchIdx]]?.id : null;

  const renderItem = useCallback(
    ({ item, index }: { item: RoomMessageCard; index: number }) => {
      const older = messages[index + 1];
      const showDateSep = !older || dayKey(older.createdAt) !== dayKey(item.createdAt);
      const showUnread = initialUnread > 0 && index === initialUnread - 1;
      const isOwn = item.senderId === me?.id;
      // Group ticks: single grey until ≥1 other member received it (double grey).
      // Never blue/read — WhatsApp shows no read receipts in groups.
      const deliveryStatus: 'sent' | 'delivered' = item.deliveredCount >= 1 ? 'delivered' : 'sent';
      return (
        <View style={styles.invertRow}>
          {/* Day/unread dividers render BEFORE the bubble so they sit ABOVE the
              day's oldest message (in this list within-row order == visual order). */}
          {showDateSep ? <DateSeparator label={dayLabel(item.createdAt)} /> : null}
          {showUnread ? <UnreadDivider /> : null}
          <MessageBubble
            message={item}
            isOwn={isOwn}
            deliveryStatus={deliveryStatus}
            highlight={highlightId === item.id || searchHighlightId === item.id}
            onAvatarPress={() => setMiniUser(item.sender)}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setContextMsg(item);
            }}
            onSwipeReply={() => onSwipeReply(item)}
            onReactionPress={(emoji) => toggleReaction(item, emoji)}
            onReplyPress={() => item.replyTo && scrollToMessage(item.replyTo.id)}
          />
        </View>
      );
    },
    // toggleReaction stable enough; deps kept minimal to avoid re-renders
    [messages, me?.id, highlightId, searchHighlightId, initialUnread, onSwipeReply, scrollToMessage],
  );

  const hasText = text.trim().length > 0;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Header or search bar */}
      {searchMode ? (
        <View style={[styles.searchHeader, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => { setSearchMode(false); setSearchQuery(''); }} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
          </Pressable>
          <View style={[styles.searchInputWrap, { backgroundColor: theme.surfaceElevated }]}>
            <Ionicons name="search" size={18} color={theme.textTertiary} />
            <TextInput
              autoFocus
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search in chat"
              placeholderTextColor={theme.textTertiary}
              style={[styles.searchInput, { color: theme.textPrimary }]}
            />
          </View>
          {searchQuery.trim() ? (
            <View style={styles.searchNav}>
              <Text style={[styles.matchCount, { color: theme.textSecondary }]}>
                {matches.length ? `${matchIdx + 1} of ${matches.length}` : '0'}
              </Text>
              <Pressable onPress={() => jumpMatch(-1)} hitSlop={6}>
                <Ionicons name="chevron-up" size={22} color={theme.textPrimary} />
              </Pressable>
              <Pressable onPress={() => jumpMatch(1)} hitSlop={6}>
                <Ionicons name="chevron-down" size={22} color={theme.textPrimary} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : (
        <RoomHeader
          room={room}
          onBack={() => router.back()}
          onOpenInfo={openInfo}
          onSearch={() => setSearchMode(true)}
          onMenu={() => setMenuOpen(true)}
        />
      )}

      {/* Pinned banner */}
      {pinned && !searchMode ? (
        <Pressable
          onPress={() => scrollToMessage(pinned.id)}
          style={[styles.pinnedBanner, { backgroundColor: theme.surfaceElevated, borderLeftColor: theme.brand }]}
        >
          <Ionicons name="pin" size={16} color={theme.brand} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.pinnedLabel, { color: theme.brand }]}>Pinned message</Text>
            <Text style={[styles.pinnedText, { color: theme.textSecondary }]} numberOfLines={1}>
              {pinned.content || 'Photo'}
            </Text>
          </View>
          <Pressable onPress={() => setPinnedDismissed(true)} hitSlop={8}>
            <Ionicons name="close" size={18} color={theme.textTertiary} />
          </Pressable>
        </Pressable>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={{ flex: 1 }}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.brand} />
          </View>
        ) : (
          <FlashList
            ref={listRef}
            data={messages}
            style={styles.invertList}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.md }}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingOlder ? (
                <View style={styles.invertRow}>
                  <ActivityIndicator color={theme.brand} style={{ marginVertical: spacing.md }} />
                </View>
              ) : null
            }
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          />
        )}

        {typingText ? <Text style={[styles.typing, { color: theme.textTertiary }]}>{typingText}</Text> : null}

        {/* Upload progress */}
        {uploadProgress !== null ? (
          <View style={styles.uploadBar}>
            <Ionicons name="cloud-upload-outline" size={16} color={theme.brand} />
            <View style={[styles.uploadTrack, { backgroundColor: theme.surfaceElevated }]}>
              <View
                style={[
                  styles.uploadFill,
                  { backgroundColor: theme.brand, width: `${Math.round(uploadProgress * 100)}%` },
                ]}
              />
            </View>
            <Text style={[styles.uploadLabel, { color: theme.textSecondary }]}>
              {Math.round(uploadProgress * 100)}%
            </Text>
          </View>
        ) : null}

        {/* Pending-image strip (multi-select upload) */}
        {pendingImages.length ? (
          <View style={styles.pendingWrap}>
            {uploadingInfo ? (
              <Text style={[styles.pendingLabel, { color: theme.textSecondary }]}>
                Uploading {uploadingInfo.current} of {uploadingInfo.total}…
              </Text>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingRow}>
              {pendingImages.map((p) => (
                <View key={p.id} style={styles.pendingChip}>
                  <Image source={{ uri: p.uri }} style={styles.pendingThumb} contentFit="cover" />
                  {p.status === 'uploading' ? (
                    <View style={styles.pendingOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  ) : null}
                  {p.status === 'failed' ? (
                    <Pressable style={[styles.pendingOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => retryImage(p)}>
                      <Ionicons name="reload" size={20} color="#fff" />
                    </Pressable>
                  ) : null}
                  {p.status === 'failed' ? (
                    <Pressable style={styles.pendingRemove} onPress={() => removePendingImage(p.id)} hitSlop={6}>
                      <Ionicons name="close-circle" size={18} color="#fff" />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Reply preview bar */}
        {replyTo ? (
          <View style={{ marginHorizontal: spacing.md, marginBottom: 4 }}>
            <ReplyPreview
              senderName={replyTo.sender.firstName}
              content={replyTo.content || 'Photo'}
              onCancel={() => setReplyTo(null)}
            />
          </View>
        ) : null}

        {/* Input bar */}
        {!searchMode ? (
          <View style={[styles.inputBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
            {recording ? (
              <VoiceRecorder cancelling={false} />
            ) : (
              <>
                <Pressable onPress={() => setShowEmoji((v) => !v)} hitSlop={6} style={styles.iconBtn}>
                  <Ionicons name={showEmoji ? 'close' : 'happy-outline'} size={24} color={theme.textSecondary} />
                </Pressable>
                <View style={[styles.inputWrap, { backgroundColor: theme.surfaceElevated }]}>
                  <TextInput
                    value={text}
                    onChangeText={onChangeText}
                    onFocus={() => setShowEmoji(false)}
                    placeholder="Message"
                    placeholderTextColor={theme.textTertiary}
                    style={[styles.input, { color: theme.textPrimary }]}
                    multiline
                  />
                </View>
                {!hasText ? (
                  <>
                    <Pressable onPress={() => setAttachOpen(true)} hitSlop={6} style={styles.iconBtn}>
                      <Ionicons name="add-circle-outline" size={26} color={theme.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => onPickAttachment('camera')}
                      onLongPress={startRecording}
                      onPressOut={stopRecording}
                      delayLongPress={250}
                      hitSlop={6}
                      style={styles.iconBtn}
                    >
                      <Ionicons name="camera-outline" size={24} color={theme.textSecondary} />
                    </Pressable>
                  </>
                ) : null}
              </>
            )}

            {hasText && !recording ? (
              <Pressable onPress={send} disabled={sending}>
                <LinearGradient
                  colors={theme.gradientWarm}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sendBtn}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="arrow-up" size={22} color="#fff" />
                  )}
                </LinearGradient>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Emoji panel (compose) */}
        {showEmoji && !searchMode ? <EmojiPicker onSelect={(e) => setText((t) => t + e)} /> : null}
      </KeyboardAvoidingView>

      {/* Room three-dot menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: theme.overlay }]} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { backgroundColor: theme.surface }]}>
            <MenuItem icon="search-outline" label="Search in chat" onPress={() => { setMenuOpen(false); setSearchMode(true); }} />
            <MenuItem icon="information-circle-outline" label="Group Info" onPress={() => { setMenuOpen(false); openInfo(); }} />
            <MenuItem icon="notifications-off-outline" label="Mute Notifications" onPress={handleMute} />
            <MenuItem icon="flag-outline" label="Report Group" onPress={handleReportRoom} />
            <MenuItem icon="exit-outline" label="Leave Group" destructive onPress={handleLeave} />
          </View>
        </Pressable>
      </Modal>

      {/* Long-press context menu */}
      <ContextMenu
        message={contextMsg}
        isOwn={contextMsg?.senderId === me?.id}
        isAdmin={isAdmin}
        onClose={() => setContextMsg(null)}
        onReact={(e) => contextMsg && toggleReaction(contextMsg, e)}
        onOpenEmojiPicker={() => {
          setReactTarget(contextMsg);
          setContextMsg(null);
        }}
        onReply={() => { setReplyTo(contextMsg); setContextMsg(null); }}
        onCopy={() => contextMsg && doCopy(contextMsg)}
        onForward={() => {}}
        onPin={() => contextMsg && doPin(contextMsg)}
        onDelete={() => contextMsg && doDelete(contextMsg)}
        onReport={() => contextMsg && doReport(contextMsg)}
        onInfo={() => { setContextMsg(null); showSuccess('Delivered'); }}
      />

      {/* Full emoji picker for a reaction */}
      <Modal visible={!!reactTarget} transparent animationType="slide" onRequestClose={() => setReactTarget(null)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: theme.overlay }]} onPress={() => setReactTarget(null)}>
          <Pressable style={{ width: '100%' }} onPress={(e) => e.stopPropagation()}>
            <EmojiPicker onSelect={(e) => reactTarget && toggleReaction(reactTarget, e)} />
          </Pressable>
        </Pressable>
      </Modal>

      <AttachmentSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPick={onPickAttachment}
        onGifSelected={sendGif}
      />

      <MiniProfile visible={!!miniUser} member={miniUser} roomId={roomId} onClose={() => setMiniUser(null)} />
    </SafeAreaView>
  );
}

/* ── Reaction merge helper (unchanged) ── */
function applyReaction(
  reactions: RoomReaction[],
  p: { emoji: string; count: number; userId: string; added: boolean },
  myId?: string,
): RoomReaction[] {
  const isMe = p.userId === myId;
  const next = reactions.map((r) => ({ ...r }));
  const idx = next.findIndex((r) => r.emoji === p.emoji);
  if (p.count <= 0) return next.filter((r) => r.emoji !== p.emoji);
  if (idx === -1) {
    next.push({ emoji: p.emoji, count: p.count, userReacted: isMe ? p.added : false });
  } else {
    next[idx].count = p.count;
    if (isMe) next[idx].userReacted = p.added;
  }
  return next;
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

function UnreadDivider() {
  const { theme } = useTheme();
  return (
    <View style={styles.unreadWrap}>
      <View style={[styles.unreadLine, { backgroundColor: theme.brand }]} />
      <Text style={[styles.unreadText, { color: theme.brand }]}>Unread Messages</Text>
      <View style={[styles.unreadLine, { backgroundColor: theme.brand }]} />
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
  invertList: { transform: [{ scaleY: -1 }] },
  invertRow: { transform: [{ scaleY: -1 }] },

  searchHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: radius.lg, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.regular },
  searchNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchCount: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },

  pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderLeftWidth: 3 },
  pinnedLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  pinnedText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 1 },

  dateSepWrap: { alignItems: 'center', marginVertical: spacing.sm },
  dateSep: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  dateSepText: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },

  unreadWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm, paddingHorizontal: spacing.xl },
  unreadLine: { flex: 1, height: StyleSheet.hairlineWidth },
  unreadText: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },

  typing: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, paddingHorizontal: spacing.lg, paddingBottom: 4 },
  uploadBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: 6 },
  uploadTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  uploadFill: { height: 4, borderRadius: 2 },
  uploadLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.medium, width: 40, textAlign: 'right' },

  pendingWrap: { paddingHorizontal: spacing.md, paddingBottom: 6, gap: 6 },
  pendingLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },
  pendingRow: { gap: 8 },
  pendingChip: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden' },
  pendingThumb: { width: 56, height: 56 },
  pendingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  pendingRemove: { position: 'absolute', top: 2, right: 2 },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  iconBtn: { paddingBottom: 8, paddingHorizontal: 2 },
  inputWrap: { flex: 1, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: Platform.OS === 'ios' ? 10 : 4, maxHeight: 110, justifyContent: 'center' },
  input: { fontSize: FontSize.md, fontFamily: FontFamily.regular, maxHeight: 90 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  menuBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  menu: { minWidth: 250, borderRadius: radius.lg, paddingVertical: spacing.sm, gap: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  menuItemText: { fontSize: FontSize.md, fontFamily: FontFamily.medium },
});
