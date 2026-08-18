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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as MediaLibrary from 'expo-media-library';
// SDK 56 moved the classic download/cache API under the /legacy subpath.
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { MiniProfile } from '../../src/components/MiniProfile';
import { RoomHeader } from '../../src/components/rooms/RoomHeader';
import { TypingDots } from '../../src/components/ui/TypingDots';
import { MessageBubble } from '../../src/components/rooms/MessageBubble';
import { EmojiPicker } from '../../src/components/rooms/EmojiPicker';
import { AppBottomSheet } from '../../src/components/ui/AppBottomSheet';
import type { GifResult } from '../../src/components/rooms/GifPicker';
import { ContextMenu } from '../../src/components/rooms/ContextMenu';
import { ChatComposer } from '../../src/components/chat/ChatComposer';
import { SearchPanel, type SearchMessage } from '../../src/components/chat/SearchPanel';
import { ReactionDetails } from '../../src/components/chat/ReactionDetails';
import { MessageInfo } from '../../src/components/chat/MessageInfo';
import { ScrollToBottomButton } from '../../src/components/chat/ScrollToBottomButton';
import { MediaViewer, type MediaViewerImage, type ThumbnailLayout } from '../../src/components/MediaViewer';
import { ForwardSheet } from '../../src/components/chat/ForwardSheet';
import { shareMediaUrl } from '../../src/utils/shareMedia';
import { useTheme, FontFamily, FontSize, spacing, radius } from '../../src/theme';
import { ChatSkeleton } from '../../src/components/Skeleton';
import { CustomAlert } from '../../src/components/CustomAlert';
import { useAlert } from '../../src/hooks/useAlert';
import { planAtLeast } from '../../src/lib/format';
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
  forwardRoomMessage,
  initiateRoomCall,
  joinRoomCall,
  getActiveRoomCall,
} from '../../src/services/api';
import { isAgoraAvailable } from '../../src/services/agora';
import {
  connectSocket,
  getSocket,
  emitRoomJoin,
  emitRoomLeave,
  emitRoomTyping,
  emitRoomMessageDelivered,
} from '../../src/services/socket';
import { uploadToR2 } from '../../src/utils/uploadToR2';
import { generateAndUploadVideoThumbnail } from '../../src/utils/videoThumbnail';
import { toastApiError, showSuccess, showError } from '../../src/lib/toast';
import type { RoomDetail, RoomMessageCard, RoomReaction, RoomReplyPreview, RoomUserCard } from '../../src/types/api';

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

// Media classification (mirrors MessageBubble). Videos ride on type='image'
// with an .mp4 url; GIFs are excluded from the MediaViewer gallery entirely.
function isRoomVideoUrl(url: string): boolean {
  return /\.mp4($|\?)/i.test(url) || url.includes('/video-clips/');
}
function isRoomGifUrl(url: string): boolean {
  return /\.gif($|\?)/i.test(url) || url.includes('klipy');
}

/** mm:ss for a duration in whole seconds. */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * What a reply quote should show for the message being replied to.
 *
 * Built entirely from the server's `replyTo` preview, which since
 * 20260726_video_and_duration carries `type` + a signed `mediaUrl` + `duration`.
 * That means a quoted image shows a real thumbnail even when the original sits
 * far outside the loaded page — the old client-side lookup into the message list
 * silently fell back to plain text in exactly that case.
 */
type RoomQuotePreview = { kind: 'image' | 'voice' | 'text'; thumbUrl?: string | null; label: string };

function roomQuotePreviewFor(replyTo: RoomReplyPreview): RoomQuotePreview {
  const { type, mediaUrl, duration } = replyTo;
  // Videos and GIFs ride on type 'image' in rooms — rooms have no thumbnailUrl
  // column (see MessageBubble.tsx), so there's no poster frame to quote; a
  // clear label beats the blank/generic text a bare content fallback gave.
  if (type === 'image' && mediaUrl && isRoomVideoUrl(mediaUrl)) {
    return { kind: 'text', label: duration != null ? `Video · ${formatDuration(duration)}` : 'Video' };
  }
  if (type === 'image' && mediaUrl && isRoomGifUrl(mediaUrl)) {
    return { kind: 'text', label: 'GIF' };
  }
  if (type === 'image' && mediaUrl) {
    return { kind: 'image', thumbUrl: mediaUrl, label: replyTo.content || 'Photo' };
  }
  if (type === 'voice') {
    return { kind: 'voice', label: duration != null ? formatDuration(duration) : 'Voice message' };
  }
  return { kind: 'text', label: replyTo.content || 'Message' };
}

