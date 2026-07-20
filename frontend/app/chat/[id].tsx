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
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, FontSize, DisplayFont } from '../../src/theme';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import { ExpiringPhotoViewer } from '../../src/components/ExpiringPhotoViewer';
import { PhotoViewer } from '../../src/components/PhotoViewer';
import { MediaViewer, type MediaViewerImage } from '../../src/components/MediaViewer';
import { CustomAlert } from '../../src/components/CustomAlert';
import { useAlert } from '../../src/hooks/useAlert';
import { EmojiPicker } from '../../src/components/rooms/EmojiPicker';
import { ChatComposer, type ChatComposerHandle } from '../../src/components/chat/ChatComposer';
import { SearchPanel, type SearchMessage } from '../../src/components/chat/SearchPanel';
import { ReactionPill } from '../../src/components/chat/ReactionPill';
import { ReactionDetails } from '../../src/components/chat/ReactionDetails';
import {
  ChatLockScreen,
  ChatLockSetup,
  loadLockConfig,
  saveLockConfig,
  clearLockConfig,
  type LockConfig,
} from '../../src/components/chat/ChatLock';
import { ReportSheet } from '../../src/components/ReportSheet';
import { AudioPlayer } from '../../src/components/chat/AudioPlayer';
import type { GifResult } from '../../src/components/rooms/GifPicker';
import { uploadToR2 } from '../../src/utils/uploadToR2';
import {
  listMessages,
  markConversationRead,
  sendMessage,
  initiateCall,
  uploadChatPhoto,
  consumeExpiringPhoto,
  listAlbums,
  getAlbum,
  getPublicProfile,
  unsendMessage,
  editMessage,
  getMessageTemplates,
  reactToMessage,
  deleteMessage,
  pinChatMessage,
  starMessage,
  unstarMessage,
  setDisappearingMessages,
  ApiError,
  type SendMessageBody,
  type MessageTemplate,
} from '../../src/services/api';
import { connectSocket, emitTyping } from '../../src/services/socket';
import { isAgoraAvailable } from '../../src/services/agora';
import { useAuthStore } from '../../src/store/authStore';
import { useChatStore } from '../../src/store/chatStore';
import { clockTime, planAtLeast, chatDateHeader, sameCalendarDay } from '../../src/lib/format';
import { ChatSkeleton } from '../../src/components/Skeleton';
import { MessageTick } from '../../src/components/MessageTick';
import type { Message, AlbumSummary } from '../../src/types/api';

const CALL_DISABLED_TOOLTIP =
  'Calls will be enabled after the other person replies to your message at least once.';
const AUDIO_UNAVAILABLE_TOOLTIP = 'This person is not accepting audio calls right now.';
const VIDEO_UNAVAILABLE_TOOLTIP = 'This person is not accepting video calls right now.';

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

const SWIPE_TRIGGER = 60;

