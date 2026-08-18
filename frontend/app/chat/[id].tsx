import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { RemoteImage } from '../../src/components/RemoteImage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  FadeInDown,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, FontSize, DisplayFont } from '../../src/theme';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import { ExpiringPhotoViewer } from '../../src/components/ExpiringPhotoViewer';
import { PhotoViewer } from '../../src/components/PhotoViewer';
import { MediaViewer, type MediaViewerImage, type ThumbnailLayout } from '../../src/components/MediaViewer';
import { CustomAlert } from '../../src/components/CustomAlert';
import { useAlert } from '../../src/hooks/useAlert';
import { EmojiPicker } from '../../src/components/rooms/EmojiPicker';
import { AppBottomSheet } from '../../src/components/ui/AppBottomSheet';
import { TypingDots } from '../../src/components/ui/TypingDots';
import { ScrollToBottomButton } from '../../src/components/chat/ScrollToBottomButton';
import { ChatComposer, type ChatComposerHandle } from '../../src/components/chat/ChatComposer';
import { SearchPanel, type SearchMessage } from '../../src/components/chat/SearchPanel';
import { ReactionPill } from '../../src/components/chat/ReactionPill';
import { ReactionDetails } from '../../src/components/chat/ReactionDetails';
import { MessageInfo } from '../../src/components/chat/MessageInfo';
import { ForwardSheet } from '../../src/components/chat/ForwardSheet';
import { shareMediaUrl } from '../../src/utils/shareMedia';
import { showSuccess, showError, toastApiError } from '../../src/lib/toast';
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
import { VideoBubble } from '../../src/components/chat/VideoBubble';
import { LinkPreview } from '../../src/components/chat/LinkPreview';
import { AiIcebreakers } from '../../src/components/chat/AiIcebreakers';
import { measureThumbnail } from '../../src/utils/measureThumbnail';
import type { GifResult } from '../../src/components/rooms/GifPicker';
import { uploadToR2 } from '../../src/utils/uploadToR2';
import { generateAndUploadVideoThumbnail } from '../../src/utils/videoThumbnail';
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
  forwardMessage,
  getMessageTemplates,
  reactToMessage,
  deleteMessage,
  pinChatMessage,
  translateMessage,
  starMessage,
  unstarMessage,
  setDisappearingMessages,
  getIcebreakers,
  ApiError,
  type SendMessageBody,
  type MessageTemplate,
} from '../../src/services/api';
import { connectSocket, emitTyping } from '../../src/services/socket';
import { isAgoraAvailable } from '../../src/services/agora';
import { useAuthStore } from '../../src/store/authStore';
import { useChatStore } from '../../src/store/chatStore';
import { clockTime, planAtLeast, chatDateHeader, sameCalendarDay, formatLastSeen } from '../../src/lib/format';
import { hasUrl, linkifyText, firstUrl, isBareUrl } from '../../src/lib/linkify';
import { classifyMessagesChange, shouldAutoScrollOnAppend } from '../../src/lib/chatScroll';
import { ChatSkeleton } from '../../src/components/Skeleton';
import { MessageTick } from '../../src/components/MessageTick';
import type { Message, AlbumSummary } from '../../src/types/api';

const CALL_DISABLED_TOOLTIP =
  'Calls will be enabled after the other person replies to your message at least once.';
const AUDIO_UNAVAILABLE_TOOLTIP = 'This person is not accepting audio calls right now.';
const VIDEO_UNAVAILABLE_TOOLTIP = 'This person is not accepting video calls right now.';

type ChatRow =
  | { kind: 'date'; id: string; label: string }
  | { kind: 'unread_divider'; id: string }
  | { kind: 'message'; message: Message };

function buildRows(messages: Message[], meId: string | undefined): ChatRow[] {
  const rows: ChatRow[] = [];
  const firstUnreadIndex = messages.findIndex((m) => m.senderId !== meId && !m.readAt && !m.isUnsent);
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || !sameCalendarDay(prev.createdAt, m.createdAt)) {
      rows.push({ kind: 'date', id: `d-${m.createdAt}`, label: chatDateHeader(m.createdAt) });
    }
    if (i === firstUnreadIndex) {
      rows.push({ kind: 'unread_divider', id: `unread-${m.id}` });
    }
    rows.push({ kind: 'message', message: m });
  });
  return rows;
}

function isViewOnce(msg: Message) {
  return msg.type === 'expiring_photo' || (msg.type === 'photo' && msg.viewOnce);
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
 * 20260726_video_and_duration carries `type` + signed `mediaUrl`/`thumbnailUrl`
 * + `duration`. That means a quoted photo/video shows a real thumbnail even when
 * the original sits far outside the loaded page — the old client-side lookup
 * into the message list silently fell back to plain text in exactly that case.
 */
type QuotePreview = { kind: 'image' | 'voice' | 'text'; thumbUrl?: string | null; label: string };

function quotePreviewFor(replyTo: NonNullable<Message['replyTo']>): QuotePreview {
  const { type, mediaUrl, thumbnailUrl, duration } = replyTo;
  // Video quotes prefer the poster frame; a photo quote uses the image itself.
  if (type === 'video' && (thumbnailUrl || mediaUrl)) {
    return {
      kind: 'image',
      thumbUrl: thumbnailUrl ?? mediaUrl,
      label: duration != null ? `Video · ${formatDuration(duration)}` : 'Video',
    };
  }
  if (type === 'photo' && mediaUrl) {
    return { kind: 'image', thumbUrl: mediaUrl, label: replyTo.content || 'Photo' };
  }
  if (type === 'voice' || type === 'voice_note') {
    return { kind: 'voice', label: duration != null ? formatDuration(duration) : 'Voice message' };
  }
  return { kind: 'text', label: replyTo.content };
}

const SWIPE_TRIGGER = 60;

/** Haptic fired the instant the swipe-to-reply threshold is crossed (WhatsApp "click"). */
function swipeThresholdHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Swipe-right-to-reply wrapper (mirrors the group-chat MessageBubble gesture). */
function SwipeToReply({
  messageId,
  onSwipeReply,
  children,
}: {
  messageId: string;
  onSwipeReply: () => void;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const translateX = useSharedValue(0);
  // Tracks whether the 60px threshold is currently crossed so the haptic fires
  // exactly once at the crossing (and re-arms if the finger pulls back).
  const armed = useSharedValue(false);
  // FlashList recycles row views rather than remounting them, so this component
  // instance can be reused for a different message. Without this, a cell that was
  // mid-swipe (or just sprung back) when recycled would briefly render the old
  // offset for the new message before snapping to 0 — the reported "jumps left
  // and right". Resetting on identity change (not animated) keeps a fresh row stable.
  useEffect(() => {
    translateX.value = 0;
    armed.value = false;
  }, [messageId, translateX, armed]);
  const pan = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      translateX.value = Math.max(0, Math.min(e.translationX, 90));
      if (translateX.value >= SWIPE_TRIGGER && !armed.value) {
        armed.value = true;
        runOnJS(swipeThresholdHaptic)();
      } else if (translateX.value < SWIPE_TRIGGER && armed.value) {
        armed.value = false;
      }
    })
    .onEnd(() => {
      if (translateX.value >= SWIPE_TRIGGER) runOnJS(onSwipeReply)();
      armed.value = false;
      // A plain timing snap-back, not a spring — a spring here visibly overshoots
      // past 0 and "bounces", which reads as the row dancing after release.
      translateX.value = withTiming(0, { duration: 150 });
    });
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  // Opacity only — no scale. A scaling arrow on top of the row's own translateX
  // is a second, independent animation racing the drag, which read as "dancing".
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_TRIGGER], [0, 1], Extrapolation.CLAMP),
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

type AlbumRef = { albumId: string; ownerId: string; title: string };

/** decodeURIComponent that tolerates a malformed `%` sequence instead of throwing. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/**
 * Recognize an album share inside a message's `content`, in either of the two
 * shapes an album can reach a chat as:
 *
 *   1. `📁 albumId|ownerId|title`  — sent by ShareAlbumSheet / the in-chat album
 *      picker (the structured-content convention also used for locations).
 *   2. An album deep link — `nearme://albums/<id>?ownerId=…&title=…` (or the
 *      `exp://…/--/albums/…` dev-build form) — what "Copy link" puts on the
 *      clipboard, so a pasted or externally-shared link renders as a card too
 *      instead of falling through to the plain-text renderer.
 *
 * Returns null for anything else. Album privacy is unaffected: the card only
 * carries ids, and opening it re-checks access server-side.
 */
