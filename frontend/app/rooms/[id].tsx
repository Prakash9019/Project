import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { MiniProfile } from '../../src/components/MiniProfile';
import { RoomHeader } from '../../src/components/rooms/RoomHeader';
import { MessageBubble } from '../../src/components/rooms/MessageBubble';
import { EmojiPicker } from '../../src/components/rooms/EmojiPicker';
import { AppBottomSheet } from '../../src/components/ui/AppBottomSheet';
import type { GifResult } from '../../src/components/rooms/GifPicker';
import { ContextMenu } from '../../src/components/rooms/ContextMenu';
import { ChatComposer } from '../../src/components/chat/ChatComposer';
import { SearchPanel, type SearchMessage } from '../../src/components/chat/SearchPanel';
import { ReactionDetails } from '../../src/components/chat/ReactionDetails';
import { ScrollToBottomButton } from '../../src/components/chat/ScrollToBottomButton';
import { MediaViewer, type MediaViewerImage } from '../../src/components/MediaViewer';
import { useTheme, FontFamily, FontSize, spacing, radius } from '../../src/theme';
import { ChatSkeleton } from '../../src/components/Skeleton';
import { useAuthStore } from '../../src/store/authStore';
import { useGroupsStore } from '../../src/store/groupsStore';
import {
  getRoom,
  listRoomMessages,
  listRoomMembers,
  sendRoomMessage,
  reactToRoomMessage,
  deleteRoomMessage,
  deleteRoomMessageForMe,
  editRoomMessage,
  reportRoomMessage,
  muteRoom,
  reportRoom,
  leaveRoom,
  pinRoomMessage,
  starMessage,
  unstarMessage,
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
const EDIT_WINDOW_MS = 5 * 60 * 1000;

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

// Media classification (mirrors MessageBubble) so the MediaViewer list contains
// only true photos — videos and GIFs are excluded.
function isRoomVideoUrl(url: string): boolean {
  return /\.mp4($|\?)/i.test(url) || url.includes('/video-clips/');
}
function isRoomGifUrl(url: string): boolean {
  return /\.gif($|\?)/i.test(url) || url.includes('klipy');
}

export default function RoomChat() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  // Measured height of the header + pinned banner above the list, so the
  // KeyboardAvoidingView offset is exact instead of a hardcoded 90 (F27).
  const [topOffset, setTopOffset] = useState(0);
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
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<RoomMessageCard | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMsg, setContextMsg] = useState<RoomMessageCard | null>(null);
  const [editingMessage, setEditingMessage] = useState<RoomMessageCard | null>(null);
  const [miniUser, setMiniUser] = useState<RoomUserCard | null>(null);

  const [reactTarget, setReactTarget] = useState<RoomMessageCard | null>(null);
  const [reactionDetailsFor, setReactionDetailsFor] = useState<string | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<{ id: string; firstName: string; avatarUrl?: string | null }[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [pinnedDismissed, setPinnedDismissed] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);

  // Floating scroll-to-bottom pill (F26). The list is inverted (index 0 = newest
  // at the visual bottom), so "at bottom" is scroll offset ≈ 0.
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const atBottomRef = useRef(true);

  // Search-in-chat
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const listRef = useRef<FlashListRef<RoomMessageCard>>(null);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cleanupRef = useRef<(() => void) | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initial load ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([getRoom(roomId), listRoomMessages(roomId, { limit: PAGE })]);
      setRoom(r.room);
      setMessages(m.messages);
      setHasMore(m.hasMore);
      setCursor(m.nextCursor);
      // Opening the room marks it read server-side (listRoomMessages) — mirror
      // that locally so the Groups tab badge clears immediately.
      useGroupsStore.getState().markRoomRead(roomId);
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

  // Load members for @mention autocomplete.
  useEffect(() => {
    let active = true;
    listRoomMembers(roomId, { limit: 100 })
      .then((res) => {
        if (!active) return;
        setMentionCandidates(
          res.members
            .filter((m) => m.user.id !== me?.id)
            .map((m) => ({ id: m.user.id, firstName: m.user.firstName ?? 'Someone', avatarUrl: m.user.profilePhotoUrl })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [roomId, me?.id]);

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
        // Count messages that land while the user is reading older history.
        if (msg.senderId !== me?.id && !atBottomRef.current) setUnseenCount((c) => c + 1);
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
      const onEdited = (p: { messageId: string; content: string; isEdited: boolean }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === p.messageId ? { ...m, content: p.content, isEdited: p.isEdited } : m)),
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
      socket.on('room:message_edited', onEdited);
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
        socket.off('room:message_edited', onEdited);
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

  // ── Typing ──
  const handleTypingStart = () => emitRoomTyping(roomId, true);
  const handleTypingStop = () => emitRoomTyping(roomId, false);

  // ── ChatComposer send handlers (parent owns API + R2 upload pipeline) ──
  const handleSendText = async (content: string, replyToId?: string) => {
    try {
      const msg = await sendRoomMessage(roomId, { content, type: 'text', replyToId });
      emitRoomTyping(roomId, false);
      appendMessage(msg);
    } catch (e: unknown) {
      const err = e as { status?: number; code?: string };
      if (err.status === 451 || err.code === 'message_flagged') showError('Your message was flagged for review');
      else toastApiError(e, 'Could not send message');
      throw e; // let the composer keep the draft on failure
    }
  };

  // ── Send image(s) — one message per image; caption (if any) rides in `content`
  // so it renders below the photo in MessageBubble. Uploaded sequentially. ──
  const handleSendImages = async (uris: string[], caption: string, replyToId?: string) => {
    for (const uri of uris) {
      await runUpload(async () => {
        const url = await uploadToR2(uri, 'room_image', 'image/jpeg', { roomId, onProgress: setUploadProgress });
        const msg = await sendRoomMessage(roomId, { content: caption, type: 'image', mediaUrl: url, replyToId });
        appendMessage(msg);
      });
    }
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

  const handleSendVideo = async (uri: string, replyToId?: string) => {
    await runUpload(async () => {
      const url = await uploadToR2(uri, 'video', 'video/mp4', { onProgress: setUploadProgress });
      const msg = await sendRoomMessage(roomId, { content: '', type: 'image', mediaUrl: url, replyToId });
      appendMessage(msg);
    });
  };

  const handleSendAudioClip = async (uri: string, _durationMs: number, replyToId?: string) => {
    await runUpload(async () => {
      const url = await uploadToR2(uri, 'voice_clip', 'audio/mp4', { onProgress: setUploadProgress });
      const msg = await sendRoomMessage(roomId, { content: '', type: 'voice', mediaUrl: url, replyToId });
      appendMessage(msg);
    });
  };

  const handleSendLocation = async (lat: number, lng: number, label: string) => {
    try {
      const msg = await sendRoomMessage(roomId, {
        content: `📍 ${label}\nhttps://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`,
        type: 'text',
      });
      appendMessage(msg);
    } catch (e) {
      toastApiError(e, 'Could not send location');
    }
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

  // ── Send GIF (KLIPY URL is already hosted — no R2 upload) ──
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

  // "Delete for me" — no socket broadcast (only the caller's view changes), so
  // the local list is updated optimistically here.
  const doDeleteForMe = async (msg: RoomMessageCard) => {
    setContextMsg(null);
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    try {
      await deleteRoomMessageForMe(roomId, msg.id);
    } catch (e) {
      toastApiError(e, 'Could not delete');
    }
  };

  const doEdit = async (messageId: string, content: string) => {
    try {
      const res = await editRoomMessage(roomId, messageId, content);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: res.content, isEdited: res.isEdited } : m)),
      );
      setEditingMessage(null);
    } catch (e) {
      toastApiError(e, 'Could not save edit');
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

  const doStar = async (msg: RoomMessageCard) => {
    setContextMsg(null);
    const next = !msg.isStarred;
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isStarred: next } : m)));
    try {
      if (next) await starMessage(msg.id, 'room');
      else await unstarMessage(msg.id);
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isStarred: !next } : m)));
      toastApiError(e, 'Could not star');
    }
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

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setUnseenCount(0);
    setShowScrollDown(false);
    atBottomRef.current = true;
    useGroupsStore.getState().markRoomRead(roomId);
  }, [roomId]);

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

  // Chronological list of true images (excludes videos/GIFs/docs) for the
  // full-screen MediaViewer. `messages` is newest-first, so reverse a copy.
  const viewerImages = useMemo<MediaViewerImage[]>(() => {
    const out: MediaViewerImage[] = [];
    [...messages].reverse().forEach((m) => {
      if (m.isDeleted || m.type !== 'image' || !m.mediaUrl) return;
      if (isRoomVideoUrl(m.mediaUrl) || isRoomGifUrl(m.mediaUrl)) return;
      out.push({
        uri: m.mediaUrl,
        senderId: m.senderId,
        senderName: m.senderId === me?.id ? 'You' : m.sender.firstName ?? 'Someone',
        createdAt: m.createdAt,
      });
    });
    return out;
  }, [messages, me?.id]);

  const openImageViewer = useCallback(
    (url: string) => {
      const idx = viewerImages.findIndex((e) => e.uri === url);
      setMediaViewerIndex(idx < 0 ? 0 : idx);
      setMediaViewerOpen(true);
    },
    [viewerImages],
  );

  // ── Search: normalized items for the tabbed search panel ──
  const searchItems = useMemo<SearchMessage[]>(
    () =>
      messages.map((m) => ({
        id: m.id,
        content: m.isDeleted ? null : m.content,
        createdAt: m.createdAt,
        type: m.type,
        mediaUrls: m.mediaUrl ? [m.mediaUrl] : [],
        senderName: m.senderId === me?.id ? 'You' : m.sender.firstName ?? 'Someone',
        isDeleted: m.isDeleted,
      })),
    [messages, me?.id],
  );

  const jumpToMessage = useCallback(
    (id: string) => {
      setSearchMode(false);
      setSearchQuery('');
      scrollToMessage(id);
    },
    [scrollToMessage],
  );

  const searchHighlightId = null;

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
            onReactionLongPress={() => setReactionDetailsFor(item.id)}
            onReplyPress={() => item.replyTo && scrollToMessage(item.replyTo.id)}
            onImagePress={openImageViewer}
          />
        </View>
      );
    },
    // toggleReaction stable enough; deps kept minimal to avoid re-renders
    [messages, me?.id, highlightId, searchHighlightId, initialUnread, onSwipeReply, scrollToMessage, openImageViewer],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Header + pinned banner measured for the KeyboardAvoidingView offset (F27). */}
      <View onLayout={(e) => setTopOffset(e.nativeEvent.layout.height)}>
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
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
            </Pressable>
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
      </View>

      {/* F27: `padding` on both platforms + measured offset; the list below drops
          `automaticallyAdjustKeyboardInsets` (it double-applied with this KAV). */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={insets.top + topOffset}
        style={{ flex: 1 }}
      >
        {searchMode ? (
          <SearchPanel
            query={searchQuery}
            messages={searchItems}
            onJumpToMessage={jumpToMessage}
            onOpenMedia={openImageViewer}
          />
        ) : loading ? (
          <ChatSkeleton />
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
            scrollEventThrottle={64}
            onScroll={(e) => {
              // Inverted list: offset ≈ 0 means the newest message is visible.
              const near = e.nativeEvent.contentOffset.y < 200;
              atBottomRef.current = near;
              setShowScrollDown(!near);
              if (near) setUnseenCount(0);
            }}
          />
        )}

        {!searchMode && !loading ? (
          <ScrollToBottomButton visible={showScrollDown} count={unseenCount} onPress={scrollToBottom} />
        ) : null}

        {typingText ? <Text style={[styles.typing, { color: theme.textTertiary }]}>{typingText}</Text> : null}

        {/* Composer (shared with inbox) */}
        {!searchMode ? (
          <ChatComposer
            roomId={roomId}
            replyTo={
              replyTo
                ? { id: replyTo.id, senderName: replyTo.sender.firstName ?? 'Someone', content: replyTo.content || 'Photo' }
                : null
            }
            editingMessage={editingMessage ? { id: editingMessage.id, content: editingMessage.content } : null}
            onClearReply={() => setReplyTo(null)}
            onClearEdit={() => setEditingMessage(null)}
            onSendText={handleSendText}
            onSendImages={handleSendImages}
            onSendVideo={handleSendVideo}
            onSendAudio={handleSendAudioClip}
            onSendDocument={sendDocument}
            onSendAudioFile={sendAudioFile}
            onSendGif={sendGif}
            onSendLocation={handleSendLocation}
            onEditConfirm={doEdit}
            onTypingStart={handleTypingStart}
            onTypingStop={handleTypingStop}
            mentionCandidates={mentionCandidates}
            uploadProgress={uploadProgress != null ? Math.round(uploadProgress * 100) : null}
            placeholder="Message"
          />
        ) : null}
      </KeyboardAvoidingView>

      {/* Room three-dot menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={[styles.menuBackdrop, { backgroundColor: theme.overlay }]} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { backgroundColor: theme.surface }]}>
            <MenuItem icon="search-outline" label="Search in chat" onPress={() => { setMenuOpen(false); setSearchMode(true); }} />
            <MenuItem icon="information-circle-outline" label="Group Info" onPress={() => { setMenuOpen(false); openInfo(); }} />
            {isAdmin ? (
              <MenuItem
                icon="person-add-outline"
                label="Add Members"
                onPress={() => { setMenuOpen(false); router.push(`/create-group/members?roomId=${roomId}` as Href); }}
              />
            ) : null}
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
        canEdit={
          !!contextMsg &&
          contextMsg.senderId === me?.id &&
          contextMsg.type === 'text' &&
          !contextMsg.isDeleted &&
          Date.now() - new Date(contextMsg.createdAt).getTime() < EDIT_WINDOW_MS
        }
        onClose={() => setContextMsg(null)}
        onReact={(e) => contextMsg && toggleReaction(contextMsg, e)}
        onOpenEmojiPicker={() => {
          setReactTarget(contextMsg);
          setContextMsg(null);
        }}
        onReply={() => { setReplyTo(contextMsg); setContextMsg(null); }}
        onCopy={() => contextMsg && doCopy(contextMsg)}
        onForward={() => {}}
        onStar={() => contextMsg && doStar(contextMsg)}
        onPin={() => contextMsg && doPin(contextMsg)}
        onEdit={() => {
          if (!contextMsg) return;
          setReplyTo(null);
          setEditingMessage(contextMsg);
          setContextMsg(null);
        }}
        onDeleteForMe={() => contextMsg && doDeleteForMe(contextMsg)}
        onDelete={() => contextMsg && doDelete(contextMsg)}
        onReport={() => contextMsg && doReport(contextMsg)}
        onInfo={() => { setContextMsg(null); showSuccess('Delivered'); }}
      />

      {/* Full emoji picker for a reaction */}
      <AppBottomSheet
        visible={!!reactTarget}
        onClose={() => setReactTarget(null)}
        enableContentPanningGesture={false}
      >
        <EmojiPicker onSelect={(e) => reactTarget && toggleReaction(reactTarget, e)} />
      </AppBottomSheet>

      <MiniProfile visible={!!miniUser} member={miniUser} roomId={roomId} onClose={() => setMiniUser(null)} />

      <MediaViewer
        visible={mediaViewerOpen}
        images={viewerImages}
        initialIndex={mediaViewerIndex}
        onClose={() => setMediaViewerOpen(false)}
      />

      <ReactionDetails
        visible={!!reactionDetailsFor}
        onClose={() => setReactionDetailsFor(null)}
        scope="room"
        parentId={roomId}
        messageId={reactionDetailsFor}
      />
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

  menuBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  menu: { minWidth: 250, borderRadius: radius.lg, paddingVertical: spacing.sm, gap: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  menuItemText: { fontSize: FontSize.md, fontFamily: FontFamily.medium },
});
