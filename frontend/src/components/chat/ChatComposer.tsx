import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Keyboard,
  type KeyboardEvent,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useTheme, FontFamily, FontSize } from '../../theme';
import { Avatar } from '../Avatar';
import { showError } from '../../lib/toast';
import { EmojiPicker } from '../rooms/EmojiPicker';
import { VoiceRecorder } from '../rooms/VoiceRecorder';
import type { GifResult } from '../rooms/GifPicker';
import { AttachmentSheet, type AttachmentKind } from './AttachmentSheet';
import { LocationPicker } from './LocationPicker';
import { ImagePreview } from './ImagePreview';
import { ReplyBar } from './ReplyBar';
import { EditBar } from './EditBar';
import { UploadProgressBar } from './UploadProgressBar';

const DRAFT_DEBOUNCE_MS = 500;
const TYPING_STOP_MS = 2000;
const MIN_RECORD_MS = 1000;

export interface ChatComposerProps {
  /** Exactly one of these identifies the thread — used for per-thread draft storage. */
  conversationId?: string;
  roomId?: string;

  replyTo?: { id: string; senderName: string; content: string } | null;
  editingMessage?: { id: string; content: string } | null;
  onClearReply: () => void;
  onClearEdit: () => void;

  // Send handlers — the PARENT owns the actual upload + API send (inbox uses GCS,
  // rooms use R2), so the composer hands back local URIs / raw values.
  onSendText: (content: string, replyToId?: string) => Promise<void>;
  onSendImages: (uris: string[], caption: string, replyToId?: string) => Promise<void>;
  onSendVideo: (uri: string, replyToId?: string) => Promise<void>;
  onSendAudio: (uri: string, durationMs: number, replyToId?: string) => Promise<void>;
  onSendDocument: () => void | Promise<void>;
  onSendAudioFile?: () => void | Promise<void>;
  onSendGif: (gif: GifResult) => void | Promise<void>;
  onSendLocation: (lat: number, lng: number, label: string) => void | Promise<void>;
  onEditConfirm: (messageId: string, newContent: string) => Promise<void>;
  /** 1:1-only extras — when provided, the attachment sheet reveals the item. */
  onSendViewOnce?: () => void | Promise<void>;
  onShareAlbum?: () => void | Promise<void>;

  onTypingStart: () => void;
  onTypingStop: () => void;

  canUseTemplates?: boolean;
  onOpenTemplates?: () => void;
  /** Group members for @mention autocomplete (rooms only). */
  mentionCandidates?: { id: string; firstName: string; avatarUrl?: string | null }[];
  isDisabled?: boolean;
  disabledMessage?: string;
  placeholder?: string;
  uploadProgress?: number | null;
}