/** Swipe-right-to-reply wrapper (mirrors the group-chat MessageBubble gesture). */
function SwipeToReply({ onSwipeReply, children }: { onSwipeReply: () => void; children: React.ReactNode }) {
  const { theme } = useTheme();
  const translateX = useSharedValue(0);
  const pan = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      translateX.value = Math.max(0, Math.min(e.translationX, 90));
    })
    .onEnd(() => {
      if (translateX.value >= SWIPE_TRIGGER) runOnJS(onSwipeReply)();
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
    });
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_TRIGGER], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(translateX.value, [0, SWIPE_TRIGGER], [0.5, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={rowStyle}>
        <Animated.View style={[{ position: 'absolute', left: 12, top: 0, bottom: 0, justifyContent: 'center' }, arrowStyle]}>
          <Ionicons name="arrow-undo" size={18} color={theme.brand} />
        </Animated.View>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

export default function Chat() {
  const params = useLocalSearchParams<{ id: string; peerName?: string; peerPhoto?: string }>();
  const conversationId = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const peerName = Array.isArray(params.peerName) ? params.peerName[0] : params.peerName;
  const peerPhoto = Array.isArray(params.peerPhoto) ? params.peerPhoto[0] : params.peerPhoto;
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { alertConfig, hideAlert, alertError } = useAlert();
  const me = useAuthStore((s) => s.user);
  const markRead = useChatStore((s) => s.markRead);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const canReadReceipts = planAtLeast(me?.plan, 'premium');
  const canUnsendAnytime = planAtLeast(me?.plan, 'gold');
  const canUnsend = planAtLeast(me?.plan, 'premium');
  const canEdit = planAtLeast(me?.plan, 'gold');
  const canUseTemplates = (me?.effectiveLimits?.messageTemplates ?? 0) > 0;
  const EDIT_WINDOW_MS = 5 * 60 * 1000;
  const listRef = useRef<FlatList<ChatRow>>(null);
  // When jumping to a pinned/search result, block the content-size auto-scroll so
  // the list doesn't snap back to the bottom (the highlight border resizes the row,
  // which would otherwise fire onContentSizeChange → scrollToEnd).
  const suppressAutoScroll = useRef(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  // Peer's own availability toggles (default true until loaded — never over-disable).
  const [peerAudioAvailable, setPeerAudioAvailable] = useState(true);
  const [peerVideoAvailable, setPeerVideoAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  // ISO createdAt of the oldest loaded message — the `before` cursor for the
  // next older page. A ref (not state) so the scroll handler always reads the
  // latest value without re-subscribing.
  const oldestCursor = useRef<string | null>(null);
  const [sending, setSending] = useState(false);
  const composerRef = useRef<ChatComposerHandle>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [expiringView, setExpiringView] = useState<{ url: string | null; seconds: number; loading: boolean } | null>(null);
  const [photoViewUrl, setPhotoViewUrl] = useState<string | null>(null);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pinnedDismissed, setPinnedDismissed] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [reactionDetailsFor, setReactionDetailsFor] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [disappearing, setDisappearing] = useState<'24h' | '7d' | '90d' | null>(null);
  const [disappearingOpen, setDisappearingOpen] = useState(false);
  const [e2eInfoOpen, setE2eInfoOpen] = useState(false);
  const [lockConfig, setLockConfig] = useState<LockConfig | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [lockSetupOpen, setLockSetupOpen] = useState(false);

  const rows = useMemo(() => buildRows(messages), [messages]);

  const pinnedMessage = useMemo(
    () => (pinnedDismissed ? null : [...messages].reverse().find((m) => m.isPinned && !m.isUnsent) ?? null),
    [messages, pinnedDismissed],
  );

  // Normalized messages for the search panel (text / media / links / documents).
  const searchItems = useMemo<SearchMessage[]>(
    () =>
      messages.map((m) => ({
        id: m.id,
        content: m.isUnsent ? null : m.content,
        createdAt: m.createdAt,
        type: m.type,
        mediaUrls: m.mediaUrls?.length ? m.mediaUrls : m.mediaUrl ? [m.mediaUrl] : [],
        senderName: m.senderId === me?.id ? 'You' : peerName || 'Someone',
        isDeleted: m.isUnsent,
      })),
    [messages, me?.id, peerName],
  );

  const jumpToMessage = useCallback(
    (id: string) => {
      setSearchOpen(false);
      setSearchQuery('');
      const rowIndex = rows.findIndex((r) => r.kind === 'message' && r.message.id === id);
      if (rowIndex >= 0) {
        suppressAutoScroll.current = true;
        listRef.current?.scrollToIndex({ index: rowIndex, animated: true, viewPosition: 0.5 });
        // Keep auto-scroll suppressed past the highlight clear below: removing the
        // highlight border resizes the row → fires onContentSizeChange, which would
        // otherwise snap the list back to the bottom. Re-enable only after that.
        setTimeout(() => {
          suppressAutoScroll.current = false;
        }, 1800);
      }
      setHighlightId(id);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 1500);
    },
    [rows],
  );

  // Flat list of every shareable photo in the conversation (album/multi-photo
  // messages contribute each url) for the full-screen MediaViewer. View-once and
  // unsent messages are excluded — they have their own consume-once flow.
  const viewerImages = useMemo<MediaViewerImage[]>(() => {
    const out: MediaViewerImage[] = [];
    messages.forEach((m) => {
      if (m.isUnsent || isViewOnce(m) || m.type !== 'photo') return;
      const urls = m.mediaUrls.length ? m.mediaUrls : m.mediaUrl ? [m.mediaUrl] : [];
      urls.forEach((uri) => {
        if (!uri) return;
        out.push({
          uri,
          senderId: m.senderId,
          senderName: m.senderId === me?.id ? 'You' : peerName || 'Someone',
          createdAt: m.createdAt,
        });
      });
    });
    return out;
  }, [messages, me?.id, peerName]);

  const openImageViewer = useCallback(
    (url: string) => {
      const idx = viewerImages.findIndex((e) => e.uri === url);
      setMediaViewerIndex(idx < 0 ? 0 : idx);
      setMediaViewerOpen(true);
    },
    [viewerImages],
  );

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
    setBanner(null);
    setUnlocked(false);
    setHasMoreOlder(false);
    oldestCursor.current = null;
    loadLockConfig(conversationId).then(setLockConfig).catch(() => setLockConfig(null));
  }, [conversationId]);

  const applyDisappearing = async (value: '24h' | '7d' | '90d' | null) => {
    setDisappearingOpen(false);
    const prev = disappearing;
    setDisappearing(value);
    try {
      await setDisappearingMessages(conversationId, value);
    } catch {
      setDisappearing(prev);
      alertError('Could not update', 'Please try again.');
    }
  };

  const enableLock = (config: LockConfig) => {
    setLockConfig(config);
    setUnlocked(true);
    saveLockConfig(conversationId, config).catch(() => {});
  };

  const disableLock = () => {
    setHeaderMenuOpen(false);
    setLockConfig(null);
    clearLockConfig(conversationId).catch(() => {});
  };

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    (async () => {
      try {
        const res = await listMessages(conversationId);
        if (!active) return;
        // API returns newest-first; reverse to chronological (oldest→newest) for
        // the bottom-anchored list.
        setMessages(res.messages.reverse());
        setHasMoreOlder(res.hasMore);
        oldestCursor.current = res.nextCursor;
        setAudioEnabled(res.audioCallEnabled);
        setVideoEnabled(res.videoCallEnabled);
        setDisappearing(res.disappearingMessages ?? null);
        // Load the peer's call-availability toggles. Peer id comes from the
        // conversation summary (inbox) or, failing that, from a peer message.
        const convo = useChatStore.getState().conversations.find((c) => c.id === conversationId);
        const peerId = convo?.peer?.id ?? res.messages.find((m) => m.senderId !== me?.id)?.senderId;
        if (peerId) {
          setPeerId(peerId);
          getPublicProfile(peerId)
            .then((p) => {
              if (!active) return;
              setPeerAudioAvailable(p.audioCallAvailable !== false);
              setPeerVideoAvailable(p.videoCallAvailable !== false);
            })
            .catch(() => {});
        }
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
        const now = new Date().toISOString();
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === me?.id && !m.readAt
              ? { ...m, deliveredAt: m.deliveredAt ?? now, readAt: now }
              : m
          )
        );
      };
      // Per-message delivery/read updates (WhatsApp-style tick progression).
      const onStatusUpdate = (p: { conversationId: string; messageId: string; status: 'delivered' | 'read' }) => {
        if (p.conversationId !== conversationId) return;
        const now = new Date().toISOString();
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== p.messageId) return m;
            if (p.status === 'read') return { ...m, deliveredAt: m.deliveredAt ?? now, readAt: m.readAt ?? now };
            return { ...m, deliveredAt: m.deliveredAt ?? now };
          })
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
      const onReaction = (p: { conversationId: string; messageId: string; emoji: string; count: number; added: boolean; userId: string }) => {
        if (p.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== p.messageId) return m;
            const others = m.reactions.filter((r) => r.emoji !== p.emoji);
            const mine = p.userId === me?.id;
            return p.count > 0
              ? { ...m, reactions: [...others, { emoji: p.emoji, count: p.count, userReacted: mine ? p.added : (m.reactions.find((r) => r.emoji === p.emoji)?.userReacted ?? false) }] }
              : { ...m, reactions: others };
          })
        );
      };

      const onPinned = (p: { conversationId: string; messageId: string; isPinned: boolean }) => {
        if (p.conversationId !== conversationId) return;
        setPinnedDismissed(false);
        setMessages((prev) => prev.map((m) => (m.id === p.messageId ? { ...m, isPinned: p.isPinned } : m)));
      };

      socket.on('message.created', onCreated);
      socket.on('message.pinned', onPinned);
      socket.on('message.read', onRead);
      socket.on('message.status_update', onStatusUpdate);
      socket.on('message.unsend', onUnsend);
      socket.on('message.edited', onEdited);
      socket.on('message.viewed', onViewed);
      socket.on('call.enabled', onCallEnabled);
      socket.on('typing', onTyping);
      socket.on('message.reaction', onReaction);

      cleanup = () => {
        socket.off('message.created', onCreated);
        socket.off('message.pinned', onPinned);
        socket.off('message.read', onRead);
        socket.off('message.status_update', onStatusUpdate);
        socket.off('message.unsend', onUnsend);
        socket.off('message.edited', onEdited);
        socket.off('message.viewed', onViewed);
        socket.off('call.enabled', onCallEnabled);
        socket.off('typing', onTyping);
        socket.off('message.reaction', onReaction);
      };
    })();
    return () => cleanup();
  }, [conversationId, me?.id, upsert]);

  // Scroll-to-top → load the previous page of older messages and PREPEND them.
  // The FlatList's `maintainVisibleContentPosition` keeps the current messages
  // visually anchored so the view doesn't jump; suppressAutoScroll stops the
  // content-size auto-scroll from snapping back to the bottom during the prepend.
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder || !oldestCursor.current) return;
    setLoadingOlder(true);
    try {
      const res = await listMessages(conversationId, { before: oldestCursor.current, limit: 30 });
      const older = res.messages.reverse(); // chronological (oldest→newest)
      suppressAutoScroll.current = true;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const fresh = older.filter((m) => !seen.has(m.id));
        return fresh.length ? [...fresh, ...prev] : prev;
      });
      setHasMoreOlder(res.hasMore);
      oldestCursor.current = res.nextCursor;
      setTimeout(() => {
        suppressAutoScroll.current = false;
      }, 400);
    } catch {
      /* leave the loaded history intact; scrolling up again retries */
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, loadingOlder, hasMoreOlder]);

  const handleTypingStart = () => {
    if (me && conversationId) emitTyping(conversationId, me.id, true);
  };
  const handleTypingStop = () => {
    if (me && conversationId) emitTyping(conversationId, me.id, false);
  };

  const postMessage = async (body: Parameters<typeof sendMessage>[1], rethrow = false) => {
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
      if (rethrow) throw e;
    } finally {
      setSending(false);
    }
  };

  // ── ChatComposer send handlers (parent owns API + GCS/R2 upload pipeline) ──
  const handleSendText = (content: string, replyToId?: string) =>
    postMessage({ type: 'text', content, replyToId }, true);

  const handleSendImages = async (uris: string[], caption: string, replyToId?: string) => {
    setSending(true);
    setBanner(null);
    try {
      for (const uri of uris) {
        await uploadAndSendPhoto(uri, false, caption || undefined, replyToId);
      }
      fetchConversations('inbox', true).catch(() => {});
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403 && (err.code === 'interaction_limit_reached' || err.code === 'plan_required')) setUpgradeOpen(true);
      else setBanner(err.message ?? 'Could not send photo');
    } finally {
      setSending(false);
    }
  };

  const handleSendVideo = (uri: string, replyToId?: string) =>
    uploadAndSendFile(uri, 'video', 'video/mp4', { type: 'video', content: '', replyToId });

  const handleSendAudioClip = async (uri: string, _durationMs: number, replyToId?: string) => {
    setSending(true);
    setBanner(null);
    try {
      const url = await uploadToR2(uri, 'voice_clip', 'audio/mp4');
      await postMessage({ type: 'voice', mediaUrls: [url], replyToId });
    } catch (e) {
      setBanner((e as ApiError).message ?? 'Could not send voice message');
    } finally {
      setSending(false);
    }
  };

  const handleSendLocationCard = (lat: number, lng: number, label: string) =>
    postMessage({ type: 'text', content: `📍 ${label}|${lat}|${lng}` });

  const handleEditConfirm = (messageId: string, content: string) => saveEdit(messageId, content);

  const saveEdit = async (messageId: string, content: string) => {
    setSending(true);
    try {
      const res = await editMessage(conversationId, messageId, content);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: res.content, isEdited: res.isEdited } : m))
      );
      setEditingMessage(null);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403 && err.code === 'edit_window_expired') {
        alertError('Edit window expired', 'Messages can only be edited within 5 minutes.');
        setEditingMessage(null);
      } else {
        alertError('Could not save edit', err.message ?? 'Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const startEditing = (item: Message) => {
    setReplyTo(null);
    setEditingMessage(item);
  };

  const cancelEditing = () => {
    setEditingMessage(null);
  };

  const openTemplatePicker = async () => {
    setTemplatesOpen(true);
    setTemplatesLoading(true);
    try {
      const res = await getMessageTemplates();
      setTemplates(res.templates);
    } catch (e) {
      alertError('Could not load templates', (e as ApiError).message ?? 'Please try again.');
      setTemplatesOpen(false);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const insertTemplate = (template: MessageTemplate) => {
    composerRef.current?.insertText(template.content);
    setTemplatesOpen(false);
  };

  const runUnsend = async (item: Message) => {
    try {
      await unsendMessage(conversationId, item.id);
      setMessages((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, isUnsent: true, content: null } : m))
      );
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403 && err.code === 'already_read') {
        alertError('Upgrade to Gold to unsend read messages');
      } else {
        alertError('Could not unsend', err.message ?? 'Please try again.');
      }
    }
  };

  const onLongPressMessage = (item: Message) => {
    if (item.id.startsWith('tmp-')) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setMenuMessage(item);
  };

  const onSwipeReply = (item: Message) => {
    if (item.isUnsent || item.id.startsWith('tmp-')) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setEditingMessage(null);
    setReplyTo(item);
  };

  const onReact = async (item: Message, emoji: string) => {
    setMenuMessage(null);
    // Optimistic toggle
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== item.id) return m;
        const existing = m.reactions.find((r) => r.emoji === emoji);
        if (existing?.userReacted) {
          const count = existing.count - 1;
          return {
            ...m,
            reactions: count > 0
              ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, count, userReacted: false } : r))
              : m.reactions.filter((r) => r.emoji !== emoji),
          };
        }
        return existing
          ? { ...m, reactions: m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, userReacted: true } : r)) }
          : { ...m, reactions: [...m.reactions, { emoji, count: 1, userReacted: true }] };
      })
    );
    try {
      await reactToMessage(conversationId, item.id, emoji);
    } catch {
      /* socket event will reconcile on next round-trip */
    }
  };

  const copyMessage = async (item: Message) => {
    setMenuMessage(null);
    if (item.content) await Clipboard.setStringAsync(item.content);
  };

  const runDeleteSelf = async (item: Message) => {
    setMenuMessage(null);
    try {
      await deleteMessage(conversationId, item.id);
      setMessages((prev) => prev.filter((m) => m.id !== item.id));
    } catch (e) {
      alertError('Could not delete', (e as ApiError).message ?? 'Please try again.');
    }
  };

  const toggleStar = async (item: Message) => {
    setMenuMessage(null);
    const next = !item.isStarred;
    setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, isStarred: next } : m)));
    try {
      if (next) await starMessage(item.id, 'chat');
      else await unstarMessage(item.id);
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, isStarred: !next } : m)));
    }
  };

  const togglePin = async (item: Message) => {
    setMenuMessage(null);
    const next = !item.isPinned;
    setPinnedDismissed(false);
    setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, isPinned: next } : m)));
    try {
      await pinChatMessage(conversationId, item.id, next);
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, isPinned: !next } : m)));
      alertError('Could not pin', (e as ApiError).message ?? 'Please try again.');
    }
  };

  const saveMediaToGallery = async (item: Message) => {
    setMenuMessage(null);
    const url = item.mediaUrls[0] ?? item.mediaUrl;
    if (!url) return;
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        alertError('Permission needed', 'Allow photo library access to save media.');
        return;
      }
      const target = `${FileSystem.cacheDirectory}nearme-${Date.now()}.jpg`;
      const dl = await FileSystem.downloadAsync(url, target);
      await MediaLibrary.saveToLibraryAsync(dl.uri);
      setBanner('Saved to gallery');
      setTimeout(() => setBanner(null), 2000);
    } catch {
      alertError('Could not save', 'Please try again.');
    }
  };

  const translateMessageText = async (item: Message) => {
    setMenuMessage(null);
    if (translations[item.id]) {
      // Toggle off
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    const key = process.env.EXPO_PUBLIC_GOOGLE_TRANSLATE_API_KEY;
    if (!key) {
      alertError('Translation unavailable', 'Set EXPO_PUBLIC_GOOGLE_TRANSLATE_API_KEY to enable translation.');
      return;
    }
    if (!item.content) return;
    try {
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: item.content, target: 'en' }),
        },
      );
      const json = await res.json();
      const translated = json?.data?.translations?.[0]?.translatedText;
      if (translated) setTranslations((prev) => ({ ...prev, [item.id]: translated as string }));
      else alertError('Could not translate', 'Please try again.');
    } catch {
      alertError('Could not translate', 'Please try again.');
    }
  };

  const openReportFromMenu = () => {
    setMenuMessage(null);
    setReportOpen(true);
  };

  // Upload + send a single photo as its own message. Adds an optimistic bubble
  // immediately, replaces it with the server message, and re-throws on failure
  // so the caller can stop a batch and surface the error.
  const uploadAndSendPhoto = async (localUri: string, viewOnce: boolean, caption?: string, replyToId?: string) => {
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
        caption: caption ?? null,
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
        deliveredAt: null,
        readAt: null,
        deletedAt: null,
        reactions: [],
        createdAt: new Date().toISOString(),
      } satisfies Message,
    ]);

    try {
      const key = await uploadChatPhoto(localUri);
      const apiRes = await sendMessage(conversationId, {
        type: viewOnce ? 'expiring_photo' : 'photo',
        mediaUrls: [key],
        caption,
        replyToId,
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
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 10,
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

  // Upload a non-photo file to R2 and send it. Videos use the native 'video'
  // message type; documents/audio ride on a text message carrying the file url
  // in mediaUrls with an emoji-prefixed caption (rendered as a tappable card,
  // mirroring the group chat MessageBubble contract).
  const uploadAndSendFile = async (
    localUri: string,
    uploadType: 'video' | 'document' | 'audio',
    contentType: string,
    body: SendMessageBody,
  ) => {
    setSending(true);
    setBanner(null);
    try {
      const url = await uploadToR2(localUri, uploadType, contentType);
      await postMessage({ ...body, mediaUrls: [url] });
    } catch (e) {
      setBanner((e as ApiError).message ?? 'Could not send attachment');
    } finally {
      setSending(false);
    }
  };

  const pickAndSendDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const file = res.assets[0];
    const ext = file.name?.includes('.') ? file.name.split('.').pop() : undefined;
    setSending(true);
    setBanner(null);
    try {
      const url = await uploadToR2(file.uri, 'document', file.mimeType || 'application/octet-stream', { ext });
      await postMessage({ type: 'text', content: `📄 ${file.name ?? 'Document'}`, mediaUrls: [url] });
    } catch (e) {
      setBanner((e as ApiError).message ?? 'Could not send document');
    } finally {
      setSending(false);
    }
  };

  const pickAndSendAudio = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const file = res.assets[0];
    setSending(true);
    setBanner(null);
    try {
      const url = await uploadToR2(file.uri, 'audio', file.mimeType || 'audio/mpeg');
      await postMessage({ type: 'text', content: `🎵 ${file.name ?? 'Audio'}`, mediaUrls: [url] });
    } catch (e) {
      setBanner((e as ApiError).message ?? 'Could not send audio');
    } finally {
      setSending(false);
    }
  };

  const sendGif = async (gif: GifResult) => {
    await postMessage({ type: 'photo', content: '', mediaUrls: [gif.url] });
  };

  const openAlbumPicker = async () => {
    setAlbumPickerOpen(true);
    setAlbumsLoading(true);
    try {
      const res = await listAlbums();
      setAlbums(res.albums);
    } catch {
      alertError('Could not load albums');
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
        alertError('Empty album', 'Add photos to this album first.');
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

  // A call button is enabled only when the reply-gate is open AND the peer is
  // accepting that call type. Tooltip differs by which condition fails.
  const callState = (type: 'audio' | 'video') => {
    const replyEnabled = type === 'audio' ? audioEnabled : videoEnabled;
    const peerAvailable = type === 'audio' ? peerAudioAvailable : peerVideoAvailable;
    const tip = !replyEnabled
      ? CALL_DISABLED_TOOLTIP
      : type === 'audio'
        ? AUDIO_UNAVAILABLE_TOOLTIP
        : VIDEO_UNAVAILABLE_TOOLTIP;
    return { enabled: replyEnabled && peerAvailable, tip };
  };

  const startCall = async (type: 'audio' | 'video') => {
    const { enabled, tip } = callState(type);
    if (!enabled) {
      setTooltip(tip);
      setTimeout(() => setTooltip(null), 3000);
      return;
    }
    // Guard: without the react-native-agora native module the call can never
    // connect. Fail before hitting the backend so we don't create a phantom
    // Call record and ring the callee into a dead screen.
    if (!isAgoraAvailable) {
      setBanner('Calls need the latest app build. Please update or reinstall the app.');
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
      if (err.status === 403 && (err.code === 'calls_not_yet_enabled' || err.code === 'calls_disabled')) {
        setTooltip(err.code === 'calls_disabled' ? (err.message ?? tip) : CALL_DISABLED_TOOLTIP);
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
              <Text style={mine ? styles.textMe : { color: theme.textPrimary, fontSize: FontSize.sm }}>
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
        <Pressable onPress={() => openImageViewer(item.mediaUrls[0] ?? item.mediaUrl ?? '')}>
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
            {item.caption ? (
              <Text style={[styles.photoCaption, mine ? styles.textMe : { color: theme.textPrimary }]}>
                {item.caption}
              </Text>
            ) : null}
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

    // Location card: a text message with structured content '📍 label|lat|lng'
    // (see sendLocation below — the backend has no dedicated 'location' type yet).
    if (item.type === 'text' && item.content?.startsWith('📍 ') && item.content.includes('|')) {
      const [labelPart, latStr, lngStr] = item.content.replace(/^📍\s*/, '').split('|');
      const lat = Number(latStr);
      const lng = Number(lngStr);
      const fg = mine ? theme.textInverse : theme.textPrimary;
      const sub = mine ? 'rgba(255,255,255,0.8)' : theme.textTertiary;
      return (
        <Pressable
          style={styles.locationCard}
          onPress={() => Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`).catch(() => {})}
        >
          <View style={[styles.locationPin, { backgroundColor: mine ? 'rgba(255,255,255,0.15)' : theme.backgroundTertiary }]}>
            <Ionicons name="location" size={32} color={mine ? '#fff' : theme.brand} />
          </View>
          <View style={styles.locationInfo}>
            <Text style={[styles.fileName, { color: fg }]} numberOfLines={1}>{labelPart || 'My Location'}</Text>
            <Text style={[styles.fileSub, { color: sub }]}>Tap to open in Maps</Text>
          </View>
        </Pressable>
      );
    }

    // Document / audio file: a text message carrying the file url in mediaUrls
    // with an emoji-prefixed caption. Documents open externally; audio plays inline.
    const fileUrl = item.mediaUrls[0];
    const isDoc = item.type === 'text' && !!fileUrl && item.content?.startsWith('📄');
    const isAudioFile = item.type === 'text' && !!fileUrl && item.content?.startsWith('🎵');
    if (isAudioFile && fileUrl) {
      return <AudioPlayer mediaUrl={fileUrl} isOwn={mine} />;
    }
    if (isDoc) {
      const label = (item.content ?? '').replace(/^📄\s*/, '') || 'Document';
      const fg = mine ? theme.textInverse : theme.textPrimary;
      const sub = mine ? 'rgba(255,255,255,0.8)' : theme.textTertiary;
      return (
        <Pressable style={styles.fileCard} onPress={() => fileUrl && Linking.openURL(fileUrl).catch(() => {})}>
          <Ionicons name="document-text" size={22} color={mine ? theme.textInverse : theme.brand} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.fileName, { color: fg }]} numberOfLines={1}>{label}</Text>
            <Text style={[styles.fileSub, { color: sub }]}>Tap to open</Text>
          </View>
          <Ionicons name="download-outline" size={20} color={fg} />
        </Pressable>
      );
    }

    return (
      <Text style={mine ? styles.textMe : { color: theme.textPrimary, fontSize: FontSize.md, fontFamily: FontFamily.regular }}>
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
    const isSearchHighlight = highlightId === item.id;

    // Bare photo (no album caption, not view-once) renders edge-to-edge with just
    // rounded corners — no bubble padding, border or background (WhatsApp-style).
    const mediaOnly =
      !item.isUnsent &&
      !isViewOnce(item) &&
      item.type === 'photo' &&
      item.mediaUrls.length > 0 &&
      !item.content?.startsWith('📁 ');

    const quote = item.replyTo ? (
      <View
        style={[
          styles.quote,
          {
            backgroundColor: mine ? 'rgba(255,255,255,0.15)' : theme.backgroundTertiary,
            borderLeftColor: mine ? '#fff' : theme.brand,
          },
        ]}
      >
        <Text style={[styles.quoteName, { color: mine ? '#fff' : theme.brand }]} numberOfLines={1}>
          {item.replyTo.senderId === me?.id ? 'You' : peerName || 'Someone'}
        </Text>
        <Text style={[styles.quoteText, { color: mine ? '#ffffffcc' : theme.textSecondary }]} numberOfLines={1}>
          {item.replyTo.content}
        </Text>
      </View>
    ) : null;

    const highlightStyle = isSearchHighlight ? { borderWidth: 1.5, borderColor: theme.brandSecondary } : null;

    const translationNode =
      translations[item.id] && !item.isUnsent ? (
        <Text
          style={[
            styles.translated,
            { color: mine ? 'rgba(255,255,255,0.85)' : theme.textTertiary, borderTopColor: mine ? 'rgba(255,255,255,0.25)' : theme.border },
          ]}
        >
          {translations[item.id]}
        </Text>
      ) : null;

    return (
      <SwipeToReply onSwipeReply={() => onSwipeReply(item)}>
        <Pressable
          style={[styles.bubbleRow, mine ? styles.right : styles.left]}
          onLongPress={() => onLongPressMessage(item)}
        >
          {mediaOnly ? (
            <View style={[styles.mediaBubble, highlightStyle]}>{body}</View>
          ) : mine ? (
            <LinearGradient colors={theme.gradientWarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, isViewOnce(item) ? styles.snapBubble : null, { borderBottomRightRadius: 4 }, highlightStyle]}>
              {quote}
              {body}
              {translationNode}
            </LinearGradient>
          ) : (
            <View style={[styles.bubble, isViewOnce(item) ? styles.snapBubble : null, { backgroundColor: theme.surfaceElevated, borderBottomLeftRadius: 4 }, highlightStyle]}>
              {quote}
              {body}
              {translationNode}
            </View>
          )}
          <View style={styles.metaRow}>
            {item.isStarred && !item.isUnsent && (
              <Ionicons name="star" size={11} color={theme.brand} style={{ marginRight: 4 }} />
            )}
            <Text style={[styles.time, { color: theme.textTertiary }]}>{clockTime(item.createdAt)}</Text>
            {disappearing && !item.isUnsent && (
              <Ionicons name="time-outline" size={12} color={theme.textTertiary} style={{ marginLeft: 3 }} />
            )}
            {item.isEdited && !item.isUnsent && (
              <Text style={[styles.time, { color: theme.textTertiary }]}> · edited</Text>
            )}
            {mine && !item.isUnsent && (
              <MessageTick
                status={
                  item.id.startsWith('tmp-')
                    ? 'sending'
                    : !item.deliveredAt
                      ? 'sent'
                      : !item.readAt
                        ? 'delivered'
                        : 'read'
                }
                isPremium={canReadReceipts}
              />
            )}
          </View>
          {item.reactions.length > 0 && (
            <View style={[styles.reactionsRow, mine ? { justifyContent: 'flex-end' } : null]}>
              {item.reactions.map((r) => (
                <ReactionPill
                  key={r.emoji}
                  emoji={r.emoji}
                  count={r.count}
                  userReacted={r.userReacted}
                  onPress={() => onReact(item, r.emoji)}
                  onLongPress={() => setReactionDetailsFor(item.id)}
                />
              ))}
            </View>
          )}
        </Pressable>
      </SwipeToReply>
    );
  };

  const CallButton = ({ type }: { type: 'audio' | 'video' }) => {
    const { enabled, tip } = callState(type);
    const color = enabled ? (type === 'audio' ? theme.callAudio : theme.callVideo) : theme.callDisabled;
    return (
      <Pressable
        onPress={() => startCall(type)}
        onLongPress={() => {
          if (!enabled) {
            setTooltip(tip);
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

  // Locked-chat gate: show the unlock screen instead of messages until unlocked.
  if (lockConfig?.locked && !unlocked) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={[styles.headName, { color: theme.textPrimary, flex: 1 }]} numberOfLines={1}>
            {peerName || 'Chat'}
          </Text>
        </View>
        <ChatLockScreen config={lockConfig} onUnlock={() => setUnlocked(true)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Pressable
          style={styles.headTap}
          disabled={!peerId}
          onPress={() =>
            peerId &&
            router.push({
              pathname: '/profile/[id]',
              params: { id: peerId, fromChat: conversationId, peerName: peerName ?? '' },
            })
          }
        >
          {peerPhoto ? (
            <Image source={{ uri: peerPhoto }} style={styles.headAvatar} contentFit="cover" transition={120} cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.headAvatar, { backgroundColor: theme.backgroundTertiary, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={20} color={theme.textTertiary} />
            </View>
          )}
          <View style={styles.headProfile}>
            <View style={styles.headNameRow}>
              <Text style={[styles.headName, { color: theme.textPrimary }]} numberOfLines={1}>
                {peerName || 'Chat'}
              </Text>
              <Pressable onPress={() => setE2eInfoOpen(true)} hitSlop={6}>
                <Ionicons name="lock-closed" size={12} color={theme.success} />
              </Pressable>
            </View>
            {peerTyping && <Text style={[styles.headStatus, { color: theme.online }]}>typing…</Text>}
          </View>
        </Pressable>
        <Pressable
          onPress={() => {
            setSearchOpen((v) => !v);
            setSearchQuery('');
          }}
          hitSlop={10}
          style={styles.callBtn}
        >
          <Ionicons name={searchOpen ? 'close' : 'search'} size={22} color={theme.textPrimary} />
        </Pressable>
        <CallButton type="audio" />
        <CallButton type="video" />
        <Pressable onPress={() => setHeaderMenuOpen(true)} hitSlop={10} style={styles.callBtn}>
          <Ionicons name="ellipsis-vertical" size={20} color={theme.textPrimary} />
        </Pressable>
      </View>

      {searchOpen && (
        <View style={[styles.searchBar, { backgroundColor: theme.surfaceElevated, borderBottomColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.textTertiary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search in chat"
            placeholderTextColor={theme.textTertiary}
            autoFocus
            style={[styles.searchInput, { color: theme.textPrimary }]}
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
            </Pressable>
          ) : null}
        </View>
      )}

      {pinnedMessage && !searchOpen && (
        <Pressable
          style={[styles.pinnedBanner, { backgroundColor: theme.surfaceElevated, borderLeftColor: theme.brand }]}
          onPress={() => jumpToMessage(pinnedMessage.id)}
        >
          <Ionicons name="pin" size={16} color={theme.brand} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.pinnedLabel, { color: theme.brand }]}>Pinned message</Text>
            <Text style={[styles.pinnedText, { color: theme.textSecondary }]} numberOfLines={1}>
              {pinnedMessage.content || 'Media'}
            </Text>
          </View>
          <Pressable onPress={() => setPinnedDismissed(true)} hitSlop={8}>
            <Ionicons name="close" size={18} color={theme.textTertiary} />
          </Pressable>
        </Pressable>
      )}

      {disappearing && !searchOpen && (
        <View style={[styles.disappearBanner, { backgroundColor: theme.surfaceElevated }]}>
          <Ionicons name="timer-outline" size={14} color={theme.textSecondary} />
          <Text style={[styles.disappearText, { color: theme.textSecondary }]}>
            Disappearing messages: {disappearing === '24h' ? '24 hours' : disappearing === '7d' ? '7 days' : '90 days'}
          </Text>
        </View>
      )}

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

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0} style={{ flex: 1 }}>
        {searchOpen ? (
          <SearchPanel
            query={searchQuery}
            messages={searchItems}
            onJumpToMessage={jumpToMessage}
            onOpenMedia={openImageViewer}
          />
        ) : loading ? (
          <ChatSkeleton />
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => (r.kind === 'date' ? r.id : r.message.id)}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 10 }}
            renderItem={renderRow}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            // Keep older messages visually anchored when a previous page is
            // prepended so the list doesn't jump to the top.
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            scrollEventThrottle={64}
            onScroll={(e) => {
              if (e.nativeEvent.contentOffset.y <= 60 && hasMoreOlder && !loadingOlder) loadOlder();
            }}
            ListHeaderComponent={
              loadingOlder ? <ActivityIndicator color={theme.brand} style={{ marginVertical: 12 }} /> : null
            }
            onContentSizeChange={() => {
              if (suppressAutoScroll.current) return;
              listRef.current?.scrollToEnd({ animated: true });
            }}
            onScrollToIndexFailed={() => {}}
          />
        )}

        {!searchOpen ? (
        <View style={{ paddingBottom: Platform.OS === 'ios' ? insets.bottom : 8, backgroundColor: theme.surface }}>
        <ChatComposer
          ref={composerRef}
          conversationId={conversationId}
          replyTo={
            replyTo
              ? {
                  id: replyTo.id,
                  senderName: replyTo.senderId === me?.id ? 'yourself' : peerName || 'them',
                  content: replyTo.isUnsent ? 'message removed' : replyTo.content || 'Media',
                }
              : null
          }
          editingMessage={editingMessage ? { id: editingMessage.id, content: editingMessage.content ?? '' } : null}
          onClearReply={() => setReplyTo(null)}
          onClearEdit={cancelEditing}
          onSendText={handleSendText}
          onSendImages={handleSendImages}
          onSendVideo={handleSendVideo}
          onSendAudio={handleSendAudioClip}
          onSendDocument={pickAndSendDocument}
          onSendAudioFile={pickAndSendAudio}
          onSendGif={sendGif}
          onSendLocation={handleSendLocationCard}
          onEditConfirm={handleEditConfirm}
          onSendViewOnce={() => pickAndSendPhoto(true)}
          onShareAlbum={openAlbumPicker}
          onTypingStart={handleTypingStart}
          onTypingStop={handleTypingStop}
          canUseTemplates={canUseTemplates}
          onOpenTemplates={openTemplatePicker}
          placeholder="Say something…"
        />
        </View>
        ) : null}
      </KeyboardAvoidingView>

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

      <Modal visible={templatesOpen} transparent animationType="slide" onRequestClose={() => setTemplatesOpen(false)}>
        <Pressable style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]} onPress={() => setTemplatesOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface, maxHeight: '60%' }]} onPress={() => {}}>
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Saved replies</Text>
            {templatesLoading ? (
              <ActivityIndicator color={theme.brand} style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={templates}
                keyExtractor={(t) => t.id}
                ListEmptyComponent={
                  <Text style={[styles.emptyAlbums, { color: theme.textSecondary }]}>
                    No saved replies yet. Add some from your chat settings.
                  </Text>
                }
                renderItem={({ item }) => (
                  <Pressable style={styles.sheetRow} onPress={() => insertTemplate(item)}>
                    <Ionicons name="chatbox-ellipses-outline" size={22} color={theme.brand} />
                    <Text style={[styles.sheetLabel, { color: theme.textPrimary, flex: 1 }]} numberOfLines={2}>
                      {item.content}
                    </Text>
                  </Pressable>
                )}
              />
            )}
            <Pressable style={styles.cancelSheet} onPress={() => setTemplatesOpen(false)}>
              <Text style={{ color: theme.textSecondary }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ExpiringPhotoViewer
        visible={!!expiringView}
        url={expiringView?.url ?? null}
        expiresInSeconds={expiringView?.seconds ?? 10}
        loading={expiringView?.loading}
        onClose={() => setExpiringView(null)}
      />
      <PhotoViewer visible={!!photoViewUrl} url={photoViewUrl} onClose={() => setPhotoViewUrl(null)} />
      <MediaViewer
        visible={mediaViewerOpen}
        images={viewerImages}
        initialIndex={mediaViewerIndex}
        onClose={() => setMediaViewerOpen(false)}
      />
      {(() => {
        if (!menuMessage) return null;
        const item = menuMessage;
        const mine = item.senderId === me?.id;
        const withinEditWindow = Date.now() - new Date(item.createdAt).getTime() < EDIT_WINDOW_MS;
        const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
        const isImage = !item.isUnsent && !isViewOnce(item) && item.type === 'photo' && item.mediaUrls.length > 0;
        const actions: { key: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; destructive?: boolean }[] = [
          { key: 'reply', label: 'Reply', icon: 'arrow-undo-outline', onPress: () => { onSwipeReply(item); setMenuMessage(null); } },
        ];
        if (!item.isUnsent && item.content) {
          actions.push({ key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: () => copyMessage(item) });
        }
        actions.push({ key: 'forward', label: 'Forward (soon)', icon: 'arrow-redo-outline', onPress: () => setMenuMessage(null) });
        if (!item.isUnsent) {
          actions.push({ key: 'star', label: item.isStarred ? 'Unstar' : 'Star', icon: item.isStarred ? 'star' : 'star-outline', onPress: () => toggleStar(item) });
          actions.push({ key: 'pin', label: item.isPinned ? 'Unpin' : 'Pin', icon: item.isPinned ? 'pin' : 'pin-outline', onPress: () => togglePin(item) });
        }
        if (mine && item.type === 'text' && canEdit && withinEditWindow && !item.isUnsent) {
          actions.push({ key: 'edit', label: 'Edit', icon: 'create-outline', onPress: () => { setMenuMessage(null); startEditing(item); } });
        }
        if (!mine && item.type === 'text' && item.content && canEdit) {
          actions.push({ key: 'translate', label: translations[item.id] ? 'Hide translation' : 'Translate', icon: 'language-outline', onPress: () => translateMessageText(item) });
        }
        if (isImage) {
          actions.push({ key: 'save', label: 'Save to Gallery', icon: 'download-outline', onPress: () => saveMediaToGallery(item) });
        }
        // Delete for me — available on any message.
        actions.push({ key: 'delete_me', label: 'Delete for Me', icon: 'trash-outline', destructive: true, onPress: () => runDeleteSelf(item) });
        // Delete for everyone — own messages, plan-gated (Premium before read, Gold anytime).
        if (mine && canUnsend && (canUnsendAnytime || !item.readAt) && !item.isUnsent) {
          actions.push({ key: 'delete_all', label: 'Delete for Everyone', icon: 'trash-bin-outline', destructive: true, onPress: () => { setMenuMessage(null); runUnsend(item); } });
        }
        if (!mine) {
          actions.push({ key: 'report', label: 'Report', icon: 'flag-outline', onPress: openReportFromMenu });
        }

        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => setMenuMessage(null)}>
            <Pressable style={{ flex: 1 }} onPress={() => setMenuMessage(null)}>
              <BlurView intensity={28} tint="dark" style={{ flex: 1 }}>
                <View style={styles.menuCenter}>
                  <View style={[styles.emojiRow, { backgroundColor: theme.surface }]}>
                    {QUICK_EMOJIS.map((e) => (
                      <Pressable key={e} onPress={() => onReact(item, e)} hitSlop={4} style={styles.emojiBtn}>
                        <Text style={styles.emojiBtnText}>{e}</Text>
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => { setEmojiPickerOpen(true); }}
                      style={[styles.plusBtn, { backgroundColor: theme.surfaceElevated }]}
                    >
                      <Ionicons name="add" size={22} color={theme.textSecondary} />
                    </Pressable>
                  </View>
                  <View style={[styles.menuList, { backgroundColor: theme.surface }]}>
                    {actions.map((a) => {
                      const color = a.destructive ? theme.error : theme.textPrimary;
                      return (
                        <Pressable key={a.key} onPress={a.onPress} style={styles.menuItem}>
                          <Text style={[styles.menuItemText, { color }]}>{a.label}</Text>
                          <Ionicons name={a.icon} size={20} color={color} />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </BlurView>
            </Pressable>
          </Modal>
        );
      })()}

      <Modal visible={emojiPickerOpen} transparent animationType="slide" onRequestClose={() => setEmojiPickerOpen(false)}>
        <Pressable style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]} onPress={() => setEmojiPickerOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <EmojiPicker
              onSelect={(emoji) => {
                if (menuMessage) onReact(menuMessage, emoji);
                setEmojiPickerOpen(false);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {peerId && (
        <ReportSheet visible={reportOpen} userId={peerId} onClose={() => setReportOpen(false)} />
      )}

      <ReactionDetails
        visible={!!reactionDetailsFor}
        onClose={() => setReactionDetailsFor(null)}
        scope="chat"
        parentId={conversationId}
        messageId={reactionDetailsFor}
      />

      {/* Header three-dot menu */}
      <Modal visible={headerMenuOpen} transparent animationType="fade" onRequestClose={() => setHeaderMenuOpen(false)}>
        <Pressable style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]} onPress={() => setHeaderMenuOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                setHeaderMenuOpen(false);
                if (lockConfig?.locked) disableLock();
                else setLockSetupOpen(true);
              }}
            >
              <Ionicons name={lockConfig?.locked ? 'lock-open-outline' : 'lock-closed-outline'} size={22} color={theme.brand} />
              <Text style={[styles.sheetLabel, { color: theme.textPrimary }]}>{lockConfig?.locked ? 'Unlock Chat (remove)' : 'Lock Chat'}</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={() => { setHeaderMenuOpen(false); setDisappearingOpen(true); }}>
              <Ionicons name="timer-outline" size={22} color={theme.brand} />
              <Text style={[styles.sheetLabel, { color: theme.textPrimary }]}>Disappearing Messages</Text>
            </Pressable>
            <Pressable style={styles.sheetRow} onPress={() => { setHeaderMenuOpen(false); setE2eInfoOpen(true); }}>
              <Ionicons name="shield-checkmark-outline" size={22} color={theme.brand} />
              <Text style={[styles.sheetLabel, { color: theme.textPrimary }]}>Encryption</Text>
            </Pressable>
            <Pressable style={styles.cancelSheet} onPress={() => setHeaderMenuOpen(false)}>
              <Text style={{ color: theme.textSecondary }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Disappearing-messages picker */}
      <Modal visible={disappearingOpen} transparent animationType="slide" onRequestClose={() => setDisappearingOpen(false)}>
        <Pressable style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]} onPress={() => setDisappearingOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Disappearing Messages</Text>
            {([['Off', null], ['24 Hours', '24h'], ['7 Days', '7d'], ['90 Days', '90d']] as const).map(([label, value]) => (
              <Pressable key={label} style={styles.sheetRow} onPress={() => applyDisappearing(value)}>
                <Ionicons
                  name={disappearing === value ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={disappearing === value ? theme.brand : theme.textTertiary}
                />
                <Text style={[styles.sheetLabel, { color: theme.textPrimary }]}>{label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* E2E / transport-security info */}
      <Modal visible={e2eInfoOpen} transparent animationType="slide" onRequestClose={() => setE2eInfoOpen(false)}>
        <Pressable style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]} onPress={() => setE2eInfoOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
              <Ionicons name="lock-closed" size={36} color={theme.success} />
              <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Secure transport</Text>
              <Text style={{ color: theme.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                Messages are secured with TLS transport encryption in transit between your device and NearMe.
              </Text>
            </View>
            <Pressable style={[styles.cancelSheet, { marginTop: 12 }]} onPress={() => setE2eInfoOpen(false)}>
              <Text style={{ color: theme.brand, fontFamily: FontFamily.semibold }}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ChatLockSetup visible={lockSetupOpen} onClose={() => setLockSetupOpen(false)} onEnabled={enableLock} />

      <UpgradeModal visible={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

      {alertConfig ? <CustomAlert visible onDismiss={hideAlert} {...alertConfig} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  headTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  headAvatar: { width: 36, height: 36, borderRadius: 18 },
  headProfile: { flex: 1 },
  headNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headName: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, fontWeight: '700' },
  disappearBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 5 },
  disappearText: { fontSize: FontSize.xs, fontFamily: FontFamily.medium },
  headStatus: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },
  callBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  tooltip: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  searchInput: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.regular },
  searchCount: { fontSize: FontSize.xs, fontFamily: FontFamily.medium },
  banner: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10 },
  pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderLeftWidth: 3 },
  pinnedLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  pinnedText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 1 },
  translated: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, fontStyle: 'italic', marginTop: 4, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  tooltipText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 17 },
  dateRow: { alignItems: 'center', marginVertical: 8 },
  dateLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.medium, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  bubbleRow: { maxWidth: '82%' },
  left: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  mediaBubble: { borderRadius: 12, overflow: 'hidden' },
  snapBubble: { padding: 6 },
  textMe: { color: '#fff', fontSize: FontSize.md, fontFamily: FontFamily.regular },
  removed: { fontSize: FontSize.md, fontFamily: FontFamily.regular, fontStyle: 'italic' },
  mediaChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  locationCard: { width: 220, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6 },
  locationPin: { width: 56, height: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  locationInfo: { flex: 1 },
  fileName: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  fileSub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 1 },
  snapTile: { width: 160, borderRadius: 12, overflow: 'hidden' },
  snapOpened: { opacity: 0.55 },
  snapImage: { width: 160, height: 200 },
  snapPlaceholder: { width: 160, height: 200, alignItems: 'center', justifyContent: 'center' },
  snapLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  chatPhoto: { width: 200, height: 200, borderRadius: 12 },
  photoStack: { gap: 6 },
  multiBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  multiBadgeText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  albumCaption: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },
  photoCaption: { fontSize: FontSize.md, fontFamily: FontFamily.regular, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2, maxWidth: 260 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, marginHorizontal: 4 },
  time: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },
  quote: { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4, paddingRight: 8, borderRadius: 6, marginBottom: 4 },
  quoteName: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  quoteText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3, marginHorizontal: 4 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  reactionEmoji: { fontSize: FontSize.sm },
  reactionCount: { fontSize: FontSize.xs, fontFamily: FontFamily.medium },
  menuCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 12 },
  emojiRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
  emojiBtn: { paddingHorizontal: 4 },
  emojiBtnText: { fontSize: 28 },
  plusBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  menuList: { width: 240, borderRadius: 14, paddingVertical: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 13 },
  menuItemText: { fontSize: 15, fontFamily: FontFamily.medium },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: 12 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetLabel: { fontSize: FontSize.lg, fontWeight: '600' },
  cancelSheet: { alignItems: 'center', marginTop: 8 },
  emptyAlbums: { textAlign: 'center', paddingVertical: 20, fontSize: FontSize.md },
});
