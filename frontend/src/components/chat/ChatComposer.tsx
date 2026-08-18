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
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, withSpring, Easing, runOnJS, interpolate, Extrapolation, FadeInDown, FadeOutDown } from 'react-native-reanimated';
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
import { resampleAmplitudes } from '../../lib/audioAmplitude';

const DRAFT_DEBOUNCE_MS = 500;
const TYPING_STOP_MS = 2000;
const MIN_RECORD_MS = 1000;
// Number of live waveform samples retained while recording (one bar each).
const WAVE_SAMPLES = 28;
// Number of amplitude samples persisted with the sent clip (resampled from the
// full recording) for accurate playback waveforms — independent of playback bar count.
const STORED_AMPLITUDE_COUNT = 40;
// Dev-only voice-recording trace. Reproduce the "recording only starts after
// multiple attempts / lock / cancel don't work" reports on a physical device and
// read these lines to see the exact point the lifecycle diverges (gesture fired?
// permission? record() started? isRecording at stop? uri/duration?).
const vlog = (...a: unknown[]) => {
  if (__DEV__) console.log('[voice]', ...a);
};
// Horizontal slide-left past this cancels the in-flight recording; vertical
// slide-up past this locks it (finger can then release and recording continues).
const CANCEL_DX = -80;
const LOCK_DY = -60;

type RecordState = 'idle' | 'recording' | 'locked';

export interface ChatComposerProps {
  /** Exactly one of these identifies the thread — used for per-thread draft storage. */
  conversationId?: string;
  roomId?: string;

  replyTo?: {
    id: string;
    senderName: string;
    content: string;
    /** Drives the ReplyBar's thumbnail/icon — matches the sent-message quote preview. */
    kind?: 'image' | 'voice' | 'text';
    thumbUrl?: string | null;
  } | null;
  editingMessage?: { id: string; content: string } | null;
  onClearReply: () => void;
  onClearEdit: () => void;

  // Send handlers — the PARENT owns the actual upload + API send (inbox uses GCS,
  // rooms use R2), so the composer hands back local URIs / raw values.
  onSendText: (content: string, replyToId?: string) => Promise<void>;
  onSendImages: (uris: string[], caption: string, replyToId?: string) => Promise<void>;
  /**
   * `durationMs` comes from the picker asset — it is the only place the clip
   * length is available without decoding the file ourselves.
   */
  onSendVideo: (uri: string, replyToId?: string, durationMs?: number | null) => Promise<void>;
  onSendAudio: (uri: string, durationMs: number, replyToId?: string, amplitudes?: number[]) => Promise<void>;
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
  // Voice recording: idle → recording → (locked). `cancelling` is a live flag
  // while the finger is dragged left past the cancel threshold.
  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [cancelling, setCancelling] = useState(false);
  const [sending, setSending] = useState(false);
  // Live mic amplitudes (0..1) sampled from the recorder's metering while
  // recording — drives the real waveform in the overlay (F58/F60). Last N samples.
  const [amplitudes, setAmplitudes] = useState<number[]>([]);
  // Every metering sample for the CURRENT clip (unbounded, unlike `amplitudes`
  // above which keeps only the last WAVE_SAMPLES for the live overlay) — resampled
  // and persisted with the sent message so playback shows the real waveform.
  const fullAmplitudesRef = useRef<number[]>([]);

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  // isMeteringEnabled surfaces getStatus().metering (dB) so the waveform reflects
  // real mic amplitude instead of random bars.
  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const holdingRef = useRef(false);
  const recordCancelled = useRef(false);
  const lockedRef = useRef(false);
  // Wall-clock start of the current recording. expo-audio's getStatus().durationMillis
  // reads 0 once stop() has resolved, so we time the clip ourselves.
  const recordStartRef = useRef(0);
  // UI-thread flags mirroring record/lock state so the pan worklet can read them
  // without hopping to JS on every frame. `isRecordingSV` gates the pan entirely:
  // without it the pan fired lock/cancel on stray touches before a hold even
  // started, which flipped the "release to cancel" hint on when nothing was
  // recording.
  const isLockedSV = useSharedValue(false);
  const isRecordingSV = useSharedValue(false);
  // Live pan translation while recording. Drives the cancel/lock hints so they
  // TRACK THE FINGER instead of hard-cutting at their thresholds (F8).
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const isRecording = recordState !== 'idle';

