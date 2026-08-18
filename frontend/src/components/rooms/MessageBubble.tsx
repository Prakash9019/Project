import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Image, type ImageLoadEventData } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Avatar } from '../Avatar';
import { MessageTick } from '../MessageTick';
import { ReactionPill } from '../chat/ReactionPill';
import { VideoBubble } from '../chat/VideoBubble';
import { LinkPreview } from '../chat/LinkPreview';
import { AudioPlayer } from '../chat/AudioPlayer';
import { measureThumbnail } from '../../utils/measureThumbnail';
import type { ThumbnailLayout } from '../MediaViewer';
import { useTheme, FontFamily, FontSize } from '../../theme';
import { hasUrl, linkifyText, firstUrl, isBareUrl } from '../../lib/linkify';
import type { RoomMessageCard } from '../../types/api';

const SWIPE_TRIGGER = 60;

/** Pressable that can carry the animated long-press "lift" style. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Haptic fired the instant the swipe-to-reply threshold is crossed (WhatsApp "click"). */
function swipeThresholdHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/**
 * Render message text with @mentions highlighted and TAPPABLE.
 *
 * On own (gradient) bubbles a plain `#fff` mention was indistinguishable from
 * the surrounding body text — it now carries a translucent white pill plus an
 * underline so it reads as a distinct, tappable entity on both bubble styles.
 */