export interface ChatComposerHandle {
  /** Insert text at the current cursor position (used by e.g. message templates). */
  insertText: (text: string) => void;
}

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(props, ref) {
  const {
    conversationId,
    roomId,
    replyTo,
    editingMessage,
    onClearReply,
    onClearEdit,
    onSendText,
    onSendImages,
    onSendVideo,
    onSendAudio,
    onSendDocument,
    onSendAudioFile,
    onSendGif,
    onSendLocation,
    onEditConfirm,
    onSendViewOnce,
    onShareAlbum,
    onTypingStart,
    onTypingStop,
    canUseTemplates,
    onOpenTemplates,
    mentionCandidates,
    isDisabled,
    disabledMessage,
    placeholder,
    uploadProgress,
  } = props;

  const { theme } = useTheme();
  const draftKey = conversationId ? `draft:conv:${conversationId}` : roomId ? `draft:room:${roomId}` : null;

  const [draft, setDraft] = useState('');
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Last-seen keyboard height — the emoji panel opens at exactly this height so it
  // slots into the space the keyboard vacates (WhatsApp-style, no layout jump).
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [attachOpen, setAttachOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [previewUris, setPreviewUris] = useState<string[] | null>(null);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const holdingRef = useRef(false);
  const recordCancelled = useRef(false);

  const hasText = draft.trim().length > 0;

  // ── @mention autocomplete ──────────────────────────────────
  const beforeCursor = draft.slice(0, selection.start ?? draft.length);
  const mentionMatch = mentionCandidates && mentionCandidates.length ? beforeCursor.match(/@([^\s@]*)$/) : null;
  const mentionResults = mentionMatch
    ? mentionCandidates!.filter((c) => c.firstName.toLowerCase().startsWith(mentionMatch[1].toLowerCase())).slice(0, 6)
    : [];
  const showMentions = !!mentionMatch && mentionResults.length > 0 && !editingMessage;

  const insertMention = (c: { firstName: string }) => {
    const start = selection.start ?? draft.length;
    const before = draft.slice(0, start);
    const m = before.match(/@([^\s@]*)$/);
    if (!m) return;
    const matchStart = start - m[0].length;
    const insert = `@${c.firstName} `;
    const next = draft.slice(0, matchStart) + insert + draft.slice(start);
    handleDraftChange(next);
    const caret = matchStart + insert.length;
    setSelection({ start: caret, end: caret });
  };

  // ── Draft persistence ──────────────────────────────────────
  // Load any saved draft when the thread changes (skipped while editing).
  useEffect(() => {
    let active = true;
    if (!draftKey) return;
    AsyncStorage.getItem(draftKey)
      .then((saved) => {
        if (active && saved && !editingMessage) setDraft(saved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // Only re-run when the thread identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // While editing, mirror the message content into the draft.
  useEffect(() => {
    if (editingMessage) {
      setDraft(editingMessage.content);
      setEmojiOpen(false);
    }
  }, [editingMessage]);

  // Track the keyboard height so the emoji panel can size itself to match it.
  // We deliberately do NOT reset to 0 on hide — the emoji panel reuses the last
  // known height when it replaces the (now dismissed) keyboard.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      const h = e.endCoordinates?.height ?? 0;
      if (h > 0) setKeyboardHeight(h);
    });
    return () => sub.remove();
  }, []);

  // Tapping the emoji button swaps the keyboard for the emoji panel (and back),
  // rather than stacking the panel below an open keyboard.
  const toggleEmoji = () => {
    if (emojiOpen) {
      setEmojiOpen(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      Keyboard.dismiss();
      setTimeout(() => setEmojiOpen(true), Platform.OS === 'ios' ? 100 : 50);
    }
  };

  const persistDraft = useCallback(
    (text: string) => {
      if (!draftKey || editingMessage) return;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        if (text) AsyncStorage.setItem(draftKey, text).catch(() => {});
        else AsyncStorage.removeItem(draftKey).catch(() => {});
      }, DRAFT_DEBOUNCE_MS);
    },
    [draftKey, editingMessage],
  );

  const clearDraftStorage = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (draftKey) AsyncStorage.removeItem(draftKey).catch(() => {});
  }, [draftKey]);

  useEffect(
    () => () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    },
    [],
  );

  // ── Typing ─────────────────────────────────────────────────
  const handleDraftChange = (text: string) => {
    setDraft(text);
    persistDraft(text);
    if (text.length > 0) {
      onTypingStart();
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => onTypingStop(), TYPING_STOP_MS);
    } else {
      onTypingStop();
    }
  };

  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setSelection(e.nativeEvent.selection);
  };

  // Cursor-position-aware emoji insertion.
  const insertEmoji = (emoji: string) => {
    const start = selection.start ?? draft.length;
    const end = selection.end ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    handleDraftChange(next);
    const caret = start + emoji.length;
    setSelection({ start: caret, end: caret });
  };

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      const start = selection.start ?? draft.length;
      const end = selection.end ?? draft.length;
      const next = draft.slice(0, start) + text + draft.slice(end);
      handleDraftChange(next);
      const caret = start + text.length;
      setSelection({ start: caret, end: caret });
    },
  }));

  // ── Send text / edit ───────────────────────────────────────
  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      if (editingMessage) {
        await onEditConfirm(editingMessage.id, content);
        onClearEdit();
      } else {
        await onSendText(content, replyTo?.id);
        onClearReply();
      }
      setDraft('');
      clearDraftStorage();
      onTypingStop();
    } catch {
      /* parent surfaces the error; keep the draft so it isn't lost */
    } finally {
      setSending(false);
    }
  };

  // ── Attachments ────────────────────────────────────────────
  const handleGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return showError('Photo permission needed');
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 10,
      quality: 0.85,
    });
    if (!res.canceled && res.assets.length) setPreviewUris(res.assets.map((a) => a.uri));
  };

  const handleCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return showError('Camera permission needed');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    if (asset.type === 'video') await onSendVideo(asset.uri, replyTo?.id);
    else setPreviewUris([asset.uri]);
  };

  const handleVideoLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7 });
    if (!res.canceled && res.assets[0]) await onSendVideo(res.assets[0].uri, replyTo?.id);
  };

  const onPickAttachment = (kind: AttachmentKind) => {
    switch (kind) {
      case 'gallery':
        return handleGallery();
      case 'camera':
        return handleCamera();
      case 'video':
        return handleVideoLibrary();
      case 'document':
        return onSendDocument();
      case 'audio':
        return (onSendAudioFile ?? onSendDocument)();
      case 'location':
        return setLocationOpen(true);
      case 'view_once':
        return onSendViewOnce?.();
      case 'album':
        return onShareAlbum?.();
      case 'templates':
        return onOpenTemplates?.();
      default:
        return undefined;
    }
  };

  const attachExtras: AttachmentKind[] = [
    ...(onSendViewOnce ? (['view_once'] as const) : []),
    ...(onShareAlbum ? (['album'] as const) : []),
  ];

  const handlePreviewSend = async (uris: string[], caption: string) => {
    setPreviewUris(null);
    await onSendImages(uris, caption, replyTo?.id);
    onClearReply();
  };

  // ── Voice recording ────────────────────────────────────────
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
    if (recordCancelled.current || !uri || durationMs < MIN_RECORD_MS) {
      recordCancelled.current = false;
      return;
    }
    await onSendAudio(uri, durationMs, replyTo?.id);
  };

  // ── Mic ↔ Send morph + camera fade (150ms) ─────────────────
  // A single 0→1 value drives all three: the send icon grows in, the mic icon
  // shrinks out, and the in-pill camera collapses its width so the input reflows
  // into the freed space — exactly like WhatsApp.
  const morph = useSharedValue(0);
  useEffect(() => {
    morph.value = withTiming(hasText ? 1 : 0, { duration: 150, easing: Easing.out(Easing.quad) });
  }, [hasText, morph]);
  const sendStyle = useAnimatedStyle(() => ({ opacity: morph.value, transform: [{ scale: morph.value }] }));
  const micStyle = useAnimatedStyle(() => ({ opacity: 1 - morph.value, transform: [{ scale: 1 - morph.value }] }));
  const cameraStyle = useAnimatedStyle(() => ({ width: 40 * (1 - morph.value), opacity: 1 - morph.value }));

  // ── Disabled state ─────────────────────────────────────────
  if (isDisabled) {
    return (
      <View style={[styles.wrapper, styles.disabledWrap, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <Ionicons name="lock-closed-outline" size={16} color={theme.textTertiary} />
        <Text style={[styles.disabledText, { color: theme.textTertiary }]}>
          {disabledMessage ?? "You can't message here"}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      {/* @mention suggestions */}
      {showMentions ? (
        <View style={[styles.mentionPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {mentionResults.map((c) => (
            <Pressable key={c.id} style={styles.mentionRow} onPress={() => insertMention(c)}>
              <Avatar uri={c.avatarUrl ?? null} size={28} />
              <Text style={[styles.mentionName, { color: theme.textPrimary }]}>{c.firstName}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* State bars */}
      {uploadProgress != null ? <UploadProgressBar progress={uploadProgress} /> : null}
      {editingMessage ? <EditBar content={editingMessage.content} onCancel={onClearEdit} /> : null}
      {replyTo && !editingMessage ? (
        <ReplyBar senderName={replyTo.senderName} content={replyTo.content} onCancel={onClearReply} />
      ) : null}

      {/* Input row */}
      {recording ? (
        <View style={styles.composerRow}>
          <VoiceRecorder cancelling={false} />
        </View>
      ) : (
        <View style={styles.composerRow}>
          {/* THE PILL — emoji + input + templates + attachment + camera.
              Everything except the mic/send button lives inside this pill. */}
          <View style={[styles.pill, { backgroundColor: theme.inputBackground }]}>
            <Pressable style={styles.pillIcon} onPress={toggleEmoji} hitSlop={4}>
              <Ionicons name={emojiOpen ? 'keypad-outline' : 'happy-outline'} size={22} color={theme.textSecondary} />
            </Pressable>

            <TextInput
              ref={inputRef}
              style={[styles.pillInput, { color: theme.textPrimary }]}
              value={draft}
              onChangeText={handleDraftChange}
              onSelectionChange={onSelectionChange}
              onFocus={() => setEmojiOpen(false)}
              multiline
              maxLength={4000}
              placeholder={placeholder ?? 'Message…'}
              placeholderTextColor={theme.textTertiary}
            />

            {/* Attachment — always visible */}
            <Pressable style={styles.pillIcon} onPress={() => setAttachOpen(true)} hitSlop={4}>
              <Ionicons name="attach" size={22} color={theme.textSecondary} />
            </Pressable>

            {/* Camera — collapses to width 0 when typing so the input reflows */}
            <Animated.View style={[styles.cameraWrap, cameraStyle]}>
              <Pressable style={styles.pillIcon} onPress={handleCamera} hitSlop={4}>
                <Ionicons name="camera-outline" size={22} color={theme.textSecondary} />
              </Pressable>
            </Animated.View>
          </View>

          {/* MIC / SEND — a fixed circle OUTSIDE the pill. The circle never moves;
              the mic and send icons overlap and cross-fade in place. */}
          <LinearGradient
            colors={theme.gradientWarm}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sendCircle}
          >
            {/* Mic — active when there is no text */}
            <Animated.View style={[styles.sendIconLayer, micStyle]} pointerEvents={hasText ? 'none' : 'auto'}>
              <Pressable
                style={styles.sendIconTouch}
                onLongPress={startRecording}
                onPressOut={stopRecording}
                delayLongPress={200}
                hitSlop={8}
              >
                <Ionicons name="mic" size={22} color="#fff" />
              </Pressable>
            </Animated.View>

            {/* Send — active when there is text */}
            <Animated.View style={[styles.sendIconLayer, sendStyle]} pointerEvents={hasText ? 'auto' : 'none'}>
              <Pressable style={styles.sendIconTouch} onPress={handleSend} disabled={sending} hitSlop={8}>
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name={editingMessage ? 'checkmark' : 'arrow-up'} size={22} color="#fff" />
                )}
              </Pressable>
            </Animated.View>
          </LinearGradient>
        </View>
      )}

      {/* Emoji panel — sized to the keyboard it replaces */}
      {emojiOpen ? <EmojiPicker onSelect={insertEmoji} height={keyboardHeight > 0 ? keyboardHeight : undefined} /> : null}

      {/* Sheets / modals */}
      <AttachmentSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPick={onPickAttachment}
        onGifSelected={onSendGif}
        extras={attachExtras}
        canUseTemplates={canUseTemplates}
      />
      <LocationPicker
        visible={locationOpen}
        onClose={() => setLocationOpen(false)}
        onSendLocation={onSendLocation}
      />
      <ImagePreview
        visible={previewUris != null}
        uris={previewUris ?? []}
        onCancel={() => setPreviewUris(null)}
        onSend={handlePreviewSend}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { borderTopWidth: StyleSheet.hairlineWidth },
  // Row holding the pill + the mic/send circle. flex-end keeps every icon and the
  // send circle anchored to the BOTTOM as the input grows upward on multiline.
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
    minHeight: 44,
  },
  pillIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // Wraps the camera so its width can animate to 0 without clipping the glyph.
  cameraWrap: { height: 40, justifyContent: 'flex-end', overflow: 'hidden', flexShrink: 0 },
  pillInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingHorizontal: 4,
    // Nudge single-line text onto the same baseline as the 40px icon centers.
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    alignSelf: 'flex-end',
  },
  sendCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // Mic and send both fill the circle and overlap; only one is interactive at a time.
  sendIconLayer: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendIconTouch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabledWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  disabledText: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },
  mentionPanel: { borderTopWidth: StyleSheet.hairlineWidth, maxHeight: 220 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  mentionName: { fontSize: FontSize.md, fontFamily: FontFamily.medium },
});