  // Poll mic metering (dB) while recording and normalise to 0..1, keeping the
  // last WAVE_SAMPLES so the overlay renders a live, real waveform (F60).
  useEffect(() => {
    if (recordState !== 'recording' && recordState !== 'locked') return;
    const id = setInterval(() => {
      try {
        const metering = audioRecorder.getStatus().metering;
        if (typeof metering === 'number') {
          // -60dB (near silence) → 0, 0dB (loud) → 1.
          const normalized = Math.max(0, Math.min(1, (metering + 60) / 60));
          setAmplitudes((prev) => [...prev.slice(-(WAVE_SAMPLES - 1)), normalized]);
          fullAmplitudesRef.current.push(normalized);
        }
      } catch {
        /* recorder not ready yet */
      }
    }, 100);
    return () => clearInterval(id);
  }, [recordState, audioRecorder]);

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

  // Dismiss the keyboard when the composer unmounts (e.g. user navigates back
  // to Inbox while the input is still focused) — otherwise the OS keyboard
  // stays up and the resize/collapse animation plays over whatever screen is
  // now on top, showing as a stray gap that never settles.
  useEffect(() => {
    return () => Keyboard.dismiss();
  }, []);

  // Tapping the emoji button swaps the keyboard for the emoji panel (and back),
  // rather than stacking the panel below an open keyboard. The keyboard is
  // dismissed first and the panel mounts only after it has fully left, so the
  // two surfaces never fight the same layout animation at once.
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
    playSendFeedback();
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
    if (asset.type === 'video') await onSendVideo(asset.uri, replyTo?.id, asset.duration);
    else setPreviewUris([asset.uri]);
  };

  const handleVideoLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7 });
    if (!res.canceled && res.assets[0]) await onSendVideo(res.assets[0].uri, replyTo?.id, res.assets[0].duration);
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

  // ── Voice recording (WhatsApp-style hold / slide-cancel / slide-lock) ──────
  // The gesture target (the mic circle) stays mounted for the whole recording so
  // the release event is never lost to an unmount mid-hold.
  const resetRecordFlags = () => {
    holdingRef.current = false;
    recordCancelled.current = false;
    lockedRef.current = false;
    isLockedSV.value = false;
    isRecordingSV.value = false;
  };

  const startRecording = async () => {
    vlog('gesture: longPress onStart → startRecording');
    holdingRef.current = true;
    recordCancelled.current = false;
    lockedRef.current = false;
    isLockedSV.value = false;
    panX.value = 0;
    panY.value = 0;
    setCancelling(false);
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      vlog('permission granted:', perm.granted, '| holdingRef after perm:', holdingRef.current);
      if (!perm.granted) {
        showError('Microphone permission needed');
        resetRecordFlags();
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      try {
        await audioRecorder.prepareToRecordAsync();
      } catch (e) {
        // "AudioRecorder has already been prepared" — a previous session wasn't
        // released before this hold. The recorder is still usable, so swallow it
        // and go straight to record(); a genuine failure surfaces on record().
        vlog('prepare warning (continuing):', e instanceof Error ? e.message : String(e));
      }
      // The finger may have lifted while we were preparing — bail cleanly.
      if (!holdingRef.current) {
        vlog('BAILED: finger lifted during prepare (holdingRef=false) — no recording started');
        await audioRecorder.stop().catch(() => {});
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        return;
      }
      audioRecorder.record();
      recordStartRef.current = Date.now();
      isRecordingSV.value = true;
      setAmplitudes([]); // fresh waveform for this clip
      fullAmplitudesRef.current = [];
      vlog('record() called | isRecording:', audioRecorder.isRecording);
      setRecordState('recording');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch (e) {
      vlog('EXCEPTION in startRecording:', e instanceof Error ? e.message : String(e));
      showError('Could not start recording');
      resetRecordFlags();
      setRecordState('idle');
    }
  };

  // Finger dragged up past the lock threshold — keep recording after release.
  const lockRecording = () => {
    vlog('gesture: pan → lockRecording | lockedRef:', lockedRef.current, '| holdingRef:', holdingRef.current);
    if (lockedRef.current || !holdingRef.current) return;
    lockedRef.current = true;
    isLockedSV.value = true;
    setCancelling(false);
    setRecordState('locked');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
  };

  // Toggle the live "release to cancel" hint as the finger crosses the threshold.
  const updateCancelling = (next: boolean) => {
    if (lockedRef.current || !holdingRef.current) return;
    setCancelling((prev) => (prev === next ? prev : next));
    recordCancelled.current = next;
  };

  // Stop the recorder and hand the clip to the parent (unless too short).
  const stopAndSend = async () => {
    vlog('stopAndSend | isRecording:', audioRecorder.isRecording, '| cancelled:', recordCancelled.current);
    holdingRef.current = false;
    if (!audioRecorder.isRecording) {
      vlog('stopAndSend BAILED: recorder was not recording (record() never actually started) — nothing sent');
      resetRecordFlags();
      setCancelling(false);
      setRecordState('idle');
      return;
    }
    setRecordState('idle');
    // Duration must be captured from our own start timestamp: expo-audio's
    // getStatus().durationMillis returns 0 after stop() resolves, which was
    // discarding every clip as "under MIN_RECORD_MS".
    const durationMs = recordStartRef.current ? Date.now() - recordStartRef.current : 0;
    let uri: string | null = null;
    try {
      await audioRecorder.stop();
      uri = audioRecorder.uri;
    } catch {
      /* already stopped */
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const cancelled = recordCancelled.current;
    resetRecordFlags();
    setCancelling(false);
    vlog('stop result | uri:', uri, '| durationMs:', durationMs, '| cancelled:', cancelled);
    if (cancelled || !uri || durationMs < MIN_RECORD_MS) {
      vlog('NOT sending (cancelled / no uri / under', MIN_RECORD_MS, 'ms)');
      return;
    }
    const storedAmplitudes = resampleAmplitudes(fullAmplitudesRef.current, STORED_AMPLITUDE_COUNT);
    await onSendAudio(uri, durationMs, replyTo?.id, storedAmplitudes);
  };

  // Discard the recording without sending.
  const cancelRecording = async () => {
    holdingRef.current = false;
    setRecordState('idle');
    setCancelling(false);
    try {
      if (audioRecorder.isRecording) await audioRecorder.stop();
    } catch {
      /* already stopped */
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    resetRecordFlags();
    // Warning notification — the recording was discarded / action undone (F50 map).
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  };

  // Release of the hold: in locked mode keep recording; otherwise cancel-or-send.
  const onHoldRelease = () => {
    vlog('gesture: longPress onEnd → onHoldRelease | locked:', lockedRef.current, '| cancelled:', recordCancelled.current);
    if (lockedRef.current) return;
    if (recordCancelled.current) cancelRecording();
    else stopAndSend();
  };

  // Hold-to-record with slide-left-to-cancel and slide-up-to-lock. A LongPress
  // starts/ends the hold; a simultaneous Pan reads the drag for cancel/lock.
  // Disabled in send-mode (there is text) so a tap/long-press on the send arrow
  // never starts a recording.
  const holdGesture = Gesture.LongPress()
    .enabled(!hasText)
    .minDuration(200)
    .maxDistance(10000)
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      runOnJS(startRecording)();
    })
    .onEnd(() => {
      runOnJS(onHoldRelease)();
    });

  const dragGesture = Gesture.Pan()
    .enabled(!hasText)
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onUpdate((e) => {
      // Only react once a recording is actually in progress and not yet locked —
      // otherwise stray touches on the mic flip the cancel hint on spuriously.
      if (!isRecordingSV.value || isLockedSV.value) return;
      // Mirror the drag onto the UI thread every frame so the hints can follow
      // the finger without a JS round-trip.
      panX.value = Math.min(0, e.translationX);
      panY.value = Math.min(0, e.translationY);
      if (e.translationY < LOCK_DY) {
        runOnJS(lockRecording)();
        return;
      }
      runOnJS(updateCancelling)(e.translationX < CANCEL_DX);
    })
    .onFinalize(() => {
      panX.value = 0;
      panY.value = 0;
    });

  // Lock affordance: fades up and rides upward with the finger as it approaches
  // the lock threshold, rather than sitting there statically.
  const lockHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(panY.value, [0, -30, -60], [0.45, 0.75, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(panY.value, [0, -60], [0, -20], Extrapolation.CLAMP) }],
  }));

  const micGesture = Gesture.Simultaneous(holdGesture, dragGesture);

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

  // ── Send-press feedback (F30) ──────────────────────────────
  // A quick 1 → 0.85 → 1 spring pop on the arrow plus a brief white flash over the
  // gradient circle ("brand → lighter → brand") so a tap always registers.
  const sendPop = useSharedValue(1);
  const sendPopStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendPop.value }] }));
  const sendFlash = useSharedValue(0);
  const sendFlashStyle = useAnimatedStyle(() => ({ opacity: sendFlash.value }));
  const playSendFeedback = () => {
    // Medium impact on send — the send action is a deliberate, meaningful gesture
    // (F50 haptic map). Shared by 1:1 chat and rooms (both use this composer).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    sendPop.value = withSequence(withTiming(0.85, { duration: 75 }), withSpring(1, { damping: 12, stiffness: 300 }));
    sendFlash.value = withSequence(withTiming(0.28, { duration: 80 }), withTiming(0, { duration: 140 }));
  };

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

      {/* State bars — slide/fade in and out (WhatsApp-style, no hard cut) */}
      {uploadProgress != null ? <UploadProgressBar progress={uploadProgress} /> : null}
      {editingMessage ? (
        <Animated.View entering={FadeInDown.duration(150)} exiting={FadeOutDown.duration(120)}>
          <EditBar content={editingMessage.content} onCancel={onClearEdit} />
        </Animated.View>
      ) : null}
      {replyTo && !editingMessage ? (
        <Animated.View entering={FadeInDown.duration(150)} exiting={FadeOutDown.duration(120)}>
          <ReplyBar
            senderName={replyTo.senderName}
            content={replyTo.content}
            kind={replyTo.kind}
            thumbUrl={replyTo.thumbUrl}
            onCancel={onClearReply}
          />
        </Animated.View>
      ) : null}

      {/* Input row — the pill (or the recording overlay) on the left, and a
          FIXED mic/send circle on the right that stays mounted throughout a
          recording so the release gesture is never lost to an unmount. */}
      <View style={styles.composerRow}>
        {isRecording ? (
          <VoiceRecorder cancelling={cancelling} locked={recordState === 'locked'} amplitudes={amplitudes} panX={panX} />
        ) : (
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
        )}

        {/* Floating lock affordance above the circle while (unlocked) recording */}
        {recordState === 'recording' ? (
          <Animated.View style={[styles.lockHint, lockHintStyle]} pointerEvents="none">
            <Ionicons name="lock-open-outline" size={16} color={theme.textSecondary} />
            <Ionicons name="chevron-up" size={12} color={theme.textTertiary} />
          </Animated.View>
        ) : null}

        {recordState === 'locked' ? (
          // Locked: finger released, recording continues — tap to stop + send.
          <Pressable style={styles.sendIconTouch} onPress={stopAndSend} hitSlop={8}>
            <LinearGradient
              colors={theme.gradientWarm}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendCircle}
            >
              <Ionicons name="stop" size={20} color="#fff" />
            </LinearGradient>
          </Pressable>
        ) : (
          <GestureDetector gesture={micGesture}>
            <LinearGradient
              colors={theme.gradientWarm}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendCircle}
            >
              {/* Brief white flash over the gradient on send (F30) */}
              <Animated.View pointerEvents="none" style={[styles.sendFlash, sendFlashStyle]} />

              {/* Mic — active when there is no text (gesture-driven hold-to-record) */}
              <Animated.View style={[styles.sendIconLayer, micStyle]} pointerEvents="none">
                <Ionicons name="mic" size={22} color="#fff" />
              </Animated.View>

              {/* Send — active when there is text */}
              <Animated.View style={[styles.sendIconLayer, sendStyle]} pointerEvents={hasText ? 'auto' : 'none'}>
                <Pressable style={styles.sendIconTouch} onPress={handleSend} disabled={sending} hitSlop={8}>
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Animated.View style={sendPopStyle}>
                      <Ionicons name={editingMessage ? 'checkmark' : 'arrow-up'} size={22} color="#fff" />
                    </Animated.View>
                  )}
                </Pressable>
              </Animated.View>
            </LinearGradient>
          </GestureDetector>
        )}
      </View>

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
  sendCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  sendFlash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderRadius: 22 },
  lockHint: { position: 'absolute', right: 12, bottom: 60, alignItems: 'center', gap: 1 },
  // Mic and send both fill the circle and overlap; only one is interactive at a time.
  sendIconLayer: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendIconTouch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabledWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  disabledText: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },
  mentionPanel: { borderTopWidth: StyleSheet.hairlineWidth, maxHeight: 220 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  mentionName: { fontSize: FontSize.md, fontFamily: FontFamily.medium },
});
