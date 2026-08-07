import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, ActivityIndicator } from 'react-native';
import { Image, type ImageLoadEventData } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Avatar } from '../Avatar';
import { MessageTick } from '../MessageTick';
import { ReactionPill } from '../chat/ReactionPill';
import { useTheme, FontFamily, FontSize } from '../../theme';
import { parseVoiceAmplitudes } from '../../lib/audioAmplitude';
import { hasUrl, linkifyText } from '../../lib/linkify';
import type { RoomMessageCard } from '../../types/api';

const SWIPE_TRIGGER = 60;

/** Haptic fired the instant the swipe-to-reply threshold is crossed (WhatsApp "click"). */
function swipeThresholdHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Render message text with @mentions highlighted (brand color, semibold). */
function renderWithMentions(content: string, mentionColor: string): React.ReactNode {
  const parts = content.split(/(@[\p{L}\p{N}_]+)/gu);
  return parts.map((part, i) =>
    /^@[\p{L}\p{N}_]+$/u.test(part) ? (
      <Text key={i} style={{ color: mentionColor, fontFamily: FontFamily.semibold }}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
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
  onLongPress,
  onTap,
  onSwipeReply,
  onReactionPress,
  onReactionLongPress,
  onAvatarPress,
  onReplyPress,
  onImagePress,
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
  onLongPress: () => void;
  /** Tap toggles selection while `isSelecting`; a no-op otherwise. */
  onTap?: () => void;
  onSwipeReply: () => void;
  onReactionPress: (emoji: string) => void;
  onReactionLongPress?: (emoji: string) => void;
  onAvatarPress: () => void;
  onReplyPress?: () => void;
  /** Open the full-screen media viewer for a tapped image. */
  onImagePress?: (url: string) => void;
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

  // Bare media (image/GIF with no caption or reply quote) renders edge-to-edge —
  // no bubble padding, border or background, WhatsApp-style.
  const bareMedia = !deleted && (isImage || isGif) && !message.content && !message.replyTo;

  const [gifAspect, setGifAspect] = useState<number | null>(null);
  const onGifLoad = (e: ImageLoadEventData) => {
    const src = e.source;
    if (src?.width && src?.height) setGifAspect(src.width / src.height);
  };

  // Image-load failure → show a tappable retry overlay that forces a reload.
  const [imgError, setImgError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const openMedia = () => {
    if (media) Linking.openURL(media).catch(() => {});
  };

  const renderMediaCard = (icon: React.ComponentProps<typeof Ionicons>['name'], label: string, subtitle: string) => {
    const fg = isOwn ? '#fff' : theme.textPrimary;
    const sub = isOwn ? '#ffffffcc' : theme.textTertiary;
    const iconBg = isOwn ? 'rgba(255,255,255,0.2)' : theme.brand + '22';
    const iconColor = isOwn ? '#fff' : theme.brand;
    return (
      <Pressable onPress={openMedia} onLongPress={onLongPress} delayLongPress={220} style={styles.mediaCard}>
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
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_TRIGGER], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(translateX.value, [0, SWIPE_TRIGGER], [0.5, 1], Extrapolation.CLAMP) },
    ],
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
                borderLeftColor: isOwn ? '#fff' : theme.brand,
              },
            ]}
          >
            <Text style={[styles.quoteName, { color: isOwn ? '#fff' : theme.brand }]} numberOfLines={1}>
              {message.replyTo.senderFirstName ?? '—'}
            </Text>
            <Text
              style={[styles.quoteText, { color: isOwn ? '#ffffffcc' : theme.textSecondary }]}
              numberOfLines={1}
            >
              {message.replyTo.content}
            </Text>
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
          style={styles.imageWrap}
          onPress={() => onImagePress?.(media)}
          onLongPress={onLongPress}
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
      {!deleted && isVideo ? renderMediaCard('videocam', 'Video', 'Tap to play') : null}
      {!deleted && isVoice ? <VoicePlayer uri={media} metadata={message.metadata} isOwn={isOwn} /> : null}
      {!deleted && isDoc ? renderMediaCard('document-text', message.content.replace(/^📄\s*/, '') || 'Document', 'Tap to open') : null}
      {!deleted && isAudioFile ? renderMediaCard('musical-notes', message.content.replace(/^🎵\s*/, '') || 'Audio', 'Tap to play') : null}
      {!deleted && isLocation ? (
        <Pressable
          onPress={() => Linking.openURL(`https://maps.google.com/?q=${locationLat},${locationLng}`).catch(() => {})}
          onLongPress={onLongPress}
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
        <Text style={[styles.text, { color: isOwn ? '#fff' : theme.textPrimary }]}>
          {hasUrl(message.content)
            ? linkifyText(
                message.content,
                undefined,
                isOwn
                  ? { color: '#fff', textDecorationLine: 'underline' }
                  : { color: theme.info, textDecorationLine: 'underline' },
              )
            : renderWithMentions(message.content, isOwn ? '#fff' : theme.brand)}
        </Text>
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

            <Pressable onLongPress={onLongPress} delayLongPress={220} onPress={onTap}>
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
            </Pressable>

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
    prev.isSelected === next.isSelected
  );
});