function renderWithMentions(
  content: string,
  mentionColor: string,
  isOwn: boolean,
  onMentionPress?: (firstName: string) => void,
): React.ReactNode {
  const parts = content.split(/(@[\p{L}\p{N}_]+)/gu);
  return parts.map((part, i) => {
    if (!/^@[\p{L}\p{N}_]+$/u.test(part)) return part;
    return (
      <Text
        key={i}
        suppressHighlighting
        onPress={onMentionPress ? () => onMentionPress(part.slice(1)) : undefined}
        style={[
          styles.mention,
          isOwn
            ? { color: '#fff', backgroundColor: 'rgba(255,255,255,0.22)', textDecorationLine: 'underline' }
            : { color: mentionColor },
        ]}
      >
        {part}
      </Text>
    );
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function MessageBubbleBase({
  message,
  isOwn,
  isAdmin,
  deliveryStatus,
  highlight,
  isSelecting,
  isSelected,
  isMenuTarget,
  replyPreview,
  onLongPress,
  onTap,
  onSwipeReply,
  onReactionPress,
  onReactionLongPress,
  onAvatarPress,
  onReplyPress,
  onImagePress,
  onVideoPress,
  onMentionPress,
}: {
  message: RoomMessageCard;
  isOwn: boolean;
  isAdmin?: boolean;
  /** Sender-side tick state for own messages (groups never show read/blue). */
  deliveryStatus?: 'sending' | 'sent' | 'delivered';
  highlight?: boolean;
  /** Multi-select mode is active (shows a leading checkbox, dims unselected bubbles). */
  isSelecting?: boolean;
  isSelected?: boolean;
  /** This bubble is the open context menu's target — lifts it above the blur. */
  isMenuTarget?: boolean;
  /**
   * Resolved preview of the replied-to message, derived by the parent from the
   * server's `replyTo` (which carries type + signed media + duration), so a
   * quoted image/voice renders correctly even when the original is far outside
   * the loaded page.
   */
  replyPreview?: { kind: 'image' | 'voice' | 'text'; thumbUrl?: string | null; label: string } | null;
  /** Receives the press `pageY` so the context menu can anchor near the bubble. */
  onLongPress: (pageY?: number) => void;
  /** Tap toggles selection while `isSelecting`; a no-op otherwise. */
  onTap?: () => void;
  onSwipeReply: () => void;
  onReactionPress: (emoji: string) => void;
  onReactionLongPress?: (emoji: string) => void;
  onAvatarPress: () => void;
  onReplyPress?: () => void;
  /** Opens the viewer; `layout` is the tapped thumbnail's rect for the zoom. */
  onImagePress?: (url: string, layout?: ThumbnailLayout) => void;
  /** Open the in-app player for a video message (never a browser). */
  onVideoPress?: (url: string, layout?: ThumbnailLayout) => void;
  /** Tapping an @mention — receives the mentioned first name (without the "@"). */
  onMentionPress?: (firstName: string) => void;
}) {
  const { theme } = useTheme();
  const s = message.sender;
  const deleted = message.isDeleted;

  // Media classification.
  const media = message.mediaUrl ?? '';
  const isVideo =
    message.type === 'image' && !!media && (/\.mp4($|\?)/i.test(media) || media.includes('/video-clips/'));
  // GIFs (KLIPY) render at a fixed width with preserved aspect ratio.
  const isGif =
    message.type === 'image' &&
    !!media &&
    !isVideo &&
    (/\.gif($|\?)/i.test(media) || media.includes('klipy'));
  const isImage = message.type === 'image' && !!media && !isVideo && !isGif;
  const isVoice = message.type === 'voice' && !!media;
  // Document / audio-file arrive as text messages carrying a mediaUrl + emoji prefix.
  const isDoc = message.type === 'text' && !!media && message.content.startsWith('📄');
  const isAudioFile = message.type === 'text' && !!media && message.content.startsWith('🎵');
  // Location card: a text message with structured content '📍 label|lat|lng'.
  const isLocation = message.type === 'text' && message.content.startsWith('📍 ') && message.content.includes('|');
  const locationParts = isLocation ? message.content.replace(/^📍\s*/, '').split('|') : null;
  const locationLabel = locationParts?.[0] || 'My Location';
  const locationLat = locationParts ? Number(locationParts[1]) : 0;
  const locationLng = locationParts ? Number(locationParts[2]) : 0;

  // Bare media (image/GIF/video with no caption or reply quote) renders
  // edge-to-edge — no bubble padding, border or background, WhatsApp-style.
  const bareMedia = !deleted && (isImage || isGif || isVideo) && !message.content && !message.replyTo;

  // Rooms have no thumbnailUrl column, so a video's poster frame travels in the
  // opaque `metadata` JSON (written by rooms/[id].tsx handleSendVideo). Videos
  // sent before that shipped simply have none and fall back to a placeholder.
  const videoThumbnailUrl = useMemo(() => {
    if (!isVideo || !message.metadata) return null;
    try {
      const parsed = JSON.parse(message.metadata) as { thumbnailUrl?: unknown };
      return typeof parsed.thumbnailUrl === 'string' ? parsed.thumbnailUrl : null;
    } catch {
      return null;
    }
  }, [isVideo, message.metadata]);

  const [gifAspect, setGifAspect] = useState<number | null>(null);
  const onGifLoad = (e: ImageLoadEventData) => {
    const src = e.source;
    if (src?.width && src?.height) setGifAspect(src.width / src.height);
  };

  // Image-load failure → show a tappable retry overlay that forces a reload.
  const [imgError, setImgError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Measured at tap time so the MediaViewer can zoom out of this exact tile.
  const imageRef = useRef<View>(null);

  const openMedia = () => {
    if (media) Linking.openURL(media).catch(() => {});
  };

  const renderMediaCard = (icon: React.ComponentProps<typeof Ionicons>['name'], label: string, subtitle: string) => {
    const fg = isOwn ? '#fff' : theme.textPrimary;
    const sub = isOwn ? '#ffffffcc' : theme.textTertiary;
    const iconBg = isOwn ? 'rgba(255,255,255,0.2)' : theme.brand + '22';
    const iconColor = isOwn ? '#fff' : theme.brand;
    return (
      <Pressable onPress={openMedia} onLongPress={(e) => onLongPress(e.nativeEvent.pageY)} delayLongPress={220} style={styles.mediaCard}>
        <View style={[styles.mediaIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.mediaLabel, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.mediaSub, { color: sub }]}>{subtitle}</Text>
        </View>
        <Ionicons name="download-outline" size={20} color={fg} />
      </Pressable>
    );
  };

  const translateX = useSharedValue(0);
  // Fires the haptic exactly once when the 60px threshold is crossed (re-arms on pull-back).
  const armed = useSharedValue(false);
  const pan = Gesture.Pan()
    .enabled(!isSelecting)
    .activeOffsetX([-15, 15])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      // Swipe right only, damped.
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

  // FlashList recycles row views rather than remounting them, so this component
  // instance can be reused for a different message. Without this, a cell that was
  // mid-swipe (or just sprung back) when recycled would briefly render the old
  // offset for the new message before snapping to 0 — the reported "jumps left
  // and right". Resetting on identity change (not animated) keeps a fresh row stable.
  useEffect(() => {
    translateX.value = 0;
    armed.value = false;
  }, [message.id, translateX, armed]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  // Opacity only — no scale. A scaling arrow on top of the row's own translateX
  // is a second, independent animation racing the drag, which read as "dancing".
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_TRIGGER], [0, 1], Extrapolation.CLAMP),
  }));

  // WhatsApp-style meta: timestamp + ticks INSIDE the bubble bottom-right for
  // padded bubbles, below the media for bare image/GIF bubbles (mirrors 1:1 chat).
  const metaOnGradient = isOwn && !bareMedia;
  const metaMuted = metaOnGradient ? 'rgba(255,255,255,0.7)' : theme.textTertiary;
  const metaNode = (
    <View style={[styles.metaRow, bareMedia ? (isOwn ? { justifyContent: 'flex-end' } : null) : styles.metaInBubble]}>
      {message.isStarred && !deleted ? (
        <Ionicons name="star" size={11} color={metaOnGradient ? '#fff' : theme.brand} style={{ marginRight: 2 }} />
      ) : null}
      <Text style={[styles.time, { color: metaMuted }]}>{timeLabel(message.createdAt)}</Text>
      {message.isEdited && !deleted ? (
        <Text style={[styles.time, { color: metaMuted }]}> · edited</Text>
      ) : null}
      {isOwn && !deleted ? (
        <MessageTick
          status={deliveryStatus ?? 'sent'}
          isPremium={false}
          mutedColor={metaOnGradient ? 'rgba(255,255,255,0.8)' : undefined}
        />
      ) : null}
    </View>
  );

  // Link preview target: the first url in a plain text message. Location and
  // file cards are excluded (they render their own card), as are bare-url
  // messages and deleted ones.
  const previewUrl =
    !deleted && !isDoc && !isAudioFile && !isLocation && !isBareUrl(message.content)
      ? firstUrl(message.content)
      : null;

  const quoteAccent = isOwn ? '#fff' : theme.brand;
  const quote = replyPreview ?? { kind: 'text' as const, label: message.replyTo?.content ?? '', thumbUrl: null };

  const bubbleInner = (
    <>
      {/* Reply quote */}
      {message.replyTo ? (
        <Pressable onPress={onReplyPress}>
          <View
            style={[
              styles.quote,
              {
                backgroundColor: isOwn ? 'rgba(255,255,255,0.15)' : theme.backgroundTertiary,
                borderLeftColor: quoteAccent,
              },
            ]}
          >
            <View style={styles.quoteBody}>
              <Text style={[styles.quoteName, { color: quoteAccent }]} numberOfLines={1}>
                {message.replyTo.senderFirstName ?? '—'}
              </Text>
              {quote.kind === 'voice' ? (
                <View style={styles.quoteMediaRow}>
                  <Ionicons name="mic" size={13} color={quoteAccent} />
                  <Text
                    style={[styles.quoteText, { color: isOwn ? '#ffffffcc' : theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {quote.label}
                  </Text>
                </View>
              ) : (
                <Text
                  style={[styles.quoteText, { color: isOwn ? '#ffffffcc' : theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {quote.label}
                </Text>
              )}
            </View>
            {/* Photo replies show the actual image, not the words "📷 Photo". */}
            {quote.kind === 'image' && quote.thumbUrl ? (
              <Image
                source={{ uri: quote.thumbUrl }}
                style={styles.quoteThumb}
                contentFit="cover"
                transition={120}
              />
            ) : null}
          </View>
        </Pressable>
      ) : null}

      {/* Media */}
      {!deleted && isGif ? (
        <Image
          source={{ uri: media }}
          style={[styles.gif, { height: gifAspect ? 200 / gifAspect : 200 }]}
          contentFit="contain"
          transition={120}
          onLoad={onGifLoad}
        />
      ) : null}
      {!deleted && isImage ? (
        <Pressable
          // collapsable={false} keeps the node measurable on Android.
          ref={imageRef}
          collapsable={false}
          style={styles.imageWrap}
          onPress={() => measureThumbnail(imageRef, (layout) => onImagePress?.(media, layout))}
          onLongPress={(e) => onLongPress(e.nativeEvent.pageY)}
          delayLongPress={220}
        >
          <Image
            key={reloadKey}
            source={{ uri: media }}
            style={styles.image}
            contentFit="cover"
            transition={120}
            onError={() => setImgError(true)}
            onLoad={() => setImgError(false)}
          />
          {imgError ? (
            <Pressable
              style={styles.imageRetry}
              onPress={() => {
                setImgError(false);
                setReloadKey((k) => k + 1);
              }}
            >
              <Ionicons name="reload" size={26} color="#fff" />
              <Text style={styles.imageRetryText}>Tap to retry</Text>
            </Pressable>
          ) : null}
        </Pressable>
      ) : null}
      {!deleted && isVideo ? (
        <VideoBubble
          thumbnailUrl={videoThumbnailUrl}
          duration={message.duration}
          stableId={`video-thumb-${message.id}`}
          onPress={(layout) => onVideoPress?.(media, layout)}
          onLongPress={onLongPress}
        />
      ) : null}
      {/* The SAME player the 1:1 chat uses — speed control, tap-to-seek and
          error/retry included. Rooms used to have a reduced local copy. */}
      {!deleted && isVoice ? (
        <AudioPlayer
          mediaUrl={media}
          isOwn={isOwn}
          waveformSource={message.metadata}
          duration={message.duration}
        />
      ) : null}
      {!deleted && isDoc ? renderMediaCard('document-text', message.content.replace(/^📄\s*/, '') || 'Document', 'Tap to open') : null}
      {!deleted && isAudioFile ? renderMediaCard('musical-notes', message.content.replace(/^🎵\s*/, '') || 'Audio', 'Tap to play') : null}
      {!deleted && isLocation ? (
        <Pressable
          onPress={() => Linking.openURL(`https://maps.google.com/?q=${locationLat},${locationLng}`).catch(() => {})}
          onLongPress={(e) => onLongPress(e.nativeEvent.pageY)}
          delayLongPress={220}
          style={styles.mediaCard}
        >
          <View style={[styles.mediaIcon, { backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : theme.brand + '22' }]}>
            <Ionicons name="location" size={22} color={isOwn ? '#fff' : theme.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mediaLabel, { color: isOwn ? '#fff' : theme.textPrimary }]} numberOfLines={1}>
              {locationLabel}
            </Text>
            <Text style={[styles.mediaSub, { color: isOwn ? '#ffffffcc' : theme.textTertiary }]}>Tap to open in Maps</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={isOwn ? '#fff' : theme.textTertiary} />
        </Pressable>
      ) : null}

      {/* Text */}
      {deleted ? (
        <View style={styles.deletedRow}>
          <Ionicons name="ban-outline" size={14} color={isOwn ? '#ffffffcc' : theme.textTertiary} />
          <Text style={[styles.text, styles.deleted, { color: isOwn ? '#ffffffcc' : theme.textTertiary }]}>
            This message was deleted
          </Text>
        </View>
      ) : message.content && !isDoc && !isAudioFile && !isLocation ? (
        <View>
          <Text style={[styles.text, { color: isOwn ? '#fff' : theme.textPrimary }]}>
            {hasUrl(message.content)
              ? linkifyText(
                  message.content,
                  undefined,
                  isOwn
                    ? { color: '#fff', textDecorationLine: 'underline' }
                    : { color: theme.info, textDecorationLine: 'underline' },
                )
              : renderWithMentions(message.content, theme.brand, isOwn, onMentionPress)}
          </Text>
          {/* Rich preview for the FIRST url. A message that is nothing but a url
              is a deliberate link share — let the url speak for itself. */}
          {previewUrl ? <LinkPreview url={previewUrl} isOwn={isOwn} /> : null}
        </View>
      ) : null}

      {/* Meta rides inside padded bubbles; bare media renders it below instead. */}
      {!bareMedia ? metaNode : null}
    </>
  );

  const bubbleContent = (
    <GestureDetector gesture={pan}>
      <Animated.View style={rowStyle}>
        {/* Swipe reply arrow */}
        <Animated.View style={[styles.swipeArrow, arrowStyle]}>
          <Ionicons name="arrow-undo" size={18} color={theme.brand} />
        </Animated.View>

        <View style={[styles.row, isOwn ? styles.rowOwn : null]}>
          {!isOwn ? (
            <Pressable onPress={onAvatarPress} style={{ marginRight: 8 }}>
              <Avatar uri={s.profilePhotoUrl} size={36} online={s.isOnline} />
            </Pressable>
          ) : null}

          <View style={{ maxWidth: '75%' }}>
            {!isOwn ? (
              <Pressable onPress={onAvatarPress} style={styles.senderRow}>
                <Text style={[styles.senderName, { color: theme.brand }]}>{s.firstName ?? 'Someone'}</Text>
                {s.age != null ? <Text style={[styles.senderAge, { color: theme.textTertiary }]}>{s.age}</Text> : null}
                {s.isVerified ? <Ionicons name="checkmark-circle" size={12} color={theme.info} /> : null}
                {isAdmin ? (
                  <View style={[styles.adminChip, { backgroundColor: theme.warning + '22' }]}>
                    <Text style={[styles.adminChipText, { color: theme.warning }]}>Admin</Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}

            <AnimatedPressable style={styles.liftLayer} onLongPress={(e) => onLongPress(e.nativeEvent.pageY)} delayLongPress={220} onPress={onTap}>
              {bareMedia ? (
                <View
                  style={[
                    styles.mediaBubble,
                    highlight && { borderWidth: 1.5, borderColor: theme.brandSecondary },
                  ]}
                >
                  {bubbleInner}
                </View>
              ) : isOwn ? (
                <LinearGradient
                  colors={theme.gradientWarm}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.bubble,
                    styles.bubbleOwn,
                    highlight && { borderWidth: 1.5, borderColor: theme.brandSecondary },
                  ]}
                >
                  {bubbleInner}
                </LinearGradient>
              ) : (
                <View
                  style={[
                    styles.bubble,
                    styles.bubbleOther,
                    { backgroundColor: theme.receivedBubble, borderWidth: 0.5, borderColor: theme.receivedBubbleBorder },
                    highlight && { borderWidth: 1.5, borderColor: theme.brandSecondary },
                  ]}
                >
                  {bubbleInner}
                </View>
              )}
            </AnimatedPressable>

            {/* Bare media keeps its timestamp + delivery below the image */}
            {bareMedia ? metaNode : null}

            {/* Reactions */}
            {message.reactions.length > 0 ? (
              <View style={[styles.reactionsRow, isOwn ? { justifyContent: 'flex-end' } : null]}>
                {message.reactions.map((r) => (
                  <ReactionPill
                    key={r.emoji}
                    emoji={r.emoji}
                    count={r.count}
                    userReacted={r.userReacted}
                    onPress={() => onReactionPress(r.emoji)}
                    onLongPress={() => onReactionLongPress?.(r.emoji)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );

  if (!isSelecting) return bubbleContent;
  return (
    <View style={[styles.selectRow, isOwn ? { flexDirection: 'row-reverse' } : null]}>
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
      <View style={{ flex: 1, opacity: isSelected ? 1 : 0.6 }}>{bubbleContent}</View>
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleBase, (prev, next) => {
  const a = prev.message;
  const b = next.message;
  return (
    a.id === b.id &&
    a.content === b.content &&
    a.isDeleted === b.isDeleted &&
    a.isPinned === b.isPinned &&
    a.isStarred === b.isStarred &&
    a.mediaUrl === b.mediaUrl &&
    a.metadata === b.metadata &&
    a.reactions === b.reactions &&
    a.deliveredCount === b.deliveredCount &&
    a.isEdited === b.isEdited &&
    prev.isOwn === next.isOwn &&
    prev.isAdmin === next.isAdmin &&
    prev.deliveryStatus === next.deliveryStatus &&
    prev.highlight === next.highlight &&
    prev.isSelecting === next.isSelecting &&
    prev.isSelected === next.isSelected &&
    prev.isMenuTarget === next.isMenuTarget &&
    prev.replyPreview?.kind === next.replyPreview?.kind &&
    prev.replyPreview?.thumbUrl === next.replyPreview?.thumbUrl &&
    prev.replyPreview?.label === next.replyPreview?.label
  );
});

const styles = StyleSheet.create({
  selectRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 4 },
  selectCheckbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  swipeArrow: { position: 'absolute', left: 12, top: 0, bottom: 0, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 4, alignSelf: 'flex-start', maxWidth: '100%' },
  rowOwn: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  senderName: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  senderAge: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  adminChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  adminChipText: { fontSize: FontSize.xs, fontFamily: FontFamily.semibold },

  // Carries the long-press "lift" (scale + shadow) while the context menu is open.
  liftLayer: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 } },
  bubble: { paddingVertical: 6, paddingHorizontal: 9 },
  bubbleOther: { borderTopLeftRadius: 0, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  bubbleOwn: { borderTopLeftRadius: 16, borderTopRightRadius: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  // Bare image/GIF bubble — no padding, border or background (WhatsApp-style).
  mediaBubble: { borderRadius: 12, overflow: 'hidden' },
  text: { fontSize: FontSize.md, fontFamily: FontFamily.regular, lineHeight: 20 },
  mention: { fontFamily: FontFamily.semibold },
  deleted: { fontStyle: 'italic' },
  deletedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  imageWrap: { borderRadius: 12, overflow: 'hidden' },
  image: { width: 220, height: 220, borderRadius: 12 },
  imageRetry: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)' },
  imageRetryText: { color: '#fff', fontSize: FontSize.sm, fontFamily: FontFamily.medium },
  gif: { width: 200, borderRadius: 12, marginBottom: 4, backgroundColor: 'rgba(0,0,0,0.1)' },
  mediaCard: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200, paddingVertical: 2 },
  mediaIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mediaLabel: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  mediaSub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 1 },

  quote: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4, paddingRight: 4, borderRadius: 6, marginBottom: 4 },
  quoteBody: { flex: 1 },
  quoteMediaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  quoteThumb: { width: 40, height: 40, borderRadius: 4 },
  quoteName: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  quoteText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  metaInBubble: { alignSelf: 'flex-end', marginTop: 1, marginLeft: 10 },
  time: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  reactionEmoji: { fontSize: FontSize.sm },
  reactionCount: { fontSize: FontSize.xs, fontFamily: FontFamily.medium },
});
