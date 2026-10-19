import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, BackHandler, Linking, AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme';
import { updateCall, updateRoomCall, renewCallToken, renewRoomCallToken } from '../../src/services/api';
import type { RoomCallParticipantCard } from '../../src/services/api';
import { connectSocket } from '../../src/services/socket';
import { useAuthStore } from '../../src/store/authStore';
import {
  isAgoraAvailable,
  RtcSurfaceView,
  createCallEngine,
  joinChannel,
  requestCallPermissions,
  setMuted,
  setCameraEnabled,
  switchCamera,
  setSpeaker,
  leaveAndDestroy,
  renewToken,
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
    // Present only for a Dating Room group call — switches this screen into
    // multi-participant mode instead of the 1:1 peer view.
    roomId?: string;
    roomName?: string;
    callId?: string;
    initiatorId?: string;
    // JSON-encoded RoomCallParticipantCard[] — initial roster for the audio-mode avatar row.
    participants?: string;
  }>();
  const isVideo = params.type === 'video';
  const isGroup = !!params.roomId && !!params.callId;

  const [joined, setJoined] = useState(false);
  // 1:1 calls track a single remote peer; group calls track every connected uid.
  const [remoteUids, setRemoteUids] = useState<number[]>([]);
  const [participants, setParticipants] = useState<RoomCallParticipantCard[]>(() => {
    try {
      return params.participants ? (JSON.parse(params.participants) as RoomCallParticipantCard[]) : [];
    } catch {
      return [];
    }
  });
  const [muted, setMutedState] = useState(false);
  const [cameraOn, setCameraOn] = useState(isVideo);
  const [speakerOn, setSpeakerOn] = useState(isVideo);
  const [limitReached, setLimitReached] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Set true when the Agora channel can't be joined (bad/expired token, network,
  // missing credentials, permissions) so the user gets a way out instead of a stuck screen.
  const [connectError, setConnectError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  // Bumped by "Try Again" to re-run the join effect from scratch.
  const [attempt, setAttempt] = useState(0);
  const ended = useRef(false);

  const missingConfig = !params.token || !params.channel;

  // Network connectivity listener for network switch and disconnect events
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      console.log(`[Agora Network Status]: Connected: ${state.isConnected}, Reachable: ${state.isInternetReachable}, Type: ${state.type}`);
      setIsOffline(offline);
      if (offline) {
        console.warn('[Agora Network]: Device network offline during call');
      } else {
        console.log('[Agora Network]: Device network online');
      }
    });
    return () => unsub();
  }, []);

  // App background / foreground lifecycle listener
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      console.log(`[Agora Lifecycle]: App state changed to ${nextState}`);
      if (nextState === 'active') {
        // If the user went to Settings to grant permissions and returned, auto-check and reconnect
        if (permissionDenied) {
          const granted = await requestCallPermissions(isVideo);
          if (granted) {
            console.log('[Agora Permissions]: Permissions granted in OS settings after returning to app');
            setPermissionDenied(false);
            setConnectError(false);
            setErrorMessage(null);
            retryConnect();
          }
        }
      }
    });
    return () => sub.remove();
  }, [permissionDenied, isVideo]);

  // Agora engine lifecycle. Re-runs on retry (attempt). Works unchanged for
  // group calls — Agora hands us one onUserJoined/onUserOffline per remote uid
  // regardless of how many participants share the channel.
  useEffect(() => {
    if (!isAgoraAvailable) return;
    if (missingConfig) {
      console.error('[Agora Config]: Missing token or channel name', { token: !!params.token, channel: !!params.channel });
      setErrorMessage('Call is missing token or channel connection details.');
      setConnectError(true);
      return;
    }

    let isCancelled = false;

    const refreshChannelToken = async () => {
      if (isCancelled || !params.id) return;
      try {
        console.log('[Agora] Token renewal requested from backend...');
        const res = isGroup && params.roomId && params.callId
          ? await renewRoomCallToken(params.roomId, params.callId)
          : await renewCallToken(params.id);
        if (res.agoraToken) {
          renewToken(res.agoraToken);
          console.log('[Agora] Token renewed successfully');
        }
      } catch (e) {
        console.error('[Agora] Token refresh failed:', e);
        setErrorMessage('Call token expired. Please retry.');
        setConnectError(true);
      }
    };

    (async () => {
      // Step 1: Prompt for runtime permissions before initializing Agora
      const hasPermission = await requestCallPermissions(isVideo);
      if (isCancelled) return;
      if (!hasPermission) {
        setPermissionDenied(true);
        setErrorMessage(
          isVideo
            ? 'Camera and Microphone permissions are required for video calls.'
            : 'Microphone permission is required for audio calls.'
        );
        setConnectError(true);
        return;
      }

      // Step 2: Initialize engine and attach observable event handlers
      const engine = createCallEngine(isVideo, {
        onJoinSuccess: (connection, elapsedMs) => {
          if (isCancelled) return;
          console.log(`[Agora Joined Successfully]: Channel ${connection?.channelId ?? params.channel}, UID: ${connection?.localUid ?? 0}, elapsed: ${elapsedMs}ms`);
          setJoined(true);
          setReconnecting(false);
          setConnectError(false);
          setErrorMessage(null);
        },
        onRejoinSuccess: (connection, elapsedMs) => {
          if (isCancelled) return;
          console.log(`[Agora Rejoined Successfully]: Channel ${connection?.channelId ?? params.channel}, UID: ${connection?.localUid ?? 0}, elapsed: ${elapsedMs}ms`);
          setJoined(true);
          setReconnecting(false);
          setConnectError(false);
          setErrorMessage(null);
        },
        onConnectionLost: () => {
          if (isCancelled) return;
          console.warn('[Agora Connection Lost]: Lost connection to channel. Reconnecting…');
          setReconnecting(true);
        },
        onUserJoined: (uid) => {
          if (isCancelled) return;
          console.log(`[Agora Remote User Joined]: UID ${uid}`);
          setRemoteUids((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
        },
        onUserOffline: (uid: number, reason?: any) => {
          if (isCancelled) return;
          console.log(`[Agora Remote User Offline]: UID ${uid}, reason: ${reason}`);
          setRemoteUids((prev) => prev.filter((u) => u !== uid));
        },
        onError: (errCode, msg) => {
          if (isCancelled) return;
          console.error(`[Agora Error ${errCode}]: ${msg}`);
          if (errCode === 109 || errCode === 110) {
            setErrorMessage(`Token error (${errCode}): Token is invalid or expired. Check backend Agora credentials.`);
          } else if (errCode === 9 || errCode === 1014) {
            setErrorMessage(`Hardware error (${errCode}): Device access or permission denied.`);
            setPermissionDenied(true);
          } else {
            setErrorMessage(`Agora error (${errCode}): ${msg || 'Call connection failed'}`);
          }
          setConnectError(true);
        },
        onConnectionStateChanged: (state, reason) => {
          if (isCancelled) return;
          console.log(`[Agora Connection State]: ${state}, Reason: ${reason}`);
          if (state === 4) {
            // Reconnecting
            setReconnecting(true);
          } else if (state === 3) {
            // Connected
            setReconnecting(false);
            if (errorMessage?.includes('Reconnecting')) {
              setErrorMessage(null);
            }
          } else if (state === 5) {
            // Failed
            setReconnecting(false);
            let reasonText = `Connection failed (code ${reason}). Check network connection.`;
            if (reason === 6) reasonText = 'Invalid Agora App ID (code 6). Check EXPO_PUBLIC_AGORA_APP_ID.';
            else if (reason === 8) reasonText = 'Invalid Agora Token (code 8). Check backend token generator credentials.';
            else if (reason === 9) reasonText = 'Agora Token Expired (code 9).';
            else if (reason === 14) reasonText = 'Connection timed out (code 14). Network connection lost.';
            setErrorMessage(reasonText);
            setConnectError(true);
          }
        },
        onTokenPrivilegeWillExpire: () => {
          refreshChannelToken();
        },
        onRequestToken: () => {
          refreshChannelToken();
        },
      });

      if (isCancelled) {
        leaveAndDestroy();
        return;
      }

      if (engine) {
        joinChannel(params.token!, params.channel!, isVideo);
        if (isVideo) setSpeaker(true);
      }
    })();

    return () => {
      isCancelled = true;
      leaveAndDestroy();
    };
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
      if (!ended.current) {
        setErrorMessage('Connection timed out after 15 seconds. Please check your network and try again.');
        setConnectError(true);
      }
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

  // Free-tier countdown derived from authStore callLimits — 1:1 calls only;
  // group calls have no per-minute free-tier cap.
  const callLimits = !isGroup ? (me?.callLimits ?? null) : null;
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

  // Server-side end: 1:1 free-tier time limit, or a group call ended by its host / everyone left.
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const socket = await connectSocket();
      if (!socket) return;
      if (isGroup) {
        const onRoomEnd = (p: any) => {
          if (p.callId && p.callId !== params.callId) return;
          finish('normal', false);
        };
        const onJoined = (p: any) => {
          if (p.callId !== params.callId || !p.participant) return;
          setParticipants((prev) => (prev.some((x) => x.id === p.participant.id) ? prev : [...prev, p.participant]));
        };
        const onLeft = (p: any) => {
          if (p.callId !== params.callId) return;
          setParticipants((prev) => prev.filter((x) => x.id !== p.userId));
        };
        socket.on('room:call.end', onRoomEnd);
        socket.on('room:call.participant_joined', onJoined);
        socket.on('room:call.participant_left', onLeft);
        cleanup = () => {
          socket.off('room:call.end', onRoomEnd);
          socket.off('room:call.participant_joined', onJoined);
          socket.off('room:call.participant_left', onLeft);
        };
      } else {
        const onEnd = (p: any) => {
          if (p.callId && p.callId !== params.id) return;
          if (p.endReason === 'time_limit_reached') setLimitReached(true);
          finish('normal', false);
        };
        socket.on('call:end', onEnd);
        cleanup = () => socket.off('call:end', onEnd);
      }
    })();
    return () => cleanup();
  }, [params.id, params.callId, isGroup]);

  const finish = async (endReason: 'normal' | 'error' = 'normal', goBack = true) => {
    if (ended.current) return;
    ended.current = true;
    try {
      if (isGroup) {
        await updateRoomCall(params.roomId!, params.callId!, 'leave');
      } else {
        await updateCall(params.id, 'ended', endReason);
      }
    } catch {
      /* ignore */
    }
    leaveAndDestroy();
    if (goBack && !limitReached) router.back();
  };

  /** Group-call host action: end the call for every participant, not just leave it. */
  const endForEveryone = async () => {
    if (ended.current || !isGroup) return;
    ended.current = true;
    try {
      await updateRoomCall(params.roomId!, params.callId!, 'end');
    } catch {
      /* ignore */
    }
    leaveAndDestroy();
    router.back();
  };

  // Retry a failed connection: tear down, reset state, re-run the join effect.
  const retryConnect = () => {
    leaveAndDestroy();
    setConnectError(false);
    setErrorMessage(null);
    setPermissionDenied(false);
    setJoined(false);
    setRemoteUids([]);
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

  const title = isGroup ? (params.roomName || 'Group Call') : (params.peerName || 'Calling…');
  const statusText = limitReached
    ? 'Daily call limit reached'
    : isOffline
      ? 'No internet connection · Reconnecting…'
      : reconnecting
        ? 'Reconnecting to call…'
        : connectError
          ? (permissionDenied ? 'Permissions required' : 'Call failed to connect')
          : !isAgoraAvailable
            ? 'Calls unavailable on this device'
            : joined
              ? isGroup
                ? `${remoteUids.length + 1} in call · ${fmt(elapsed)}`
                : (remoteUids.length > 0 ? fmt(elapsed) : 'Ringing…')
              : 'Connecting…';

  return (
    <View style={[styles.root, { backgroundColor: '#000' }]}>
      {/* Remote video: single full-screen peer for 1:1, a grid of tiles for group calls */}
      {isVideo && isAgoraAvailable && RtcSurfaceView && !isGroup && remoteUids[0] != null ? (
        <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid: remoteUids[0] }} />
      ) : isVideo && isAgoraAvailable && RtcSurfaceView && isGroup && remoteUids.length > 0 ? (
        <View style={[StyleSheet.absoluteFill, styles.videoGrid]}>
          {remoteUids.map((uid) => (
            <View key={uid} style={[styles.videoTile, { width: remoteUids.length > 1 ? '50%' : '100%' }]}>
              <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid }} />
            </View>
          ))}
        </View>
      ) : isGroup ? (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.avatarRow]}>
          {participants.length === 0 ? (
            <View style={[styles.avatar, { backgroundColor: theme.backgroundTertiary, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="people" size={64} color={theme.textTertiary} />
            </View>
          ) : (
            participants.slice(0, 6).map((p) => (
              <View key={p.id} style={styles.avatarSlot}>
                {p.photo ? (
                  <Image source={{ uri: p.photo }} style={styles.smallAvatar} contentFit="cover" transition={120} cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.smallAvatar, { backgroundColor: theme.backgroundTertiary, alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="person" size={28} color={theme.textTertiary} />
                  </View>
                )}
                {p.name ? <Text style={styles.avatarLabel} numberOfLines={1}>{p.name}</Text> : null}
              </View>
            ))
          )}
        </View>
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
        <Text style={styles.peerName}>{title}</Text>
        <Text style={styles.status}>{statusText}</Text>
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
          <Text style={styles.limitTitle}>
            {permissionDenied ? 'Permissions Required' : 'Call failed to connect'}
          </Text>
          <Text style={styles.limitBody}>
            {errorMessage || (missingConfig
              ? 'This call is missing its connection details.'
              : 'Check your connection and try again.')}
          </Text>
          {permissionDenied ? (
            <View style={styles.permissionActionRow}>
              <Pressable
                style={[styles.limitCta, { backgroundColor: theme.brand, flex: 1, marginTop: 0 }]}
                onPress={() => Linking.openSettings()}
              >
                <Text style={styles.limitCtaText}>Open Settings</Text>
              </Pressable>
              <Pressable
                style={[styles.limitCta, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, borderWidth: 1, flex: 1, marginTop: 0 }]}
                onPress={retryConnect}
              >
                <Text style={styles.limitCtaText}>Try Again</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={[styles.limitCta, { backgroundColor: theme.brand }]} onPress={retryConnect}>
              <Text style={styles.limitCtaText}>Try Again</Text>
            </Pressable>
          )}
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

      {/* Group-call host control: end for everyone, not just leave. */}
      {isGroup && !limitReached && !connectError && me?.id && me.id === params.initiatorId && (
        <Pressable style={styles.endForAllRow} onPress={endForEveryone} hitSlop={8}>
          <Text style={styles.endForAllText}>End call for everyone</Text>
        </Pressable>
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
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingHorizontal: 24 },
  avatarSlot: { alignItems: 'center', width: 80 },
  smallAvatar: { width: 72, height: 72, borderRadius: 36 },
  avatarLabel: { color: '#ddd', fontSize: 12, marginTop: 6, maxWidth: 80, textAlign: 'center' },
  videoGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  videoTile: { height: '50%', backgroundColor: '#111', borderWidth: 0.5, borderColor: '#000' },
  localPreview: { position: 'absolute', top: 60, right: 16, width: 110, height: 160, borderRadius: 12, overflow: 'hidden', backgroundColor: '#222' },
  topInfo: { position: 'absolute', top: 80, left: 0, right: 0, alignItems: 'center', gap: 6 },
  peerName: { color: '#fff', fontSize: 26, fontWeight: '800' },
  status: { color: '#ddd', fontSize: 15 },
  freeNote: { color: '#aaa', fontSize: 12, marginTop: 4 },
  controls: { position: 'absolute', bottom: 50, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 18 },
  control: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  endForAllRow: { position: 'absolute', bottom: 12, left: 0, right: 0, alignItems: 'center' },
  endForAllText: { color: '#888', fontSize: 13 },
  limitCard: { position: 'absolute', bottom: 60, left: 24, right: 24, backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, alignItems: 'center' },
  limitTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  limitBody: { color: '#bbb', fontSize: 14, marginTop: 6 },
  limitCta: { height: 46, borderRadius: 999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  limitCtaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  limitClose: { marginTop: 12 },
  limitCloseText: { color: '#888', fontSize: 14 },
  permissionActionRow: { flexDirection: 'row', gap: 12, marginTop: 16, width: '100%' },
});
