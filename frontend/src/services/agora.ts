import { Platform } from 'react-native';
import type {
  IRtcEngine,
  IRtcEngineEventHandler,
} from 'react-native-agora';

export const AGORA_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? '';

/**
 * react-native-agora is a native module with no web support. We load it via a
 * guarded require so that:
 *  - web bundling (`expo export --platform web`) never resolves native-only code
 *  - a missing native build (Expo Go / unlinked module) surfaces as a warning
 *    instead of crashing the call screen
 *
 * Types come from `import type` above, which is fully erased at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
let rtc: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    rtc = require('react-native-agora');
  } catch (e) {
    console.warn('[Agora] Native module not available — rebuild the app with `npx expo run:android` or `npx expo run:ios`:', e);
  }
}

export const isAgoraAvailable = rtc != null && !!AGORA_APP_ID;

/** The RtcSurfaceView component (null on web). Cast to any for JSX use. */
export const RtcSurfaceView: any = rtc?.RtcSurfaceView ?? null;

let engine: IRtcEngine | null = null;

export interface CallEngineHandlers {
  onUserJoined?: (uid: number) => void;
  onUserOffline?: (uid: number) => void;
  onJoinSuccess?: () => void;
  onError?: (code: number, msg: string) => void;
}

/** Create + initialize the engine, register handlers, set role/profile. */
export function createCallEngine(isVideo: boolean, handlers: CallEngineHandlers): IRtcEngine | null {
  if (!isAgoraAvailable || !rtc) return null;
  engine = rtc.createAgoraRtcEngine();
  if (!engine) return null;

  engine.initialize({
    appId: AGORA_APP_ID,
    channelProfile: rtc.ChannelProfileType.ChannelProfileCommunication,
  });

  const eventHandler: IRtcEngineEventHandler = {
    onJoinChannelSuccess: () => handlers.onJoinSuccess?.(),
    onUserJoined: (_conn: unknown, uid: number) => handlers.onUserJoined?.(uid),
    onUserOffline: (_conn: unknown, uid: number) => handlers.onUserOffline?.(uid),
    onError: (err: number, msg: string) => handlers.onError?.(err, msg),
  };
  engine.registerEventHandler(eventHandler);

  if (isVideo) {
    engine.enableVideo();
    engine.startPreview();
  } else {
    engine.disableVideo();
    engine.enableAudio();
  }
  engine.setClientRole(rtc.ClientRoleType.ClientRoleBroadcaster);
  return engine;
}

export function joinChannel(token: string, channel: string, isVideo: boolean): void {
  if (!engine || !rtc) return;
  engine.joinChannel(token, channel, 0, {
    clientRoleType: rtc.ClientRoleType.ClientRoleBroadcaster,
    publishMicrophoneTrack: true,
    publishCameraTrack: isVideo,
    autoSubscribeAudio: true,
    autoSubscribeVideo: isVideo,
  });
}

export function setMuted(muted: boolean): void {
  engine?.muteLocalAudioStream(muted);
}

export function setCameraEnabled(enabled: boolean): void {
  engine?.muteLocalVideoStream(!enabled);
}

export function switchCamera(): void {
  engine?.switchCamera();
}

export function setSpeaker(on: boolean): void {
  engine?.setEnableSpeakerphone(on);
}

export function leaveAndDestroy(): void {
  if (!engine) return;
  try {
    engine.leaveChannel();
    engine.release();
  } catch {
    /* noop */
  }
  engine = null;
}