function parseAlbumRef(content: string | null | undefined): AlbumRef | null {
  if (!content) return null;
  const text = content.trim();

  if (text.startsWith('📁 ') && text.includes('|')) {
    const [albumId, ownerId, ...titleParts] = text.slice(2).trim().split('|');
    if (albumId && ownerId) return { albumId, ownerId, title: titleParts.join('|') || 'Album' };
    return null;
  }

  // A bare deep link only — never a link embedded in a longer sentence.
  const link = /^[a-z][a-z0-9+.-]*:\/\/\S*?albums\/([^/?#\s]+)(\?\S*)?$/i.exec(text);
  if (!link) return null;
  const albumId = safeDecode(link[1]);
  // Parsed by hand rather than with URLSearchParams — Hermes/RN ships an
  // incomplete polyfill whose behaviour varies by version.
  const params: Record<string, string> = {};
  for (const pair of (link[2]?.slice(1) ?? '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = safeDecode(eq === -1 ? pair : pair.slice(0, eq));
    params[key] = eq === -1 ? '' : safeDecode(pair.slice(eq + 1));
  }
  const ownerId = params.ownerId;
  if (!albumId || !ownerId) return null;
  return { albumId, ownerId, title: params.title || 'Album' };
}

type ChatMessageRowProps = {
  item: Message;
  mine: boolean;
  meId: string | undefined;
  peerName: string | undefined;
  highlight: boolean;
  /** Active search query while navigating matches — highlights it in the text. */
  searchTerm: string | undefined;
  translation: string | undefined;
  showDisappearing: boolean;
  canReadReceipts: boolean;
  onLongPress: (item: Message, pageY?: number) => void;
  onSwipeReply: (item: Message) => void;
  onReact: (item: Message, emoji: string) => void;
  onReactionLongPress: (messageId: string) => void;
  /** Opens the viewer; `layout` is the tapped thumbnail's rect for the zoom. */
  onImagePress: (url: string, layout?: ThumbnailLayout) => void;
  /** Opens an album shared via chat (album card bubbles only). */
  onAlbumPress: (albumId: string, ownerId: string, title: string) => void;
  /** Open the in-app player for a video message (never a browser). */
  onVideoPress: (url: string, layout?: ThumbnailLayout) => void;
  onViewOncePress: (item: Message) => void;
  onRetry: (item: Message) => void;
  onTap: (item: Message) => void;
  onReplyPress: (messageId: string) => void;
  isSelecting: boolean;
  isSelected: boolean;
  /** This bubble is the open context menu's target — lifts it above the blur. */
  isMenuTarget: boolean;
  /** Resolved preview of the replied-to message (thumbnail / voice / text). */
  replyPreview: QuotePreview | null;
};

/**
 * Memoized 1:1 chat message row (mirrors the group-chat MessageBubble pattern).
 * The comparator below only re-renders a row when THIS message's rendered fields
 * change — so a typing event, a peer's read receipt on a different message, or a
 * reaction on another bubble never re-renders unrelated rows. Callback props are
 * intentionally excluded from the comparator (they may be re-created upstream but
 * don't affect this row's output), exactly as the rooms MessageBubble does.
 */
function ChatMessageRowBase({
  item,
  mine,
  meId,
  peerName,
  highlight,
  searchTerm,
  translation,
  showDisappearing,
  canReadReceipts,
  onLongPress,
  onSwipeReply,
  onReact,
  onReactionLongPress,
  onImagePress,
  onAlbumPress,
  onVideoPress,
  onViewOncePress,
  onRetry,
  onTap,
  onReplyPress,
  isSelecting,
  isSelected,
  isMenuTarget,
  replyPreview,
}: ChatMessageRowProps) {
  const { theme } = useTheme();

  // Measured at tap time so the MediaViewer can zoom out of this exact tile.
  const photoRef = useRef<View>(null);

  const renderBody = () => {
    if (item.isUnsent) {
      const removedColor = mine ? theme.textInverse : theme.textTertiary;
      return (
        <View style={styles.removedRow}>
          <Ionicons name="ban-outline" size={14} color={removedColor} />
          <Text style={[styles.removed, { color: removedColor }]}>This message was deleted</Text>
        </View>
      );
    }

    if (isViewOnce(item)) {
      const opened = !!item.viewedAt && !mine;
      const thumb = item.mediaUrls[0] ?? item.mediaUrl;
      return (
        <Pressable
          onPress={() => onViewOncePress(item)}
          onLongPress={(e) => onLongPress(item, e.nativeEvent.pageY)}
          delayLongPress={220}
          disabled={opened && !mine}
        >
          <View style={[styles.snapTile, opened && !mine && styles.snapOpened]}>
            {thumb && mine ? (
              <RemoteImage source={{ uri: thumb }} style={styles.snapImage} contentFit="cover" transition={120} />
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
      // Album share card: a photo message whose content is '📁 albumId|ownerId|title'.
      const albumRef = parseAlbumRef(item.content);
      if (albumRef) {
        const { albumId, ownerId: albumOwnerId, title: albumTitle } = albumRef;
        return (
          <Pressable
            onPress={() => onAlbumPress(albumId, albumOwnerId, albumTitle)}
            onLongPress={(e) => onLongPress(item, e.nativeEvent.pageY)}
            delayLongPress={220}
          >
            <View style={styles.photoStack}>
              <RemoteImage source={{ uri: item.mediaUrls[0] }} style={styles.chatPhoto} contentFit="cover" transition={120} />
              <View style={styles.albumBadge}>
                <Ionicons name="folder" size={13} color="#fff" />
              </View>
              <Text style={[styles.albumCaption, mine ? styles.textMe : { color: theme.textPrimary }]}>
                📁 {albumTitle}
              </Text>
            </View>
          </Pressable>
        );
      }
      return (
        <Pressable
          onPress={() =>
            measureThumbnail(photoRef, (layout) =>
              onImagePress(item.mediaUrls[0] ?? item.mediaUrl ?? '', layout),
            )
          }
          onLongPress={(e) => onLongPress(item, e.nativeEvent.pageY)}
          delayLongPress={220}
        >
          {/* collapsable={false} keeps the node measurable on Android. */}
          <View ref={photoRef} collapsable={false} style={styles.photoStack}>
            <RemoteImage source={{ uri: item.mediaUrls[0] }} style={styles.chatPhoto} contentFit="cover" transition={120} />
            {item.mediaUrls.length > 1 && (
              <View style={styles.multiBadge}>
                <Text style={styles.multiBadgeText}>+{item.mediaUrls.length - 1}</Text>
              </View>
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
      const videoUrl = item.mediaUrls[0] ?? item.mediaUrl;
      return (
        <VideoBubble
          thumbnailUrl={item.thumbnailUrl}
          duration={item.duration}
          stableId={`video-thumb-${item.id}`}
          onPress={(layout) => videoUrl && onVideoPress(videoUrl, layout)}
          onLongPress={(pageY) => onLongPress(item, pageY)}
        />
      );
    }

    if (item.type === 'voice' || item.type === 'voice_note') {
      const voiceUrl = item.mediaUrls[0] ?? item.mediaUrl;
      if (voiceUrl) {
        return <AudioPlayer mediaUrl={voiceUrl} isOwn={mine} waveformSource={item.caption} duration={item.duration} />;
      }
      return (
        <View style={styles.mediaChip}>
          <Ionicons name="mic" size={16} color={mine ? theme.textInverse : theme.textPrimary} />
          <Text style={mine ? styles.textMe : { color: theme.textPrimary }}>Voice message</Text>
        </View>
      );
    }

    // Album share card (no cover photo): a text message carrying either the
    // structured '📁 albumId|ownerId|title' content — the same convention as the
    // photo-type album card above, for albums shared without a cover image —
    // or a bare album deep link (a pasted / externally shared "Copy link").
    if (item.type === 'text') {
      const albumRef = parseAlbumRef(item.content);
      if (albumRef) {
        const { albumId, ownerId: albumOwnerId, title: albumTitle } = albumRef;
        const fg = mine ? theme.textInverse : theme.textPrimary;
        const sub = mine ? 'rgba(255,255,255,0.8)' : theme.textTertiary;
        return (
          <Pressable
            style={styles.locationCard}
            onPress={() => onAlbumPress(albumId, albumOwnerId, albumTitle)}
            onLongPress={(e) => onLongPress(item, e.nativeEvent.pageY)}
            delayLongPress={220}
          >
            <View style={[styles.locationPin, { backgroundColor: mine ? 'rgba(255,255,255,0.15)' : theme.backgroundTertiary }]}>
              <Ionicons name="folder" size={32} color={mine ? '#fff' : theme.brand} />
            </View>
            <View style={styles.locationInfo}>
              <Text style={[styles.fileName, { color: fg }]} numberOfLines={1}>{albumTitle}</Text>
              <Text style={[styles.fileSub, { color: sub }]}>Tap to view album</Text>
            </View>
          </Pressable>
        );
      }
    }

    // Location card: a text message with structured content '📍 label|lat|lng'.
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
          onLongPress={(e) => onLongPress(item, e.nativeEvent.pageY)}
          delayLongPress={220}
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
        <Pressable
          style={styles.fileCard}
          onPress={() => fileUrl && Linking.openURL(fileUrl).catch(() => {})}
          onLongPress={(e) => onLongPress(item, e.nativeEvent.pageY)}
          delayLongPress={220}
        >
          <Ionicons name="document-text" size={22} color={mine ? theme.textInverse : theme.brand} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.fileName, { color: fg }]} numberOfLines={1}>{label}</Text>
            <Text style={[styles.fileSub, { color: sub }]}>Tap to open</Text>
          </View>
          <Ionicons name="download-outline" size={20} color={fg} />
        </Pressable>
      );
    }

    const baseTextStyle = mine ? styles.textMe : { color: theme.textPrimary, fontSize: FontSize.md, fontFamily: FontFamily.regular };

    // In-bubble search highlight: wrap every occurrence of the active query in
    // a brand-tinted segment (white-tinted on the gradient bubble).
    const q = searchTerm?.trim().toLowerCase();
    if (q && item.content && item.content.toLowerCase().includes(q)) {
      const content = item.content;
      const lower = content.toLowerCase();
      const segs: React.ReactNode[] = [];
      let i = 0;
      let k = 0;
      while (i <= content.length) {
        const idx = lower.indexOf(q, i);
        if (idx < 0) {
          segs.push(content.slice(i));
          break;
        }
        if (idx > i) segs.push(content.slice(i, idx));
        segs.push(
          <Text
            key={`h${k++}`}
            style={{
              backgroundColor: mine ? 'rgba(255,255,255,0.35)' : theme.brand + '30',
              color: mine ? '#fff' : theme.brand,
            }}
          >
            {content.slice(idx, idx + q.length)}
          </Text>,
        );
        i = idx + q.length;
      }
      return <Text style={baseTextStyle}>{segs}</Text>;
    }

    // Tappable links (skipped for location/file cards — those returned above),
    // plus a rich preview card for the FIRST url. A message that is nothing but
    // a url is a deliberate link share — WhatsApp lets it speak for itself.
    if (item.content && hasUrl(item.content)) {
      const previewUrl = isBareUrl(item.content) ? null : firstUrl(item.content);
      return (
        <View>
          <Text style={baseTextStyle}>
            {linkifyText(
              item.content,
              baseTextStyle,
              mine
                ? { color: '#fff', textDecorationLine: 'underline' }
                : { color: theme.info, textDecorationLine: 'underline' },
            )}
          </Text>
          {previewUrl ? <LinkPreview url={previewUrl} isOwn={mine} /> : null}
        </View>
      );
    }

    return <Text style={baseTextStyle}>{item.content}</Text>;
  };

  const body = renderBody();

  // Bare media (photo or video with no album caption) renders edge-to-edge with
  // its meta below, rather than padded inside a gradient/received bubble.
  const mediaOnly =
    !item.isUnsent &&
    !isViewOnce(item) &&
    (item.type === 'photo' || item.type === 'video') &&
    (item.mediaUrls.length > 0 || !!item.mediaUrl) &&
    !parseAlbumRef(item.content);

  const preview: QuotePreview = replyPreview ?? { kind: 'text', label: item.replyTo?.content ?? '' };
  const quoteAccent = mine ? '#fff' : theme.brand;
  const quote = item.replyTo ? (
    <Pressable onPress={() => item.replyTo && onReplyPress(item.replyTo.id)}>
      <View
        style={[
          styles.quote,
          {
            backgroundColor: mine ? 'rgba(255,255,255,0.15)' : theme.backgroundTertiary,
            borderLeftColor: quoteAccent,
          },
        ]}
      >
        <View style={styles.quoteBody}>
          <Text style={[styles.quoteName, { color: quoteAccent }]} numberOfLines={1}>
            {item.replyTo.senderId === meId ? 'You' : peerName || 'Someone'}
          </Text>
          {preview.kind === 'voice' ? (
            <View style={styles.quoteMediaRow}>
              <Ionicons name="mic" size={13} color={quoteAccent} />
              <Text style={[styles.quoteText, { color: mine ? '#ffffffcc' : theme.textSecondary }]} numberOfLines={1}>
                {preview.label}
              </Text>
            </View>
          ) : (
            <Text style={[styles.quoteText, { color: mine ? '#ffffffcc' : theme.textSecondary }]} numberOfLines={1}>
              {preview.label}
            </Text>
          )}
        </View>
        {/* Photo replies show the actual image, not the words "📷 Photo". */}
        {preview.kind === 'image' && preview.thumbUrl ? (
          <RemoteImage
            source={{ uri: preview.thumbUrl }}
            stableId={`quote-${item.replyTo.id}`}
            style={styles.quoteThumb}
            contentFit="cover"
            transition={120}
          />
        ) : null}
      </View>
    </Pressable>
  ) : null;

  const highlightStyle = highlight ? { borderWidth: 1.5, borderColor: theme.brandSecondary } : null;

  const translationNode =
    translation && !item.isUnsent ? (
      <Text
        style={[
          styles.translated,
          { color: mine ? 'rgba(255,255,255,0.85)' : theme.textTertiary, borderTopColor: mine ? 'rgba(255,255,255,0.25)' : theme.border },
        ]}
      >
        {translation}
      </Text>
    ) : null;

  // WhatsApp-style meta: rendered INSIDE the bubble (bottom-right) for text
  // bubbles, below it for media-only bubbles. Colors adapt to the gradient.
  const metaOnGradient = mine && !mediaOnly;
  const metaMuted = metaOnGradient ? 'rgba(255,255,255,0.7)' : theme.textTertiary;
  const metaNode = (
    <View style={[styles.metaRow, mediaOnly ? null : styles.metaInBubble]}>
      {item.isStarred && !item.isUnsent && (
        <Ionicons name="star" size={11} color={metaOnGradient ? '#fff' : theme.brand} style={{ marginRight: 4 }} />
      )}
      <Text style={[styles.time, { color: metaMuted }]}>{clockTime(item.createdAt)}</Text>
      {showDisappearing && !item.isUnsent && (
        <Ionicons name="time-outline" size={12} color={metaMuted} style={{ marginLeft: 3 }} />
      )}
      {item.isEdited && !item.isUnsent && (
        <Text style={[styles.time, { color: metaMuted }]}> · edited</Text>
      )}
      {mine && !item.isUnsent && (
        item.isFailed ? (
          <Pressable onPress={() => onRetry(item)} hitSlop={6} style={styles.retryRow}>
            <Ionicons name="alert-circle" size={13} color={metaOnGradient ? '#fff' : theme.error} style={{ marginLeft: 3 }} />
            <Text style={[styles.retryText, { color: metaOnGradient ? '#fff' : theme.error }]}>Tap to retry</Text>
          </Pressable>
        ) : (
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
            mutedColor={metaOnGradient ? 'rgba(255,255,255,0.8)' : undefined}
          />
        )
      )}
    </View>
  );

  const rowContent = (
    <View style={styles.liftLayer}>
    <SwipeToReply messageId={item.id} onSwipeReply={() => onSwipeReply(item)}>
      <Pressable
        style={[styles.bubbleRow, mine ? styles.right : styles.left, isSelecting && !isSelected ? { opacity: 0.6 } : null]}
        onLongPress={(e) => onLongPress(item, e.nativeEvent.pageY)}
        onPress={() => onTap(item)}
      >
        {item.isForwarded && !item.isUnsent && (
          <View style={[styles.forwardedRow, mine ? { justifyContent: 'flex-end' } : null]}>
            <Ionicons name="arrow-redo-outline" size={14} color={theme.textTertiary} />
            <Text style={[styles.forwardedText, { color: theme.textTertiary }]}>Forwarded</Text>
          </View>
        )}
        {mediaOnly ? (
          <View style={[styles.mediaBubble, highlightStyle]}>{body}</View>
        ) : mine ? (
          <LinearGradient colors={theme.gradientWarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, isViewOnce(item) ? styles.snapBubble : null, { borderBottomRightRadius: 4 }, highlightStyle]}>
            {quote}
            {body}
            {translationNode}
            {metaNode}
          </LinearGradient>
        ) : (
          <View style={[styles.bubble, isViewOnce(item) ? styles.snapBubble : null, { backgroundColor: theme.receivedBubble, borderWidth: 0.5, borderColor: theme.receivedBubbleBorder, borderBottomLeftRadius: 4 }, highlightStyle]}>
            {quote}
            {body}
            {translationNode}
            {metaNode}
          </View>
        )}
        {mediaOnly ? metaNode : null}
        {item.reactions.length > 0 && (
          <View style={[styles.reactionsRow, mine ? { justifyContent: 'flex-end' } : null]}>
            {item.reactions.map((r) => (
              <ReactionPill
                key={r.emoji}
                emoji={r.emoji}
                count={r.count}
                userReacted={r.userReacted}
                onPress={() => onReact(item, r.emoji)}
                onLongPress={() => onReactionLongPress(item.id)}
              />
            ))}
          </View>
        )}
      </Pressable>
    </SwipeToReply>
    </View>
  );

  // Only newly appended rows animate in (optimistic `tmp-` bubble, or a message
  // created within the last 500ms) — never old messages scrolling into view (F31).
  const isNew = item.id.startsWith('tmp-') || Date.now() - new Date(item.createdAt).getTime() < 500;

  const node = !isSelecting ? (
    rowContent
  ) : (
    <View style={[styles.selectRow, mine ? { flexDirection: 'row-reverse' } : null]}>
      <View
        style={[
          styles.selectCheckbox,
          {
            borderColor: isSelected ? theme.brand : theme.border,
            backgroundColor: isSelected ? theme.brand : 'transparent',
          },
        ]}
      >
        {isSelected ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
      </View>
      <View style={{ flex: 1 }}>{rowContent}</View>
    </View>
  );

  return isNew ? <Animated.View entering={FadeInDown.duration(200)}>{node}</Animated.View> : node;
}

const ChatMessageRow = memo(ChatMessageRowBase, (prev, next) => {
  const a = prev.item;
  const b = next.item;
  return (
    a.id === b.id &&
    a.content === b.content &&
    a.caption === b.caption &&
    a.type === b.type &&
    a.isUnsent === b.isUnsent &&
    a.isPinned === b.isPinned &&
    a.isStarred === b.isStarred &&
    a.isEdited === b.isEdited &&
    a.isForwarded === b.isForwarded &&
    a.mediaUrl === b.mediaUrl &&
    a.mediaUrls === b.mediaUrls &&
    a.viewOnce === b.viewOnce &&
    a.viewedAt === b.viewedAt &&
    a.deliveredAt === b.deliveredAt &&
    a.readAt === b.readAt &&
    a.isFailed === b.isFailed &&
    a.reactions === b.reactions &&
    a.replyTo === b.replyTo &&
    prev.mine === next.mine &&
    prev.meId === next.meId &&
    prev.peerName === next.peerName &&
    prev.highlight === next.highlight &&
    prev.searchTerm === next.searchTerm &&
    prev.translation === next.translation &&
    prev.showDisappearing === next.showDisappearing &&
    prev.canReadReceipts === next.canReadReceipts &&
    prev.isSelecting === next.isSelecting &&
    prev.isSelected === next.isSelected &&
    prev.isMenuTarget === next.isMenuTarget &&
    prev.replyPreview?.kind === next.replyPreview?.kind &&
    prev.replyPreview?.thumbUrl === next.replyPreview?.thumbUrl &&
    prev.replyPreview?.label === next.replyPreview?.label
  );
});

export default function Chat() {
  const params = useLocalSearchParams<{ id: string; peerName?: string; peerPhoto?: string }>();
  const conversationId = Array.isArray(params.id) ? params.id[0] : params.id ?? '';
  const peerName = Array.isArray(params.peerName) ? params.peerName[0] : params.peerName;
  const peerPhoto = Array.isArray(params.peerPhoto) ? params.peerPhoto[0] : params.peerPhoto;
  const router = useRouter();
  const { theme } = useTheme();
  const { alertConfig, hideAlert, alertError, confirm, showAlert } = useAlert();
  const me = useAuthStore((s) => s.user);
  const markRead = useChatStore((s) => s.markRead);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const canReadReceipts = planAtLeast(me?.plan, 'premium');
  const canUnsendAnytime = planAtLeast(me?.plan, 'gold');
  const canUnsend = planAtLeast(me?.plan, 'premium');
  const canEdit = planAtLeast(me?.plan, 'gold');
  const canUseTemplates = (me?.effectiveLimits?.messageTemplates ?? 0) > 0;
  const EDIT_WINDOW_MS = 5 * 60 * 1000;
  const listRef = useRef<FlashListRef<ChatRow>>(null);
  // When jumping to a pinned/search result, block the content-size auto-scroll so
  // the list doesn't snap back to the bottom (the highlight border resizes the row,
  // which would otherwise fire onContentSizeChange → scrollToEnd).
  const suppressAutoScroll = useRef(false);
  // Auto-scroll is driven by message ARRIVAL, not by content-size changes.
  // `nearBottomRef` tracks whether the user is parked at the bottom; the effect
  // below scrolls only when a genuinely new message is appended (mine, or a
  // peer's while I'm at the bottom). Layout changes — highlight border, reaction
  // pills, image loads, the pinned banner — never append, so they never scroll.
  const nearBottomRef = useRef(true);
  const prevLastIdRef = useRef<string | null>(null);
  const prevLenRef = useRef(0);

  const [messages, setMessages] = useState<Message[]>([]);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  // Peer's own availability toggles (default true until loaded — never over-disable).
  const [peerAudioAvailable, setPeerAudioAvailable] = useState(true);
  const [peerVideoAvailable, setPeerVideoAvailable] = useState(true);
  // Presence for the header subtitle ("Online" / "last seen …"), from the same
  // getPublicProfile call that loads call availability.
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerLastSeen, setPeerLastSeen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  // ISO createdAt of the oldest loaded message — the `before` cursor for the
  // next older page. A ref (not state) so the scroll handler always reads the
  // latest value without re-subscribing.
  const oldestCursor = useRef<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const [banner, setBanner] = useState<string | null>(null);
  // AI Icebreakers (Platinum, opt-in) — shown in the empty-conversation state only.
  const [icebreakers, setIcebreakers] = useState<string[]>([]);
  const icebreakersFetchedForRef = useRef<string | null>(null);
  // Floating scroll-to-bottom pill (F26): visible when the user has scrolled up
  // away from the newest message; `unseenCount` counts peer messages that
  // arrived while scrolled up.
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
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
  // Rect of the thumbnail the viewer was opened from — drives the zoom
  // transition. null when the tap couldn't be measured (falls back to a fade).
  const [thumbnailLayout, setThumbnailLayout] = useState<ThumbnailLayout | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  // Y position (pageY) of the long-pressed bubble — anchors the context menu
  // near the message instead of centering it on screen.
  const [menuY, setMenuY] = useState(0);
  // The menu drives its own entry AND exit (the Modal is animationType="none").
  // Opacity ONLY — no spring, no scale. A spring scale-in overshoots past 1, which
  // reads as the popup jumping/bouncing; a plain cross-fade just appears.
  const menuOpacity = useSharedValue(0);
  const menuOverlayStyle = useAnimatedStyle(() => ({ opacity: menuOpacity.value }));

  /** Fade out, then unmount the message once the exit finishes. */
  const dismissMenu = useCallback(() => {
    menuOpacity.value = withTiming(0, { duration: 120 }, (finished) => {
      if (finished) runOnJS(setMenuMessage)(null);
    });
  }, [menuOpacity]);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Index into `matchIds` of the match currently navigated to (WhatsApp-style
  // "3 of 12" up/down navigation). null = still browsing the results panel.
  const [searchNav, setSearchNav] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pinnedDismissed, setPinnedDismissed] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<Record<string, boolean>>({});
  const [reactionDetailsFor, setReactionDetailsFor] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [disappearing, setDisappearing] = useState<'24h' | '7d' | '90d' | null>(null);
  const [disappearingOpen, setDisappearingOpen] = useState(false);
  const [e2eInfoOpen, setE2eInfoOpen] = useState(false);
  const [lockConfig, setLockConfig] = useState<LockConfig | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [lockSetupOpen, setLockSetupOpen] = useState(false);
  const [infoMessage, setInfoMessage] = useState<Message | null>(null);
  const [forwardMessages, setForwardMessages] = useState<Message[] | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const isSelecting = selectedMessageIds.size > 0;
  // Drives the selection bar's star icon: filled once every selected message is
  // already starred, because tapping it then unstars them.
  const allSelectedStarred =
    isSelecting && messages.filter((m) => selectedMessageIds.has(m.id)).every((m) => m.isStarred);

  const rows = useMemo(() => buildRows(messages, me?.id), [messages, me?.id]);
  // FlashList data: newest-first (mirrors rooms/[id].tsx). The list itself and
  // each row are flipped with a scaleY transform (FlashList v2 has no `inverted`
  // prop) — index 0 renders visually at the bottom, so opening the chat is
  // bottom-anchored for free with no scrollToEnd anchoring hacks.
  const invertedRows = useMemo(() => [...rows].reverse(), [rows]);

  // Event-driven auto-scroll. Runs on every messages change but only scrolls on a
  // real append: a new appended message scrolls only if it's mine or I'm already
  // near the bottom. Prepends (older pages) and non-length changes (edits,
  // reactions, unsend, highlight, pin) are deliberately ignored — that is what
  // used to yank the view back after a jump. The initial load needs no anchor —
  // the inverted list already starts at offset 0 (the newest message).
  useEffect(() => {
    if (loading) return;
    const last = messages[messages.length - 1] ?? null;
    const change = classifyMessagesChange(prevLastIdRef.current, prevLenRef.current, last?.id ?? null, messages.length);
    prevLastIdRef.current = last?.id ?? null;
    prevLenRef.current = messages.length;
    if (!last) return;
    if (change === 'initial') return;
    if (change !== 'appended') return;
    if (suppressAutoScroll.current) return;
    const mine = last.senderId === me?.id;
    if (shouldAutoScrollOnAppend(mine, nearBottomRef.current)) {
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
      setUnseenCount(0);
    } else if (!mine) {
      // A peer message arrived while the user is reading history — surface it on
      // the scroll-to-bottom pill instead of yanking the view.
      setUnseenCount((c) => c + 1);
    }
  }, [messages, loading, me?.id]);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setUnseenCount(0);
    setShowScrollDown(false);
    markRead(conversationId);
    markConversationRead(conversationId).catch(() => {});
  }, [conversationId, markRead]);

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

  // IDs of messages matching the search query, in chronological order.
  const matchIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as string[];
    return messages.filter((m) => !m.isUnsent && m.content?.toLowerCase().includes(q)).map((m) => m.id);
  }, [messages, searchQuery]);

  const scrollAndHighlight = useCallback(
    (id: string) => {
      // `invertedRows` is the array actually handed to FlashList as `data` — its
      // index for a given message is already correct for the inverted list (the
      // newest message sits at index 0), so no reversal is needed here.
      const rowIndex = invertedRows.findIndex((r) => r.kind === 'message' && r.message.id === id);
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
    [invertedRows],
  );

  // Navigate to a specific match while KEEPING the search bar open (up/down
  // arrows + tapping a result). The chat list may be freshly re-mounted (the
  // results panel was covering it), so give it a beat to lay out first.
  const scrollToMatch = useCallback(
    (idx: number) => {
      const id = matchIds[idx];
      if (!id) return;
      const wasBrowsing = searchNav == null;
      setSearchNav(idx);
      setTimeout(() => scrollAndHighlight(id), wasBrowsing ? 350 : 50);
    },
    [matchIds, searchNav, scrollAndHighlight],
  );

  const jumpToMessage = useCallback(
    (id: string) => {
      if (searchOpen) {
        const matchIdx = matchIds.indexOf(id);
        if (matchIdx >= 0) {
          scrollToMatch(matchIdx);
          return;
        }
      }
      const wasSearching = searchOpen;
      setSearchOpen(false);
      setSearchQuery('');
      setSearchNav(null);
      if (wasSearching) setTimeout(() => scrollAndHighlight(id), 350);
      else scrollAndHighlight(id);
    },
    [searchOpen, matchIds, scrollToMatch, scrollAndHighlight],
  );

  // Flat list of every shareable photo AND video in the conversation (album/
  // multi-photo messages contribute each url) for the full-screen MediaViewer,
  // in chronological order so swiping moves through the thread's media. View-once
  // and unsent messages are excluded — they have their own consume-once flow.
  const viewerImages = useMemo<MediaViewerImage[]>(() => {
    const out: MediaViewerImage[] = [];
    messages.forEach((m) => {
      if (m.isUnsent || isViewOnce(m)) return;
      if (m.type !== 'photo' && m.type !== 'video') return;
      const urls = m.mediaUrls.length ? m.mediaUrls : m.mediaUrl ? [m.mediaUrl] : [];
      urls.forEach((uri) => {
        if (!uri) return;
        out.push({
          uri,
          senderId: m.senderId,
          senderName: m.senderId === me?.id ? 'You' : peerName || 'Someone',
          createdAt: m.createdAt,
          kind: m.type === 'video' ? 'video' : 'image',
        });
      });
    });
    return out;
  }, [messages, me?.id, peerName]);

  /**
   * Open the full-screen viewer at a given media url (photo or video).
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

  /** Opens an album shared via chat (📁 albumId|ownerId|title). Privacy is re-checked server-side on open. */
  const openAlbum = useCallback(
    (albumId: string, ownerId: string, title: string) => {
      router.push({ pathname: '/albums/[id]', params: { id: albumId, ownerId, title } });
    },
    [router],
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
    setIcebreakers([]);
    icebreakersFetchedForRef.current = null;
    oldestCursor.current = null;
    nearBottomRef.current = true;
    prevLastIdRef.current = null;
    prevLenRef.current = 0;
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
              setPeerOnline(p.isOnline ?? p.activity?.online ?? false);
              setPeerLastSeen(p.lastActiveAt ?? null);
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

  // AI Icebreakers (Platinum, opt-in) — fetch once per conversation, only while
  // it's genuinely empty (no meaningful messages yet). Fails silently: this is a
  // passive suggestion, not a user-initiated action, so a free/non-opted-in user
  // just sees the plain empty state, with no toast or upgrade prompt.
  useEffect(() => {
    if (loading || !conversationId || messages.length > 0) return;
    if (icebreakersFetchedForRef.current === conversationId) return;
    icebreakersFetchedForRef.current = conversationId;
    let active = true;
    getIcebreakers(conversationId)
      .then((res) => {
        if (active) setIcebreakers(Array.isArray(res.suggestions) ? res.suggestions.slice(0, 3) : []);
      })
      .catch(() => {
        if (active) setIcebreakers([]);
      });
    return () => { active = false; };
  }, [loading, conversationId, messages.length]);

  // Client-side disappearing-messages enforcement: the backend already excludes
  // expired messages from listMessages, but a message that ages past the window
  // while THIS screen is open (loaded before it expired) stays in local state
  // until something clears it. Sweep every 60s and drop any that have expired.
  useEffect(() => {
    if (!disappearing) return;
    const windowMs = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '90d': 90 * 24 * 60 * 60 * 1000 }[disappearing];
    const interval = setInterval(() => {
      const now = Date.now();
      setMessages((prev) =>
        prev.filter((m) => m.senderId === me?.id || now - new Date(m.createdAt).getTime() < windowMs),
      );
    }, 60_000);
    return () => clearInterval(interval);
  }, [disappearing, me?.id]);

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

  // Scroll to the visual top → load the previous page of older messages and
  // PREPEND them to the chronological `messages` array (which lands them at the
  // END of the inverted list, i.e. above the current view). FlashList's own
  // maintainVisibleContentPosition keeps the current messages visually anchored
  // so the view doesn't jump.
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

  // Optimistic text send: insert a `tmp-` bubble immediately (renders tick
  // 'sending'), then reconcile with the server — replace on success, mark
  // isFailed (→ "Tap to retry" affordance) on a generic/network error, or drop
  // the bubble + surface the gate on a moderation/limit rejection. No timers:
  // the bubble is queued on the same tick as the tap.
  const sendTextOptimistic = useCallback(
    async (content: string, replyToId?: string, retryId?: string) => {
      if (!conversationId) return;
      const tempId = retryId ?? `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (retryId) {
        setMessages((prev) => prev.map((m) => (m.id === retryId ? { ...m, isFailed: false } : m)));
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: tempId,
            conversationId,
            senderId: me?.id ?? '',
            type: 'text',
            ciphertext: null,
            content,
            caption: null,
            mediaUrls: [],
            mediaUrl: null,
            viewOnce: false,
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
            isFailed: false,
            createdAt: new Date().toISOString(),
          } satisfies Message,
        ]);
      }
      setBanner(null);
      try {
        const res = await sendMessage(conversationId, { type: 'text', content, replyToId });
        const { audioCallEnabled, videoCallEnabled, ...msg } = res;
        // Replace the optimistic entry in place (same list position — no jump).
        setMessages((prev) => prev.map((m) => (m.id === tempId ? (msg as Message) : m)));
        setAudioEnabled(audioCallEnabled);
        setVideoEnabled(videoCallEnabled);
        fetchConversations('inbox', true).catch(() => {});
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 451) {
          setBanner('Your message is under review.');
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
        } else if (err.status === 403 && (err.code === 'interaction_limit_reached' || err.code === 'plan_required')) {
          setUpgradeOpen(true);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
        } else {
          // Message send failed (generic/network) → Error haptic + retry affordance (F50 map).
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, isFailed: true } : m)));
        }
      }
    },
    [conversationId, me?.id, fetchConversations],
  );

  const retryFailedMessage = useCallback(
    (item: Message) => {
      if (!item.content) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      void sendTextOptimistic(item.content, item.replyToId ?? undefined, item.id);
    },
    [sendTextOptimistic],
  );

  // ── ChatComposer send handlers (parent owns API + GCS/R2 upload pipeline) ──
  // Fire-and-forget: the optimistic bubble is already queued inside
  // sendTextOptimistic before its first await, so the composer clears instantly.
  const handleSendText = useCallback(
    async (content: string, replyToId?: string) => {
      void sendTextOptimistic(content, replyToId);
    },
    [sendTextOptimistic],
  );

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

  /**
   * Videos are sent with a client-generated poster frame so the bubble can show
   * a real thumbnail + play button instead of a generic card. The thumbnail is
   * uploaded first; if it fails the video still sends (posterless).
   */
  const handleSendVideo = async (uri: string, replyToId?: string, durationMs?: number | null) => {
    setSending(true);
    setBanner(null);
    try {
      setUploadProgress(0);
      const thumbnailUrl = (await generateAndUploadVideoThumbnail(uri)) ?? undefined;
      const url = await uploadToR2(uri, 'video', 'video/mp4', { onProgress: setUploadProgress });
      const duration = durationMs != null ? Math.max(0, Math.round(durationMs / 1000)) : undefined;
      await postMessage({ type: 'video', content: '', mediaUrls: [url], thumbnailUrl, duration, replyToId });
    } catch (e) {
      setBanner((e as ApiError).message ?? 'Could not send video');
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  };

  const handleSendAudioClip = async (uri: string, durationMs: number, replyToId?: string, amplitudes?: number[]) => {
    setSending(true);
    setBanner(null);
    try {
      setUploadProgress(0);
      const url = await uploadToR2(uri, 'voice_clip', 'audio/mp4', { onProgress: setUploadProgress });
      // `caption` is unused for type='voice' — repurposed to carry the real waveform
      // so playback doesn't have to fake it (see src/lib/audioAmplitude.ts).
      const caption = amplitudes?.length ? JSON.stringify({ amplitudes }) : undefined;
      // Persist the real clip length: the stored waveform is resampled to a fixed
      // bar count, so it can't be recovered from the amplitudes afterwards.
      const duration = Math.max(0, Math.round(durationMs / 1000));
      await postMessage({ type: 'voice', mediaUrls: [url], caption, duration, replyToId });
    } catch (e) {
      setBanner((e as ApiError).message ?? 'Could not send voice message');
    } finally {
      setSending(false);
      setUploadProgress(null);
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

  const confirmUnsend = (item: Message) => {
    dismissMenu();
    confirm(
      'Delete for Everyone?',
      'This message will be deleted for both of you.',
      () => runUnsend(item),
      { destructive: true, confirmLabel: 'Delete for Everyone' },
    );
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enterSelectMode = useCallback((item: Message) => {
    dismissMenu();
    setSelectedMessageIds(new Set([item.id]));
  }, []);

  const clearSelection = useCallback(() => setSelectedMessageIds(new Set()), []);

  const onLongPressMessage = useCallback((item: Message, pageY?: number) => {
    if (item.id.startsWith('tmp-')) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (isSelecting) {
      toggleSelect(item.id);
      return;
    }
    setMenuY(pageY ?? 0);
    // Plain fade up — no scale/spring, so the popup never jumps or bounces.
    menuOpacity.value = 0;
    menuOpacity.value = withTiming(1, { duration: 120 });
    setMenuMessage(item);
  }, [isSelecting, toggleSelect, menuOpacity]);

  const onTapMessage = useCallback((item: Message) => {
    if (!isSelecting || item.id.startsWith('tmp-')) return;
    toggleSelect(item.id);
  }, [isSelecting, toggleSelect]);

  const onSwipeReply = useCallback((item: Message) => {
    if (item.isUnsent || item.id.startsWith('tmp-')) return;
    // Haptic already fired at the 60px threshold crossing (SwipeToReply).
    setEditingMessage(null);
    setReplyTo(item);
  }, []);

  const onReact = useCallback(async (item: Message, emoji: string) => {
    dismissMenu();
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
  }, [conversationId]);

  const copyMessage = async (item: Message) => {
    dismissMenu();
    if (item.content) await Clipboard.setStringAsync(item.content);
  };

  const runDeleteSelf = async (item: Message) => {
    dismissMenu();
    try {
      await deleteMessage(conversationId, item.id);
      setMessages((prev) => prev.filter((m) => m.id !== item.id));
    } catch (e) {
      alertError('Could not delete', (e as ApiError).message ?? 'Please try again.');
    }
  };

  const toggleStar = async (item: Message) => {
    dismissMenu();
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
    dismissMenu();
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

  const openForward = (items: Message[]) => {
    if (!items.length) return;
    const fromMenu = menuMessage != null;
    // Close the context menu SYNCHRONOUSLY (not via the 120ms fade). The forward
    // sheet is itself an RN Modal, and iOS refuses to present a modal while
    // another one is still dismissing — so when we came from the menu, wait for
    // that dismissal before presenting. From the selection bar there is no modal
    // to wait on, so it opens immediately.
    if (fromMenu) {
      menuOpacity.value = 0;
      setMenuMessage(null);
      setTimeout(() => setForwardMessages(items), 250);
      return;
    }
    setForwardMessages(items);
  };

  const runForward = async (targetConversationIds: string[]) => {
    const items = forwardMessages ?? [];
    if (!items.length || !targetConversationIds.length) return;
    try {
      // Oldest → newest, sequentially, so the recipient sees the same order.
      const ordered = [...items].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      for (const item of ordered) {
        await forwardMessage(conversationId, item.id, targetConversationIds);
      }
      setForwardMessages(null);
      clearSelection();
      const chats = `${targetConversationIds.length} chat${targetConversationIds.length > 1 ? 's' : ''}`;
      showSuccess(
        items.length > 1 ? `${items.length} messages forwarded to ${chats}` : `Forwarded to ${chats}`,
      );
    } catch (e) {
      toastApiError(e, 'Could not forward message');
    }
  };

  /**
   * Star/unstar every selected message. Toggles as a group: if all of them are
   * already starred the action unstars them, otherwise it stars the rest — the
   * same semantics as the single-message Star/Unstar action.
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
        (next ? starMessage(id, 'chat') : unstarMessage(id)).then(
          () => true,
          () => false,
        ),
      ),
    );
    const failed = ids.filter((_, i) => !results[i]);
    if (failed.length) {
      // Roll the failed ones back so the UI never claims a state the server rejected.
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
    await Promise.all(ids.map((id) => deleteMessage(conversationId, id).catch(() => {})));
  };

  const batchDeleteForEveryone = async () => {
    const ids = [...selectedMessageIds];
    clearSelection();
    await Promise.all(
      ids.map((id) =>
        unsendMessage(conversationId, id)
          .then(() => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isUnsent: true, content: null } : m))))
          .catch(() => {}),
      ),
    );
  };

  const confirmBatchDelete = () => {
    const count = selectedMessageIds.size;
    showAlert({
      title: 'Delete messages?',
      message: `${count} message${count > 1 ? 's' : ''} selected.`,
      icon: 'trash',
      iconColor: theme.error,
      buttons: [
        { label: 'Cancel', style: 'cancel', onPress: hideAlert },
        { label: 'Delete for Me', style: 'default', onPress: () => { hideAlert(); batchDeleteForMe(); } },
        {
          label: 'Delete for Everyone',
          style: 'destructive',
          onPress: () => { hideAlert(); batchDeleteForEveryone(); },
        },
      ],
    });
  };

  const saveMediaToGallery = async (item: Message) => {
    dismissMenu();
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
    dismissMenu();
    if (translations[item.id]) {
      // Toggle off
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    if (!item.content || translatingIds[item.id]) return;
    setTranslatingIds((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await translateMessage(conversationId, item.id);
      setTranslations((prev) => ({ ...prev, [item.id]: res.text }));
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403 && (err.code === 'plan_required' || err.code === 'interaction_limit_reached')) {
        setUpgradeOpen(true);
      } else {
        alertError('Could not translate', err.message ?? 'Please try again.');
      }
    } finally {
      setTranslatingIds((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const openReportFromMenu = () => {
    dismissMenu();
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
      setUploadProgress(0);
      const key = await uploadChatPhoto(localUri, setUploadProgress);
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
    } finally {
      setUploadProgress(null);
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

  const pickAndSendDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const file = res.assets[0];
    const ext = file.name?.includes('.') ? file.name.split('.').pop() : undefined;
    setSending(true);
    setBanner(null);
    try {
      setUploadProgress(0);
      const url = await uploadToR2(file.uri, 'document', file.mimeType || 'application/octet-stream', { ext, onProgress: setUploadProgress });
      await postMessage({ type: 'text', content: `📄 ${file.name ?? 'Document'}`, mediaUrls: [url] });
    } catch (e) {
      setBanner((e as ApiError).message ?? 'Could not send document');
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  };

  const pickAndSendAudio = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const file = res.assets[0];
    setSending(true);
    setBanner(null);
    try {
      setUploadProgress(0);
      const url = await uploadToR2(file.uri, 'audio', file.mimeType || 'audio/mpeg', { onProgress: setUploadProgress });
      await postMessage({ type: 'text', content: `🎵 ${file.name ?? 'Audio'}`, mediaUrls: [url] });
    } catch (e) {
      setBanner((e as ApiError).message ?? 'Could not send audio');
    } finally {
      setSending(false);
      setUploadProgress(null);
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
        // '📁 albumId|ownerId|title' — same convention ShareAlbumSheet uses so
        // this renders as a tappable album card instead of a plain photo bubble.
        content: `📁 ${album.id}|${me?.id ?? ''}|${album.title}`,
        mediaUrls: paths,
      });
    } catch (e) {
      setBanner((e as ApiError).message ?? 'Could not share album');
    } finally {
      setSending(false);
    }
  };

  const openViewOnce = useCallback(async (item: Message) => {
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
  }, [conversationId, me?.id]);

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

  // Rows are rendered into an INVERTED FlashList (see `invertedRows`): the list
  // carries `scaleY: -1` and every row flips itself back, so within a row the
  // content order and margins read normally. `index` here indexes `invertedRows`
  // (newest-first), so the row visually ABOVE this one is at `index + 1`.
  const renderRow = useCallback(({ item: row, index }: { item: ChatRow; index: number }) => {
    if (row.kind === 'date') {
      return (
        <View style={[styles.invertRow, styles.dateRow]}>
          <Text style={[styles.dateLabel, { color: theme.textTertiary, backgroundColor: theme.surfaceElevated }]}>
            {row.label}
          </Text>
        </View>
      );
    }
    if (row.kind === 'unread_divider') {
      return (
        <View style={[styles.invertRow, styles.unreadDivider]}>
          <View style={[styles.unreadLine, { backgroundColor: theme.brand }]} />
          <Text style={[styles.unreadText, { color: theme.brand }]}>Unread messages</Text>
          <View style={[styles.unreadLine, { backgroundColor: theme.brand }]} />
        </View>
      );
    }
    const item = row.message;
    // WhatsApp grouping: consecutive messages from the same sender sit 2px
    // apart; a sender change (or a divider row above) gets the full 8px gap.
    const prevRow = invertedRows[index + 1];
    const sameSenderAsPrev = prevRow?.kind === 'message' && prevRow.message.senderId === item.senderId;
    return (
      <View style={[styles.invertRow, { marginTop: sameSenderAsPrev ? 2 : 8 }]}>
        <ChatMessageRow
          item={item}
          mine={item.senderId === me?.id}
          meId={me?.id}
          peerName={peerName}
          highlight={highlightId === item.id}
          searchTerm={searchOpen && searchNav != null ? searchQuery.trim() : undefined}
          translation={translations[item.id]}
          showDisappearing={!!disappearing}
          canReadReceipts={canReadReceipts}
          onLongPress={onLongPressMessage}
          onSwipeReply={onSwipeReply}
          onReact={onReact}
          onReactionLongPress={setReactionDetailsFor}
          onImagePress={openMediaViewer}
          onAlbumPress={openAlbum}
          onVideoPress={openMediaViewer}
          onViewOncePress={openViewOnce}
          onRetry={retryFailedMessage}
          onTap={onTapMessage}
          onReplyPress={jumpToMessage}
          isSelecting={isSelecting}
          isSelected={selectedMessageIds.has(item.id)}
          isMenuTarget={menuMessage?.id === item.id}
          replyPreview={item.replyTo ? quotePreviewFor(item.replyTo) : null}
        />
      </View>
    );
  }, [theme, invertedRows, me?.id, peerName, highlightId, searchOpen, searchNav, searchQuery, translations, disappearing, canReadReceipts, onLongPressMessage, onSwipeReply, onReact, openMediaViewer, openViewOnce, retryFailedMessage, onTapMessage, jumpToMessage, isSelecting, selectedMessageIds, menuMessage?.id]);

  const CallButton = ({ type }: { type: 'audio' | 'video' }) => {
    const { enabled, tip } = callState(type);
    const color = enabled ? theme.textPrimary : theme.callDisabled;
    return (
      <Pressable
        onPress={() => startCall(type)}
        onLongPress={() => {
          if (!enabled) {
            setTooltip(tip);
            setTimeout(() => setTooltip(null), 3000);
          }
        }}
        hitSlop={10}
      >
        <Ionicons name={type === 'audio' ? 'call-outline' : 'videocam-outline'} size={22} color={color} />
      </Pressable>
    );
  };

  // Locked-chat gate: show the unlock screen instead of messages until unlocked.
  if (lockConfig?.locked && !unlocked) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => { Keyboard.dismiss(); router.back(); }} hitSlop={12}>
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
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View>
      {isSelecting ? (
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={clearSelection} hitSlop={12}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={[styles.headName, { color: theme.textPrimary, flex: 1 }]}>
            {selectedMessageIds.size} selected
          </Text>
          <Pressable
            onPress={() => openForward(messages.filter((m) => selectedMessageIds.has(m.id)))}
            hitSlop={10}
            style={styles.callBtn}
          >
            <Ionicons name="arrow-redo-outline" size={22} color={theme.textPrimary} />
          </Pressable>
          <Pressable onPress={batchStar} hitSlop={10} style={styles.callBtn}>
            {/* Filled star = every selected message is starred, so the action unstars. */}
            <Ionicons
              name={allSelectedStarred ? 'star' : 'star-outline'}
              size={22}
              color={allSelectedStarred ? theme.brand : theme.textPrimary}
            />
          </Pressable>
          <Pressable onPress={confirmBatchDelete} hitSlop={10} style={styles.callBtn}>
            <Ionicons name="trash-outline" size={22} color={theme.error} />
          </Pressable>
        </View>
      ) : searchOpen ? (
      /* WhatsApp-style in-place search: the header itself becomes the search bar. */
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => {
            setSearchOpen(false);
            setSearchQuery('');
            setSearchNav(null);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <TextInput
          value={searchQuery}
          onChangeText={(t) => {
            setSearchQuery(t);
            setSearchNav(null);
          }}
          placeholder="Search…"
          placeholderTextColor={theme.textTertiary}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={() => {
            if (matchIds.length) scrollToMatch(matchIds.length - 1);
          }}
          style={[styles.searchInput, { color: theme.textPrimary }]}
        />
        {searchQuery.trim().length > 0 ? (
          <Text style={[styles.searchCount, { color: theme.textTertiary }]}>
            {searchNav == null
              ? `${matchIds.length} found`
              : `${matchIds.length - searchNav} of ${matchIds.length}`}
          </Text>
        ) : null}
        <Pressable
          disabled={matchIds.length === 0 || (searchNav != null && searchNav <= 0)}
          onPress={() => scrollToMatch(searchNav == null ? matchIds.length - 1 : searchNav - 1)}
          hitSlop={8}
          style={{ opacity: matchIds.length === 0 || (searchNav != null && searchNav <= 0) ? 0.3 : 1 }}
        >
          <Ionicons name="chevron-up" size={22} color={theme.textPrimary} />
        </Pressable>
        <Pressable
          disabled={searchNav == null || searchNav >= matchIds.length - 1}
          onPress={() => searchNav != null && scrollToMatch(searchNav + 1)}
          hitSlop={8}
          style={{ opacity: searchNav == null || searchNav >= matchIds.length - 1 ? 0.3 : 1 }}
        >
          <Ionicons name="chevron-down" size={22} color={theme.textPrimary} />
        </Pressable>
        {searchQuery.length > 0 ? (
          <Pressable
            onPress={() => {
              setSearchQuery('');
              setSearchNav(null);
            }}
            hitSlop={8}
            style={{ marginRight: 4 }}
          >
            <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
          </Pressable>
        ) : null}
      </View>
      ) : (
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => { Keyboard.dismiss(); router.back(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
          <View>
            {peerPhoto ? (
              <RemoteImage source={{ uri: peerPhoto }} style={styles.headAvatar} contentFit="cover" transition={120} />
            ) : (
              <View style={[styles.headAvatar, { backgroundColor: theme.backgroundTertiary, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={18} color={theme.textTertiary} />
              </View>
            )}
            {peerOnline && (
              <View style={[styles.onlineDot, { backgroundColor: theme.online, borderColor: theme.background }]} />
            )}
          </View>
          <View style={styles.headProfile}>
            <View style={styles.headNameRow}>
              <Text style={[styles.headName, { color: theme.textPrimary }]} numberOfLines={1}>
                {peerName || 'Chat'}
              </Text>
              <Pressable onPress={() => setE2eInfoOpen(true)} hitSlop={6}>
                <Ionicons name="lock-closed" size={11} color={theme.success} />
              </Pressable>
            </View>
            {peerTyping ? (
              <View style={styles.typingRow}>
                <Text style={[styles.headStatus, { color: theme.online }]}>typing</Text>
                <TypingDots color={theme.online} size={4} />
              </View>
            ) : peerOnline ? (
              <Text style={[styles.headStatus, { color: theme.textTertiary }]}>Online</Text>
            ) : peerLastSeen ? (
              <Text style={[styles.headStatus, { color: theme.textTertiary }]} numberOfLines={1}>
                {formatLastSeen(peerLastSeen)}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <View style={styles.headActions}>
          <Pressable
            onPress={() => {
              setSearchOpen(true);
              setSearchQuery('');
              setSearchNav(null);
            }}
            hitSlop={10}
          >
            <Ionicons name="search" size={22} color={theme.textPrimary} />
          </Pressable>
          <CallButton type="audio" />
          <CallButton type="video" />
          <Pressable onPress={() => setHeaderMenuOpen(true)} hitSlop={10}>
            <Ionicons name="ellipsis-vertical" size={20} color={theme.textPrimary} />
          </Pressable>
        </View>
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
      </View>

      {/* F27: `padding` on both platforms (Android `height` was jank-prone).
          keyboardVerticalOffset is 0 here on purpose: RN's KeyboardAvoidingView
          measures its own on-screen Y position via onLayout, which already
          accounts for the header/banner block above it (a normal-flow sibling,
          not an overlay) — adding insets.top + topOffset on top of that
          double-counted the same distance and produced a gap between the
          composer and the keyboard. The list below deliberately does NOT set
          `automaticallyAdjustKeyboardInsets` — that stacked with this KAV and
          double-applied the keyboard inset (the dead-zone/gap bug). */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        {searchOpen && searchNav == null ? (
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
            data={invertedRows}
            style={styles.invertList}
            keyExtractor={(r) => (r.kind === 'message' ? r.message.id : r.id)}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}
            renderItem={renderRow}
            ListEmptyComponent={
              <View style={[styles.invertRow, styles.emptyConversation]}>
                <RemoteImage
                  source={{ uri: peerPhoto }}
                  style={styles.emptyAvatar}
                  stableId={`avatar-${peerId ?? peerName}`}
                />
                <Text style={[styles.emptyName, { color: theme.textPrimary }]}>{peerName || 'them'}</Text>
                <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                  This is the beginning of your conversation.{'\n'}Say hello! 👋
                </Text>
                <AiIcebreakers
                  suggestions={icebreakers}
                  onSelect={(text) => composerRef.current?.insertText(text)}
                />
              </View>
            }
            keyboardShouldPersistTaps="handled"
            // Inverted list: the visual TOP (oldest messages) is the list's END,
            // so onEndReached is what pages in older history.
            onEndReached={() => {
              // Don't paginate while a programmatic jump is in flight — landing
              // near the top would otherwise append a page and shift the list,
              // pulling the view away from the message we just jumped to.
              if (suppressAutoScroll.current) return;
              if (hasMoreOlder && !loadingOlder) loadOlder();
            }}
            onEndReachedThreshold={0.3}
            scrollEventThrottle={64}
            onScroll={(e) => {
              // Inverted list: offset ≈ 0 means the newest message is visible.
              // The auto-scroll effect uses this to decide whether an incoming peer
              // message should scroll into view or stay put (so we never yank a
              // user who has scrolled up to read history).
              const near = e.nativeEvent.contentOffset.y < 200;
              nearBottomRef.current = near;
              // Drive the floating scroll-to-bottom pill (F26).
              setShowScrollDown(!near);
              if (near) setUnseenCount(0);
            }}
            ListFooterComponent={
              loadingOlder ? (
                <View style={styles.invertRow}>
                  <ActivityIndicator color={theme.brand} style={{ marginVertical: 12 }} />
                </View>
              ) : null
            }
          />
        )}

        {!searchOpen && !loading ? (
          <ScrollToBottomButton visible={showScrollDown} count={unseenCount} onPress={scrollToBottom} />
        ) : null}

        {!searchOpen ? (
        <ChatComposer
          ref={composerRef}
          conversationId={conversationId}
          replyTo={
            replyTo
              ? (() => {
                  if (replyTo.isUnsent) {
                    return { id: replyTo.id, senderName: replyTo.senderId === me?.id ? 'yourself' : peerName || 'them', content: 'This message was deleted' };
                  }
                  // Reuse the same preview logic the sent-message quote uses, so the
                  // reply banner shows a real thumbnail/label instead of a generic
                  // "Media" fallback for photos, videos, and voice notes.
                  const preview = quotePreviewFor({ ...replyTo, content: replyTo.content ?? '' });
                  return {
                    id: replyTo.id,
                    senderName: replyTo.senderId === me?.id ? 'yourself' : peerName || 'them',
                    content: preview.label,
                    kind: preview.kind,
                    thumbUrl: preview.thumbUrl,
                  };
                })()
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
          uploadProgress={uploadProgress != null ? Math.round(uploadProgress * 100) : null}
          placeholder="Say something…"
          replySuggestionsMessageCount={messages.length}
          replySuggestionsLastFromMe={messages[messages.length - 1]?.senderId === me?.id}
        />
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
        thumbnailLayout={thumbnailLayout}
        onClose={() => setMediaViewerOpen(false)}
      />
      {(() => {
        if (!menuMessage) return null;
        const item = menuMessage;
        const mine = item.senderId === me?.id;
        const withinEditWindow = Date.now() - new Date(item.createdAt).getTime() < EDIT_WINDOW_MS;
        const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
        const isImage = !item.isUnsent && !isViewOnce(item) && item.type === 'photo' && item.mediaUrls.length > 0;
        // Documents/audio files ride on a `text` message carrying a file url with an
        // emoji-prefixed caption (see renderBody above) — they're not plain text, so
        // Copy/Edit/Translate must not treat them as such.
        const isFileCard = item.type === 'text' && !!item.mediaUrls?.length && (item.content?.startsWith('📄') || item.content?.startsWith('🎵'));
        const isPlainText = item.type === 'text' && !isFileCard;
        const actions: { key: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; destructive?: boolean }[] = [
          { key: 'reply', label: 'Reply', icon: 'arrow-undo-outline', onPress: () => { onSwipeReply(item); dismissMenu(); } },
        ];
        if (!item.isUnsent && isPlainText && item.content) {
          actions.push({ key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: () => copyMessage(item) });
        }
        if (!item.isUnsent) {
          actions.push({ key: 'forward', label: 'Forward', icon: 'arrow-redo-outline', onPress: () => openForward([item]) });
        }
        if (!item.isUnsent) {
          actions.push({ key: 'star', label: item.isStarred ? 'Unstar' : 'Star', icon: item.isStarred ? 'star' : 'star-outline', onPress: () => toggleStar(item) });
          actions.push({ key: 'pin', label: item.isPinned ? 'Unpin' : 'Pin', icon: item.isPinned ? 'pin' : 'pin-outline', onPress: () => togglePin(item) });
        }
        if (mine && isPlainText && canEdit && withinEditWindow && !item.isUnsent) {
          actions.push({ key: 'edit', label: 'Edit', icon: 'create-outline', onPress: () => { dismissMenu(); startEditing(item); } });
        }
        if (!mine && isPlainText && item.content && canEdit) {
          actions.push({ key: 'translate', label: translations[item.id] ? 'Hide translation' : 'Translate', icon: 'language-outline', onPress: () => translateMessageText(item) });
        }
        if (isImage) {
          actions.push({ key: 'save', label: 'Save to Gallery', icon: 'download-outline', onPress: () => saveMediaToGallery(item) });
          const shareUrl = item.mediaUrls[0] ?? item.mediaUrl;
          if (shareUrl) {
            actions.push({ key: 'share', label: 'Share', icon: 'share-outline', onPress: () => { dismissMenu(); shareMediaUrl(shareUrl); } });
          }
        }
        if (!item.isUnsent && !item.id.startsWith('tmp-')) {
          actions.push({ key: 'select', label: 'Select', icon: 'checkmark-circle-outline', onPress: () => enterSelectMode(item) });
        }
        // Delete for me — available on any message.
        actions.push({ key: 'delete_me', label: 'Delete for Me', icon: 'trash-outline', destructive: true, onPress: () => runDeleteSelf(item) });
        // Delete for everyone — own messages, plan-gated (Premium before read, Gold anytime).
        if (mine && canUnsend && (canUnsendAnytime || !item.readAt) && !item.isUnsent) {
          actions.push({ key: 'delete_all', label: 'Delete for Everyone', icon: 'trash-bin-outline', destructive: true, onPress: () => confirmUnsend(item) });
        }
        if (!mine) {
          actions.push({ key: 'report', label: 'Report', icon: 'flag-outline', onPress: openReportFromMenu });
        }
        if (mine && !item.isUnsent) {
          actions.push({ key: 'info', label: 'Message Info', icon: 'information-circle-outline', onPress: () => { dismissMenu(); setInfoMessage(item); } });
        }

        // Anchor the menu near the pressed bubble: above it when the press was
        // in the lower half of the screen, below it otherwise. Clamped on-screen.
        const screenH = Dimensions.get('window').height;
        const menuH = 54 + actions.length * 41;
        const showAbove = menuY > screenH / 2;
        const rawTop = showAbove ? menuY - menuH - 60 : menuY + 60;
        const top = Math.max(70, Math.min(rawTop, screenH - menuH - 40));

        return (
          /* animationType="none": entry AND exit are driven by menuOpacity /
             menuScale so the dismissal scales down instead of a plain fade. */
          <Modal visible transparent animationType="none" onRequestClose={dismissMenu}>
            <Animated.View style={[{ flex: 1 }, menuOverlayStyle]}>
            <Pressable style={{ flex: 1 }} onPress={dismissMenu}>
              <BlurView intensity={28} tint="dark" style={{ flex: 1 }}>
                <Animated.View
                  style={[
                    styles.menuWrap,
                    { top },
                    mine ? { right: 16, alignItems: 'flex-end' } : { left: 16, alignItems: 'flex-start' },
                  ]}
                >
                  <View style={[styles.emojiRow, { backgroundColor: theme.surface }]}>
                    {QUICK_EMOJIS.map((e) => (
                      <Pressable
                        key={e}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          onReact(item, e);
                        }}
                        style={styles.emojiBtn}
                      >
                        <Text style={styles.emojiBtnText}>{e}</Text>
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => { setEmojiPickerOpen(true); }}
                      style={[styles.plusBtn, { backgroundColor: theme.surfaceElevated }]}
                    >
                      <Ionicons name="add" size={20} color={theme.textSecondary} />
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
                </Animated.View>
              </BlurView>
            </Pressable>
            </Animated.View>
          </Modal>
        );
      })()}

      <AppBottomSheet
        visible={emojiPickerOpen}
        onClose={() => setEmojiPickerOpen(false)}
        enableContentPanningGesture={false}
      >
        <EmojiPicker
          onSelect={(emoji) => {
            if (menuMessage) onReact(menuMessage, emoji);
            setEmojiPickerOpen(false);
          }}
        />
      </AppBottomSheet>

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

      <MessageInfo
        message={infoMessage}
        isOwn={infoMessage ? infoMessage.senderId === me?.id : false}
        onClose={() => setInfoMessage(null)}
      />

      <ForwardSheet
        visible={!!forwardMessages}
        onClose={() => setForwardMessages(null)}
        onForward={runForward}
        excludeConversationId={conversationId}
      />

      {alertConfig ? <CustomAlert visible onDismiss={hideAlert} {...alertConfig} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Inverted chat list (mirrors app/rooms/[id].tsx): the list is flipped and every
  // row flips itself back, so index 0 (the newest message) renders at the visual
  // bottom. The chat is bottom-anchored on open with zero settle, and an image
  // that loads mid-list pushes content UP off-screen instead of shifting the view.
  invertList: { transform: [{ scaleY: -1 }] },
  invertRow: { transform: [{ scaleY: -1 }] },
  emptyConversation: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyAvatar: { width: 80, height: 80, borderRadius: 40 },
  emptyName: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, marginTop: 16 },
  emptySubtitle: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
  unreadDivider: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  unreadLine: { flex: 1, height: StyleSheet.hairlineWidth },
  unreadText: { fontSize: FontSize.xs, fontFamily: FontFamily.medium, marginHorizontal: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 56, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  headTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headAvatar: { width: 36, height: 36, borderRadius: 18 },
  onlineDot: { position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  headProfile: { flex: 1, gap: 1 },
  headNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headName: { fontSize: 15, fontFamily: FontFamily.semibold, flexShrink: 1 },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingLeft: 4, paddingRight: 4 },
  disappearBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 5 },
  disappearText: { fontSize: FontSize.xs, fontFamily: FontFamily.medium },
  headStatus: { fontSize: 12, fontFamily: FontFamily.regular },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  callBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  tooltip: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10 },
  searchInput: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.regular },
  searchCount: { fontSize: FontSize.xs, fontFamily: FontFamily.medium },
  banner: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10 },
  pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderLeftWidth: 3 },
  pinnedLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  pinnedText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 1 },
  translated: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, fontStyle: 'italic', marginTop: 4, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  tooltipText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, lineHeight: 17 },
  dateRow: { alignItems: 'center', marginVertical: 8 },
  dateLabel: { fontSize: 12, fontFamily: FontFamily.medium, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  // Carries the long-press "lift" (scale + shadow) while the context menu is open.
  liftLayer: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 } },
  bubbleRow: { maxWidth: '75%' },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectCheckbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  forwardedRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2, marginHorizontal: 4 },
  forwardedText: { fontSize: FontSize.xs, fontFamily: FontFamily.medium, fontStyle: 'italic' },
  left: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14 },
  mediaBubble: { borderRadius: 12, overflow: 'hidden' },
  snapBubble: { padding: 6 },
  textMe: { color: '#fff', fontSize: FontSize.md, fontFamily: FontFamily.regular },
  removedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  albumBadge: { position: 'absolute', top: 8, left: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  photoCaption: { fontSize: FontSize.md, fontFamily: FontFamily.regular, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2, maxWidth: 260 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, marginHorizontal: 4 },
  metaInBubble: { alignSelf: 'flex-end', marginTop: 1, marginHorizontal: 0, marginLeft: 10 },
  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  retryText: { fontSize: FontSize.xs, fontFamily: FontFamily.semibold, marginLeft: 1 },
  time: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },
  quote: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4, paddingRight: 4, borderRadius: 6, marginBottom: 4 },
  quoteBody: { flex: 1 },
  quoteMediaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  quoteThumb: { width: 40, height: 40, borderRadius: 4 },
  quoteName: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  quoteText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3, marginHorizontal: 4 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  reactionEmoji: { fontSize: FontSize.sm },
  reactionCount: { fontSize: FontSize.xs, fontFamily: FontFamily.medium },
  menuWrap: { position: 'absolute', gap: 6 },
  emojiRow: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 6, borderRadius: 24 },
  emojiBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emojiBtnText: { fontSize: 22 },
  plusBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  menuList: { width: 220, borderRadius: 12, paddingVertical: 4, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  menuItemText: { fontSize: 15, fontFamily: FontFamily.medium },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: 12 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetLabel: { fontSize: FontSize.lg, fontWeight: '600' },
  cancelSheet: { alignItems: 'center', marginTop: 8 },
  emptyAlbums: { textAlign: 'center', paddingVertical: 20, fontSize: FontSize.md },
});