export default function RoomChat() {
  const { theme } = useTheme();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const { alertConfig, hideAlert, showAlert } = useAlert();
  const params = useLocalSearchParams<{ id: string; unread?: string; scrollTo?: string }>();
  const roomId = String(params.id);
  const initialUnread = params.unread ? parseInt(params.unread, 10) || 0 : 0;
  const scrollToParamHandled = useRef(false);

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
  // pageY of the long-pressed bubble — anchors the context menu near the message
  // instead of centering it on screen (mirrors the 1:1 chat menu).
  const [contextY, setContextY] = useState(0);
  const [forwardMessages, setForwardMessages] = useState<RoomMessageCard[] | null>(null);
  const [editingMessage, setEditingMessage] = useState<RoomMessageCard | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const isSelecting = selectedMessageIds.size > 0;
  // Drives the selection bar's star icon: filled once every selected message is
  // already starred, because tapping it then unstars them.
  const allSelectedStarred =
    isSelecting && messages.filter((m) => selectedMessageIds.has(m.id)).every((m) => m.isStarred);
  const [miniUser, setMiniUser] = useState<RoomUserCard | null>(null);

  const [reactTarget, setReactTarget] = useState<RoomMessageCard | null>(null);
  const [infoMessage, setInfoMessage] = useState<RoomMessageCard | null>(null);
  const [reactionDetailsFor, setReactionDetailsFor] = useState<string | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<{ id: string; firstName: string; avatarUrl?: string | null }[]>([]);
  // Lowercased first name → member, so a tapped @mention resolves to a profile.
  const [membersByName, setMembersByName] = useState<Map<string, RoomUserCard>>(new Map());
  // Sender ids that hold admin/creator status — drives the "Admin" chip on their messages.
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [pinnedDismissed, setPinnedDismissed] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  // Rect of the thumbnail the viewer was opened from — drives the zoom
  // transition. null when the tap couldn't be measured (falls back to a fade).
  const [thumbnailLayout, setThumbnailLayout] = useState<ThumbnailLayout | null>(null);

  // Group calling: the room's currently-live call (if any), surfaced as a
  // "Join call" banner. Seeded on open via getActiveRoomCall (late joiners)
  // and kept live via room:call.invite / room:call.end sockets.
  const [activeCall, setActiveCall] = useState<{
    callId: string;
    type: 'audio' | 'video';
    agoraChannelName: string;
    agoraToken: string;
    initiatorId: string;
    initiatorName: string;
  } | null>(null);

  // Floating scroll-to-bottom pill (F26). The list is inverted (index 0 = newest
  // at the visual bottom), so "at bottom" is scroll offset ≈ 0.
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const atBottomRef = useRef(true);

  // Search-in-chat
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Index into `searchMatches` of the match being navigated ("3 of 12" up/down
  // arrows). null = still browsing the results panel.
  const [searchNav, setSearchNav] = useState<number | null>(null);

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

  // Seed the "Join call" banner if the room already has a live call when this screen opens.
  useEffect(() => {
    getActiveRoomCall(roomId)
      .then((res) => {
        if (!res.call) return;
        setActiveCall({
          callId: res.call.id,
          type: res.call.type,
          agoraChannelName: res.call.agoraChannelName,
          agoraToken: res.call.agoraToken,
          initiatorId: res.call.initiatorId,
          initiatorName: res.call.participants.find((p) => p.id === res.call!.initiatorId)?.name ?? 'Someone',
        });
      })
      .catch(() => {});
  }, [roomId]);

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
        setAdminIds(new Set(res.members.filter((m) => m.isCreator || m.role === 'admin').map((m) => m.user.id)));
        // Name → member index so a tapped @mention can open that member's
        // MiniProfile. Messages carry no structured `mentions` array, so the
        // first name in the text is the only key available.
        const byName = new Map<string, RoomUserCard>();
        res.members.forEach((m) => {
          const name = m.user.firstName?.toLowerCase();
          if (name && !byName.has(name)) byName.set(name, m.user);
        });
        setMembersByName(byName);
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
      const onCallInvite = (p: {
        callId: string;
        roomId: string;
        initiatorId: string;
        initiatorName: string | null;
        initiatorPhoto: string | null;
        type: 'audio' | 'video';
        agoraChannelName: string;
        agoraToken: string;
      }) => {
        if (p.roomId !== roomId) return;
        // Only updates the in-room "Join call" banner — the incoming-call toast
        // (ringtone + Accept/Decline) is dispatched app-wide from _layout.tsx so
        // it fires the same way whether the user is in this room or elsewhere.
        setActiveCall({
          callId: p.callId,
          type: p.type,
          agoraChannelName: p.agoraChannelName,
          agoraToken: p.agoraToken,
          initiatorId: p.initiatorId,
          initiatorName: p.initiatorName ?? 'Someone',
        });
      };
      const onCallEnd = (p: { callId: string }) => {
        setActiveCall((prev) => (prev?.callId === p.callId ? null : prev));
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
      socket.on('room:call.invite', onCallInvite);
      socket.on('room:call.end', onCallEnd);

      cleanupRef.current = () => {
        socket.off('room:message', onMessage);
        socket.off('room:message_delivered', onDelivered);
        socket.off('room:message_reaction', onReaction);
        socket.off('room:message_deleted', onDeleted);
        socket.off('room:message_edited', onEdited);
        socket.off('room:typing', onTyping);
        socket.off('room:info_updated', onInfoUpdated);
        socket.off('room:message_pinned', onPinned);
        socket.off('room:call.invite', onCallInvite);
        socket.off('room:call.end', onCallEnd);
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

  /**
   * Rooms have no dedicated video message type — videos ride on type='image'
   * with an .mp4 url (see isRoomVideoUrl). RoomMessage has no `thumbnailUrl`
   * column either, so the client-generated poster frame travels in `metadata`,
   * the field explicitly designed for opaque per-message data that must never be
   * rendered as text.
   */
  const handleSendVideo = async (uri: string, replyToId?: string, durationMs?: number | null) => {
    await runUpload(async () => {
      const thumbnailUrl = await generateAndUploadVideoThumbnail(uri);
      const url = await uploadToR2(uri, 'video', 'video/mp4', { onProgress: setUploadProgress });
      const duration = durationMs != null ? Math.max(0, Math.round(durationMs / 1000)) : undefined;
      const metadata = thumbnailUrl ? JSON.stringify({ thumbnailUrl }) : undefined;
      const msg = await sendRoomMessage(roomId, {
        content: '',
        type: 'image',
        mediaUrl: url,
        replyToId,
        metadata,
        duration,
      });
      appendMessage(msg);
    });
  };

  const handleSendAudioClip = async (uri: string, durationMs: number, replyToId?: string, amplitudes?: number[]) => {
    await runUpload(async () => {
      const url = await uploadToR2(uri, 'voice_clip', 'audio/mp4', { onProgress: setUploadProgress });
      // The real waveform rides in `metadata` (added 20260725), never `content` —
      // content IS rendered as plain text elsewhere (pinned banner, reply quotes,
      // search) and would leak raw JSON there.
      const metadata = amplitudes?.length ? JSON.stringify({ amplitudes }) : undefined;
      // Persist the real clip length: the stored waveform is resampled to a fixed
      // bar count, so it can't be recovered from the amplitudes afterwards.
      const duration = Math.max(0, Math.round(durationMs / 1000));
      const msg = await sendRoomMessage(roomId, { content: '', type: 'voice', mediaUrl: url, replyToId, metadata, duration });
      appendMessage(msg);
    });
  };

  const handleSendLocation = async (lat: number, lng: number, label: string) => {
    try {
      const msg = await sendRoomMessage(roomId, {
        content: `📍 ${label}|${lat}|${lng}`,
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

  /**
   * Media url of the long-pressed message, or null when it isn't saveable/shareable.
   * GIFs are excluded (they're remote KLIPY assets, same rule the media viewer uses).
   */
  const contextMediaUrl =
    contextMsg &&
    !contextMsg.isDeleted &&
    contextMsg.type === 'image' &&
    contextMsg.mediaUrl &&
    !isRoomGifUrl(contextMsg.mediaUrl)
      ? contextMsg.mediaUrl
      : null;

  /** Mirrors the 1:1 chat "Save to Gallery" action. */
  const saveMediaToGallery = async (url: string) => {
    setContextMsg(null);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        showError('Allow photo library access to save media.');
        return;
      }
      const isVideo = isRoomVideoUrl(url);
      const target = `${FileSystem.cacheDirectory}nearme-${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
      const dl = await FileSystem.downloadAsync(url, target);
      await MediaLibrary.saveToLibraryAsync(dl.uri);
      showSuccess('Saved to gallery');
    } catch {
      showError('Could not save media');
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

  // ── Multi-select (mirrors 1:1 chat/[id].tsx) ──
  const toggleSelect = useCallback((id: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enterSelectMode = useCallback((msg: RoomMessageCard) => {
    setContextMsg(null);
    setSelectedMessageIds(new Set([msg.id]));
  }, []);

  const clearSelection = useCallback(() => setSelectedMessageIds(new Set()), []);

  const onTapSelectable = useCallback(
    (msg: RoomMessageCard) => {
      if (!isSelecting) return;
      toggleSelect(msg.id);
    },
    [isSelecting, toggleSelect],
  );

  const openForward = (items: RoomMessageCard[]) => {
    if (!items.length) return;
    // The forward sheet is an RN Modal and so is the context menu; iOS refuses to
    // present a modal while another is still dismissing, so wait for the menu to
    // go before presenting. From the selection bar there is nothing to wait on.
    if (contextMsg) {
      setContextMsg(null);
      setTimeout(() => setForwardMessages(items), 250);
      return;
    }
    setForwardMessages(items);
  };

  /**
   * Star/unstar every selected message — same group-toggle semantics as 1:1 chat:
   * all already starred → unstar, otherwise star.
   */
  const batchStar = async () => {
    const ids = [...selectedMessageIds];
    if (!ids.length) return;
    const selected = messages.filter((m) => ids.includes(m.id));
    const next = !selected.every((m) => m.isStarred);
    clearSelection();
    setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, isStarred: next } : m)));
    const results = await Promise.all(
      ids.map((id) =>
        (next ? starMessage(id, 'room') : unstarMessage(id)).then(
          () => true,
          () => false,
        ),
      ),
    );
    const failed = ids.filter((_, i) => !results[i]);
    if (failed.length) {
      setMessages((prev) => prev.map((m) => (failed.includes(m.id) ? { ...m, isStarred: !next } : m)));
      showError(next ? 'Could not star some messages' : 'Could not unstar some messages');
    } else {
      showSuccess(next ? `${ids.length} starred` : `${ids.length} unstarred`);
    }
  };

  const batchDeleteForMe = async () => {
    const ids = [...selectedMessageIds];
    clearSelection();
    setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
    await Promise.all(ids.map((id) => deleteRoomMessageForMe(roomId, id).catch(() => {})));
  };

  const batchDeleteForEveryone = async () => {
    const ids = [...selectedMessageIds];
    clearSelection();
    // No optimistic update — the room:message_deleted socket echo (onDeleted
    // above) marks each as deleted, same as the single-message doDelete flow.
    await Promise.all(ids.map((id) => deleteRoomMessage(roomId, id).catch(() => {})));
  };

  const confirmBatchDelete = () => {
    const ids = [...selectedMessageIds];
    const selected = messages.filter((m) => ids.includes(m.id));
    // Same permission rule as the single-message "Delete for Everyone" action
    // (ContextMenu): sender or admin, and not already deleted.
    const canDeleteForEveryone = selected.length > 0 && selected.every((m) => (m.senderId === me?.id || isAdmin) && !m.isDeleted);
    const count = ids.length;
    showAlert({
      title: 'Delete messages?',
      message: `${count} message${count > 1 ? 's' : ''} selected.`,
      icon: 'trash',
      iconColor: theme.error,
      buttons: [
        { label: 'Cancel', style: 'cancel', onPress: hideAlert },
        { label: 'Delete for Me', style: 'default', onPress: () => { hideAlert(); batchDeleteForMe(); } },
        ...(canDeleteForEveryone
          ? [{ label: 'Delete for Everyone', style: 'destructive' as const, onPress: () => { hideAlert(); batchDeleteForEveryone(); } }]
          : []),
      ],
    });
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

  // ── Group calling ──
  const goToCallScreen = (call: {
    callId: string;
    type: 'audio' | 'video';
    agoraChannelName: string;
    agoraToken: string;
    initiatorId: string;
  }) => {
    router.push({
      pathname: '/call/[id]',
      params: {
        id: call.callId,
        channel: call.agoraChannelName,
        token: call.agoraToken,
        type: call.type,
        roomId,
        roomName: room?.name ?? 'Group',
        callId: call.callId,
        initiatorId: call.initiatorId,
      },
    });
  };

  const startRoomCall = async (type: 'audio' | 'video') => {
    if (activeCall) {
      goToCallScreen(activeCall);
      return;
    }
    if (!isAgoraAvailable) {
      showError('Calls need the latest app build. Please update or reinstall the app.');
      return;
    }
    try {
      const res = await initiateRoomCall(roomId, type);
      goToCallScreen({ ...res, callId: res.id });
    } catch (e) {
      toastApiError(e, 'Could not start call');
    }
  };

  const joinActiveCall = async () => {
    if (!activeCall) return;
    if (!isAgoraAvailable) {
      showError('Calls need the latest app build. Please update or reinstall the app.');
      return;
    }
    try {
      await joinRoomCall(roomId, activeCall.callId);
    } catch {
      /* the call may have just ended server-side — still let them try to join the channel */
    }
    goToCallScreen(activeCall);
  };

  // ── Reply / swipe ──
  const onSwipeReply = useCallback((msg: RoomMessageCard) => {
    // Haptic already fired at the 60px threshold crossing (MessageBubble pan).
    setReplyTo(msg);
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

  // Deep link from Pinned Messages: jump to the target message once it's loaded.
  useEffect(() => {
    if (!params.scrollTo || scrollToParamHandled.current) return;
    if (messages.some((m) => m.id === params.scrollTo)) {
      scrollToParamHandled.current = true;
      scrollToMessage(params.scrollTo);
    }
  }, [params.scrollTo, messages, scrollToMessage]);

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
    if (names.length === 1) return `${names[0]} is typing`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
    return 'Several people are typing';
  })();

  const pinned = useMemo(
    () => (pinnedDismissed ? null : messages.find((m) => m.isPinned && !m.isDeleted) ?? null),
    [messages, pinnedDismissed],
  );

  // Chronological list of images AND videos (GIFs/docs excluded) for the
  // full-screen MediaViewer. `messages` is newest-first, so reverse a copy.
  const viewerImages = useMemo<MediaViewerImage[]>(() => {
    const out: MediaViewerImage[] = [];
    [...messages].reverse().forEach((m) => {
      if (m.isDeleted || m.type !== 'image' || !m.mediaUrl) return;
      if (isRoomGifUrl(m.mediaUrl)) return;
      out.push({
        uri: m.mediaUrl,
        senderId: m.senderId,
        senderName: m.senderId === me?.id ? 'You' : m.sender.firstName ?? 'Someone',
        createdAt: m.createdAt,
        kind: isRoomVideoUrl(m.mediaUrl) ? 'video' : 'image',
      });
    });
    return out;
  }, [messages, me?.id]);

  /**
   * Open the full-screen viewer at a given media url (image or video).
   * `layout` is the tapped thumbnail's measured rect — the viewer zooms out of
   * it on open and back into it on dismiss.
   */
  const openMediaViewer = useCallback(
    (url: string, layout?: ThumbnailLayout) => {
      const idx = viewerImages.findIndex((e) => e.uri === url);
      setMediaViewerIndex(idx < 0 ? 0 : idx);
      setThumbnailLayout(layout ?? null);
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

  // IDs of messages matching the query. `messages` is newest-first, so index 0
  // is the most recent match.
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as string[];
    return messages.filter((m) => !m.isDeleted && m.content?.toLowerCase().includes(q)).map((m) => m.id);
  }, [messages, searchQuery]);

  // Navigate to a match while KEEPING the search bar open. The chat list may be
  // freshly re-mounted (the results panel was covering it) — let it lay out first.
  const scrollToMatch = useCallback(
    (idx: number) => {
      const id = searchMatches[idx];
      if (!id) return;
      const wasBrowsing = searchNav == null;
      setSearchNav(idx);
      setTimeout(() => scrollToMessage(id), wasBrowsing ? 350 : 50);
    },
    [searchMatches, searchNav, scrollToMessage],
  );

  const jumpToMessage = useCallback(
    (id: string) => {
      if (searchMode) {
        const matchIdx = searchMatches.indexOf(id);
        if (matchIdx >= 0) {
          scrollToMatch(matchIdx);
          return;
        }
      }
      const wasSearching = searchMode;
      setSearchMode(false);
      setSearchQuery('');
      setSearchNav(null);
      if (wasSearching) setTimeout(() => scrollToMessage(id), 350);
      else scrollToMessage(id);
    },
    [searchMode, searchMatches, scrollToMatch, scrollToMessage],
  );

  const searchHighlightId = null;

  // Tapping an @mention opens that member's MiniProfile. Unresolvable names
  // (a member who has since left, or a false-positive "@word") are ignored
  // rather than opening an empty sheet.
  const onMentionPress = useCallback(
    (firstName: string) => {
      const member = membersByName.get(firstName.toLowerCase());
      if (member) setMiniUser(member);
    },
    [membersByName],
  );


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
            isAdmin={adminIds.has(item.senderId)}
            deliveryStatus={deliveryStatus}
            highlight={highlightId === item.id || searchHighlightId === item.id}
            isSelecting={isSelecting}
            isSelected={selectedMessageIds.has(item.id)}
            isMenuTarget={contextMsg?.id === item.id}
            replyPreview={item.replyTo ? roomQuotePreviewFor(item.replyTo) : null}
            onAvatarPress={() => setMiniUser(item.sender)}
            onLongPress={(pageY) => {
              // Medium impact matches the 1:1 surface (unified haptic vocabulary).
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              if (isSelecting) {
                toggleSelect(item.id);
                return;
              }
              setContextY(pageY ?? 0);
              setContextMsg(item);
            }}
            onTap={() => onTapSelectable(item)}
            onSwipeReply={() => onSwipeReply(item)}
            onReactionPress={(emoji) => toggleReaction(item, emoji)}
            onReactionLongPress={() => setReactionDetailsFor(item.id)}
            onReplyPress={() => item.replyTo && scrollToMessage(item.replyTo.id)}
            onImagePress={openMediaViewer}
            onVideoPress={openMediaViewer}
            onMentionPress={onMentionPress}
          />
        </View>
      );
    },
    // toggleReaction stable enough; deps kept minimal to avoid re-renders
    [messages, me?.id, highlightId, searchHighlightId, initialUnread, onSwipeReply, scrollToMessage, openMediaViewer, adminIds, isSelecting, selectedMessageIds, toggleSelect, onTapSelectable, contextMsg?.id, onMentionPress],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View>
      {/* Header, selection bar, or search bar */}
      {isSelecting ? (
        <View style={[styles.searchHeader, { borderBottomColor: theme.border }]}>
          <Pressable onPress={clearSelection} hitSlop={12}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={[styles.selectionCount, { color: theme.textPrimary }]}>
            {selectedMessageIds.size} selected
          </Text>
          <Pressable
            onPress={() => openForward(messages.filter((m) => selectedMessageIds.has(m.id)))}
            hitSlop={10}
            style={styles.selectionAction}
          >
            <Ionicons name="arrow-redo-outline" size={22} color={theme.textPrimary} />
          </Pressable>
          <Pressable onPress={batchStar} hitSlop={10} style={styles.selectionAction}>
            {/* Filled star = every selected message is starred, so the action unstars. */}
            <Ionicons
              name={allSelectedStarred ? 'star' : 'star-outline'}
              size={22}
              color={allSelectedStarred ? theme.brand : theme.textPrimary}
            />
          </Pressable>
          <Pressable onPress={confirmBatchDelete} hitSlop={10} style={styles.selectionAction}>
            <Ionicons name="trash-outline" size={22} color={theme.error} />
          </Pressable>
        </View>
      ) : searchMode ? (
        <View style={[styles.searchHeader, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => { setSearchMode(false); setSearchQuery(''); setSearchNav(null); }} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <View style={[styles.searchInputWrap, { backgroundColor: theme.surfaceElevated }]}>
            <Ionicons name="search" size={18} color={theme.textTertiary} />
            <TextInput
              autoFocus
              value={searchQuery}
              onChangeText={(t) => { setSearchQuery(t); setSearchNav(null); }}
              placeholder="Search in chat"
              placeholderTextColor={theme.textTertiary}
              returnKeyType="search"
              onSubmitEditing={() => { if (searchMatches.length) scrollToMatch(0); }}
              style={[styles.searchInput, { color: theme.textPrimary }]}
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => { setSearchQuery(''); setSearchNav(null); }} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
              </Pressable>
            ) : null}
          </View>
          {searchQuery.trim().length > 0 ? (
            <View style={styles.searchNav}>
              <Text style={[styles.matchCount, { color: theme.textTertiary }]}>
                {searchNav == null
                  ? `${searchMatches.length} found`
                  : `${searchNav + 1} of ${searchMatches.length}`}
              </Text>
              <Pressable
                disabled={searchMatches.length === 0 || (searchNav != null && searchNav >= searchMatches.length - 1)}
                onPress={() => scrollToMatch(searchNav == null ? 0 : searchNav + 1)}
                hitSlop={8}
                style={{ opacity: searchMatches.length === 0 || (searchNav != null && searchNav >= searchMatches.length - 1) ? 0.3 : 1 }}
              >
                <Ionicons name="chevron-up" size={22} color={theme.textPrimary} />
              </Pressable>
              <Pressable
                disabled={searchNav == null || searchNav <= 0}
                onPress={() => searchNav != null && scrollToMatch(searchNav - 1)}
                hitSlop={8}
                style={{ opacity: searchNav == null || searchNav <= 0 ? 0.3 : 1 }}
              >
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
          onAudioCall={() => startRoomCall('audio')}
          onVideoCall={() => startRoomCall('video')}
        />
      )}

      {/* Active group call banner */}
      {activeCall && !searchMode && !isSelecting ? (
        <Pressable
          onPress={joinActiveCall}
          style={[styles.pinnedBanner, { backgroundColor: theme.surfaceElevated, borderLeftColor: theme.online }]}
        >
          <Ionicons name={activeCall.type === 'video' ? 'videocam' : 'call'} size={16} color={theme.online} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.pinnedLabel, { color: theme.online }]}>
              {activeCall.type === 'video' ? 'Group video call' : 'Group audio call'} in progress
            </Text>
            <Text style={[styles.pinnedText, { color: theme.textSecondary }]} numberOfLines={1}>
              Tap to join
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* Pinned banner */}
      {pinned && !searchMode && !isSelecting ? (
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

      {/* F27: `padding` on both platforms. keyboardVerticalOffset is 0 on purpose
          — KeyboardAvoidingView auto-measures its own screen position, which
          already accounts for the header/banners above it; adding insets.top +
          topOffset on top double-counted that distance and left a gap between
          the composer and the keyboard. The list below drops
          `automaticallyAdjustKeyboardInsets` (it double-applied with this KAV). */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        {searchMode && searchNav == null ? (
          <SearchPanel
            query={searchQuery}
            messages={searchItems}
            onJumpToMessage={jumpToMessage}
            onOpenMedia={openMediaViewer}
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

        {typingText ? (
          <View style={styles.typingRow}>
            <Text style={[styles.typing, { color: theme.textTertiary }]}>{typingText}</Text>
            <TypingDots />
          </View>
        ) : null}

        {/* Composer (shared with inbox) */}
        {!searchMode ? (
          <ChatComposer
            roomId={roomId}
            replyTo={
              replyTo
                ? (() => {
                    // Reuse the same preview logic the sent-message quote uses, so the
                    // reply banner shows a real thumbnail/label instead of a generic
                    // "Photo" fallback for videos, voice notes, and GIFs.
                    const preview = roomQuotePreviewFor({
                      id: replyTo.id,
                      senderFirstName: replyTo.sender.firstName,
                      content: replyTo.content,
                      type: replyTo.type,
                      mediaUrl: replyTo.mediaUrl,
                      duration: replyTo.duration,
                    });
                    return {
                      id: replyTo.id,
                      senderName: replyTo.sender.firstName ?? 'Someone',
                      content: preview.label,
                      kind: preview.kind,
                      thumbUrl: preview.thumbUrl,
                    };
                  })()
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
            {room?.isCreator === true ? (
              <MenuItem
                icon="trash-outline"
                label="Delete Group"
                destructive
                onPress={() => {
                  setMenuOpen(false);
                  router.push(`/rooms/info?roomId=${roomId}&action=delete` as Href);
                }}
              />
            ) : null}
          </View>
        </Pressable>
      </Modal>

      {/* Long-press context menu */}
      <ContextMenu
        message={contextMsg}
        isOwn={contextMsg?.senderId === me?.id}
        isAdmin={isAdmin}
        anchorY={contextY}
        canEdit={
          !!contextMsg &&
          contextMsg.senderId === me?.id &&
          contextMsg.type === 'text' &&
          !contextMsg.isDeleted &&
          Date.now() - new Date(contextMsg.createdAt).getTime() < EDIT_WINDOW_MS &&
          planAtLeast(me?.plan, 'gold')
        }
        onClose={() => setContextMsg(null)}
        onReact={(e) => contextMsg && toggleReaction(contextMsg, e)}
        onOpenEmojiPicker={() => {
          setReactTarget(contextMsg);
          setContextMsg(null);
        }}
        onReply={() => { setReplyTo(contextMsg); setContextMsg(null); }}
        onCopy={() => contextMsg && doCopy(contextMsg)}
        onForward={() => contextMsg && openForward([contextMsg])}
        onStar={() => contextMsg && doStar(contextMsg)}
        onPin={() => contextMsg && doPin(contextMsg)}
        onEdit={() => {
          if (!contextMsg) return;
          setReplyTo(null);
          setEditingMessage(contextMsg);
          setContextMsg(null);
        }}
        onSave={contextMediaUrl ? () => saveMediaToGallery(contextMediaUrl) : undefined}
        onShare={
          contextMediaUrl
            ? () => {
                setContextMsg(null);
                shareMediaUrl(contextMediaUrl);
              }
            : undefined
        }
        onSelect={() => contextMsg && enterSelectMode(contextMsg)}
        onDeleteForMe={() => contextMsg && doDeleteForMe(contextMsg)}
        onDelete={() => contextMsg && doDelete(contextMsg)}
        onReport={() => contextMsg && doReport(contextMsg)}
        onInfo={() => { setInfoMessage(contextMsg); setContextMsg(null); }}
      />

      <MessageInfo
        message={infoMessage}
        isOwn={infoMessage?.senderId === me?.id}
        deliveredCount={infoMessage?.deliveredCount ?? 0}
        onClose={() => setInfoMessage(null)}
      />

      <ForwardSheet
        visible={!!forwardMessages}
        onClose={() => setForwardMessages(null)}
        onForward={async (targetConversationIds) => {
          const items = forwardMessages ?? [];
          if (!items.length || !targetConversationIds.length) return;
          try {
            // Oldest → newest, sequentially, so the recipient sees the same order.
            const ordered = [...items].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
            for (const item of ordered) {
              await forwardRoomMessage(roomId, item.id, targetConversationIds);
            }
            const chats = `${targetConversationIds.length} chat${targetConversationIds.length > 1 ? 's' : ''}`;
            showSuccess(
              items.length > 1 ? `${items.length} messages forwarded to ${chats}` : `Forwarded to ${chats}`,
            );
            clearSelection();
            setForwardMessages(null);
          } catch (e) {
            toastApiError(e, 'Could not forward message');
          }
        }}
      />

      {alertConfig ? <CustomAlert visible onDismiss={hideAlert} {...alertConfig} /> : null}

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
        thumbnailLayout={thumbnailLayout}
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
  selectionCount: { flex: 1, fontSize: FontSize.lg, fontFamily: FontFamily.semibold },
  selectionAction: { marginLeft: spacing.md },

  selectRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  selectCheckbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },

  pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderLeftWidth: 3 },
  pinnedLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  pinnedText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 1 },

  dateSepWrap: { alignItems: 'center', marginVertical: spacing.sm },
  dateSep: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  dateSepText: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },

  unreadWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm, paddingHorizontal: spacing.xl },
  unreadLine: { flex: 1, height: StyleSheet.hairlineWidth },
  unreadText: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },

  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.lg, paddingBottom: 4 },
  typing: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },

  menuBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  menu: { minWidth: 250, borderRadius: radius.lg, paddingVertical: spacing.sm, gap: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  menuItemText: { fontSize: FontSize.md, fontFamily: FontFamily.medium },
});