/* ── Voice message player (expo-audio) ── */
const WAVE_BARS = 26;

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function VoicePlayer({ uri, metadata, isOwn }: { uri: string; metadata?: string | null; isOwn: boolean }) {
  const { theme } = useTheme();
  const playerRef = useRef<AudioPlayer | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const bars = useMemo(() => parseVoiceAmplitudes(metadata, WAVE_BARS), [metadata]);

  useEffect(() => {
    return () => {
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

  const onStatus = (status: AudioStatus) => {
    if (!status.isLoaded) return;
    setDurationMs(status.duration * 1000);
    setPositionMs(status.currentTime * 1000);
    setPlaying(status.playing);
    if (status.didJustFinish) {
      setPlaying(false);
      playerRef.current?.seekTo(0).catch(() => {});
    }
  };

  const toggle = async () => {
    try {
      if (!playerRef.current) {
        setLoading(true);
        const player = createAudioPlayer(uri);
        player.addListener('playbackStatusUpdate', onStatus);
        playerRef.current = player;
        player.play();
        setLoading(false);
        return;
      }
      if (playing) playerRef.current.pause();
      else playerRef.current.play();
    } catch {
      setLoading(false);
    }
  };

  const fg = isOwn ? '#fff' : theme.textPrimary;
  const track = isOwn ? 'rgba(255,255,255,0.35)' : theme.border;
  const fill = isOwn ? '#fff' : theme.brand;
  const btnBg = isOwn ? 'rgba(255,255,255,0.22)' : theme.brand + '22';
  const btnFg = isOwn ? '#fff' : theme.brand;
  const progress = durationMs > 0 ? positionMs / durationMs : 0;
  const label = playing || positionMs > 0 ? fmt(positionMs) : fmt(durationMs);

  return (
    <View style={styles.voiceRow}>
      <Pressable onPress={toggle} style={[styles.voiceBtn, { backgroundColor: btnBg }]} hitSlop={6}>
        {loading ? (
          <ActivityIndicator size="small" color={btnFg} />
        ) : (
          <Ionicons name={playing ? 'pause' : 'play'} size={18} color={btnFg} />
        )}
      </Pressable>
      <View style={styles.voiceWave}>
        {bars.map((b, i) => {
          const active = i / WAVE_BARS <= progress;
          return (
            <View
              key={i}
              style={{ width: 2.5, height: 22 * b, borderRadius: 2, backgroundColor: active ? fill : track }}
            />
          );
        })}
      </View>
      <Text style={[styles.voiceTime, { color: fg }]}>{label}</Text>
    </View>
  );
}

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

  bubble: { paddingVertical: 6, paddingHorizontal: 9 },
  bubbleOther: { borderTopLeftRadius: 0, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  bubbleOwn: { borderTopLeftRadius: 16, borderTopRightRadius: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  // Bare image/GIF bubble — no padding, border or background (WhatsApp-style).
  mediaBubble: { borderRadius: 12, overflow: 'hidden' },
  text: { fontSize: FontSize.md, fontFamily: FontFamily.regular, lineHeight: 20 },
  deleted: { fontStyle: 'italic' },
  deletedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  imageWrap: { borderRadius: 12, overflow: 'hidden' },
  image: { width: 220, height: 220, borderRadius: 12 },
  imageRetry: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)' },
  imageRetryText: { color: '#fff', fontSize: FontSize.sm, fontFamily: FontFamily.medium },
  gif: { width: 200, borderRadius: 12, marginBottom: 4, backgroundColor: 'rgba(0,0,0,0.1)' },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200, paddingVertical: 2 },
  voiceBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  voiceWave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 },
  voiceTime: { fontSize: FontSize.xs, fontFamily: FontFamily.medium, width: 34, textAlign: 'right' },
  mediaCard: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200, paddingVertical: 2 },
  mediaIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mediaLabel: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  mediaSub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 1 },

  quote: { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4, paddingRight: 8, borderRadius: 6, marginBottom: 4 },
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
