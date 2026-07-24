import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, BackHandler } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme';
import { updateCall } from '../../src/services/api';
import { connectSocket } from '../../src/services/socket';
import { useAuthStore } from '../../src/store/authStore';
import {
  isAgoraAvailable,
  RtcSurfaceView,
  createCallEngine,
  joinChannel,
  setMuted,
  setCameraEnabled,
  switchCamera,
  setSpeaker,
  leaveAndDestroy,
} from '../../src/services/agora';

export default function CallScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const me = useAuthStore((s) => s.user);
  const params = useLocalSearchParams<{
    id: string;
    channel?: string;
    token?: string;
    type?: string;
    peerName?: string;
    peerPhoto?: string;
  }>();
  const isVideo = params.type === 'video';

  const [joined, setJoined] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [muted, setMutedState] = useState(false);
  const [cameraOn, setCameraOn] = useState(isVideo);
  const [speakerOn, setSpeakerOn] = useState(isVideo);
  const [limitReached, setLimitReached] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Set true when the Agora channel can't be joined (bad/expired token, network,
  // missing credentials) so the user gets a way out instead of a stuck screen.
  const [connectError, setConnectError] = useState(false);
  // Bumped by "Try Again" to re-run the join effect from scratch.
  const [attempt, setAttempt] = useState(0);
  const ended = useRef(false);

  const missingConfig = !params.token || !params.channel;

  // Agora engine lifecycle. Re-runs on retry (attempt).
  useEffect(() => {
    if (!isAgoraAvailable || missingConfig) return;
    const engine = createCallEngine(isVideo, {
      onJoinSuccess: () => setJoined(true),
      onUserJoined: (uid) => setRemoteUid(uid),
      onUserOffline: () => setRemoteUid(null),
    });
    if (engine) {
      joinChannel(params.token!, params.channel!, isVideo);
      if (isVideo) setSpeaker(true);
    }
    return () => leaveAndDestroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token, params.channel, isVideo, attempt]);

  // Connect timeout: if the channel isn't joined within 15s, surface an error
  // state (Try Again / End Call) rather than leaving the user on "Connecting…".
  useEffect(() => {
    if (joined || connectError || ended.current) return;
    // Missing token/channel can never connect — fail fast.
    if (missingConfig) {
      setConnectError(true);
      return;
    }
    if (!isAgoraAvailable) return; // distinct "unavailable" copy already shown
    const t = setTimeout(() => {
      if (!ended.current) setConnectError(true);
    }, 15000);
    return () => clearTimeout(t);
  }, [joined, connectError, missingConfig, attempt]);

  // Error haptic when the call fails to connect (F50 map: call failed → Error).
  useEffect(() => {
    if (connectError) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, [connectError]);

  // Elapsed timer.
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [joined]);

  // Free-tier countdown derived from authStore callLimits (null for paid plans).
  const callLimits = me?.callLimits ?? null;
  const remainingMinutes = callLimits
    ? isVideo
      ? callLimits.videoMinutesLimit - callLimits.videoMinutesUsed
      : callLimits.audioMinutesLimit - callLimits.audioMinutesUsed
    : null;
  const allowedSec = remainingMinutes != null ? Math.max(0, remainingMinutes) * 60 : null;
  const remainingSec = allowedSec != null ? Math.max(0, allowedSec - elapsed) : null;

  // When the free-tier countdown hits zero, end the call + show the upgrade modal.
  useEffect(() => {
    if (remainingSec === 0 && joined && !limitReached) {
      setLimitReached(true);
      finish('normal', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec, joined, limitReached]);

  // Server-side end (e.g. free-tier time limit reached).
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const socket = await connectSocket();
      if (!socket) return;
      const onEnd = (p: any) => {
        if (p.callId && p.callId !== params.id) return;
        if (p.endReason === 'time_limit_reached') setLimitReached(true);
        finish('normal', false);
      };
      socket.on('call:end', onEnd);
      cleanup = () => socket.off('call:end', onEnd);
    })();
    return () => cleanup();
  }, [params.id]);

  const finish = async (endReason: 'normal' | 'error' = 'normal', goBack = true) => {
    if (ended.current) return;
    ended.current = true;
    try {
      await updateCall(params.id, 'ended', endReason);
    } catch {
      /* ignore */
    }
    leaveAndDestroy();
    if (goBack && !limitReached) router.back();
  };

  // Retry a failed connection: tear down, reset state, re-run the join effect.
  const retryConnect = () => {
    leaveAndDestroy();
    setConnectError(false);
    setJoined(false);
    setRemoteUid(null);
    setElapsed(0);
    setAttempt((a) => a + 1);
  };

  // Android hardware back must always exit the call — never trap the user.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish('normal');
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const toggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  };
  const toggleCamera = () => {
    const next = !cameraOn;
    setCameraOn(next);
    setCameraEnabled(next);
  };
  const toggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    setSpeaker(next);
  };

  return (
    <View style={[styles.root, { backgroundColor: '#000' }]}>
      {/* Remote video fills the screen for video calls */}
      {isVideo && isAgoraAvailable && RtcSurfaceView && remoteUid != null ? (
        <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid: remoteUid }} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          {params.peerPhoto ? (
            <Image source={{ uri: params.peerPhoto }} style={styles.avatar} contentFit="cover" transition={120} cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.backgroundTertiary, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={64} color={theme.textTertiary} />
            </View>
          )}
        </View>
      )}

      {/* Local preview (video only) */}
      {isVideo && isAgoraAvailable && RtcSurfaceView && cameraOn && (
        <View style={styles.localPreview}>
          <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid: 0 }} />
        </View>
      )}

      <View style={styles.topInfo}>
        <Text style={styles.peerName}>{params.peerName || 'Calling…'}</Text>
        <Text style={styles.status}>
          {limitReached
            ? 'Daily call limit reached'
            : connectError
              ? 'Call failed to connect'
              : !isAgoraAvailable
                ? 'Calls unavailable on this device'
                : joined
                  ? (remoteUid != null ? fmt(elapsed) : 'Ringing…')
                  : 'Connecting…'}
        </Text>
        {remainingSec != null && !limitReached && (
          <Text style={styles.freeNote}>{fmt(remainingSec)} remaining</Text>
        )}
      </View>

      {limitReached ? (
        <View style={styles.limitCard}>
          <Text style={styles.limitTitle}>Daily call limit reached</Text>
          <Text style={styles.limitBody}>Upgrade for unlimited calls.</Text>
          <Pressable
            style={[styles.limitCta, { backgroundColor: theme.brand }]}
            onPress={() => {
              router.back();
              router.push('/(tabs)/store');
            }}
          >
            <Text style={styles.limitCtaText}>See plans</Text>
          </Pressable>
          <Pressable style={styles.limitClose} onPress={() => router.back()}>
            <Text style={styles.limitCloseText}>Close</Text>
          </Pressable>
        </View>
      ) : connectError ? (
        <View style={styles.limitCard}>
          <Text style={styles.limitTitle}>Call failed to connect</Text>
          <Text style={styles.limitBody}>
            {missingConfig
              ? 'This call is missing its connection details.'
              : 'Check your connection and try again.'}
          </Text>
          <Pressable style={[styles.limitCta, { backgroundColor: theme.brand }]} onPress={retryConnect}>
            <Text style={styles.limitCtaText}>Try Again</Text>
          </Pressable>
          <Pressable style={styles.limitClose} onPress={() => finish('error')}>
            <Text style={styles.limitCloseText}>End Call</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.controls}>
          <Control icon={muted ? 'mic-off' : 'mic'} active={muted} onPress={toggleMute} bg={theme.surfaceElevated} />
          {isVideo && (
            <>
              <Control icon={cameraOn ? 'videocam' : 'videocam-off'} active={!cameraOn} onPress={toggleCamera} bg={theme.surfaceElevated} />
              <Control icon="camera-reverse" active={false} onPress={switchCamera} bg={theme.surfaceElevated} />
            </>
          )}
          {!isVideo && (
            <Control icon={speakerOn ? 'volume-high' : 'volume-medium'} active={speakerOn} onPress={toggleSpeaker} bg={theme.surfaceElevated} />
          )}
          <Pressable style={[styles.control, { backgroundColor: theme.error }]} onPress={() => finish('normal')}>
            <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Control({
  icon,
  active,
  onPress,
  bg,
}: {
  icon: any;
  active: boolean;
  onPress: () => void;
  bg: string;
}) {
  return (
    <Pressable style={[styles.control, { backgroundColor: active ? '#fff' : bg }]} onPress={onPress}>
      <Ionicons name={icon} size={24} color={active ? '#000' : '#fff'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 130, height: 130, borderRadius: 65 },
  localPreview: { position: 'absolute', top: 60, right: 16, width: 110, height: 160, borderRadius: 12, overflow: 'hidden', backgroundColor: '#222' },
  topInfo: { position: 'absolute', top: 80, left: 0, right: 0, alignItems: 'center', gap: 6 },
  peerName: { color: '#fff', fontSize: 26, fontWeight: '800' },
  status: { color: '#ddd', fontSize: 15 },
  freeNote: { color: '#aaa', fontSize: 12, marginTop: 4 },
  controls: { position: 'absolute', bottom: 50, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 18 },
  control: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  limitCard: { position: 'absolute', bottom: 60, left: 24, right: 24, backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, alignItems: 'center' },
  limitTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  limitBody: { color: '#bbb', fontSize: 14, marginTop: 6 },
  limitCta: { height: 46, borderRadius: 999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  limitCtaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  limitClose: { marginTop: 12 },
  limitCloseText: { color: '#888', fontSize: 14 },
});
