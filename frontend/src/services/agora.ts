import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
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
  onUserOffline?: (uid: number, reason?: any) => void;
  onJoinSuccess?: (connection?: any, elapsed?: number) => void;
  onRejoinSuccess?: (connection?: any, elapsed?: number) => void;
  onError?: (code: number, msg: string) => void;
  onConnectionStateChanged?: (state: any, reason: any) => void;
  onConnectionLost?: () => void;
  onTokenPrivilegeWillExpire?: (token: string) => void;
  onRequestToken?: () => void;
}

function showPermissionAlert(permissionType: string) {
  Alert.alert(
    `${permissionType} Access Required`,
    `Please grant ${permissionType.toLowerCase()} access in your system settings to join the call.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]
  );
}

/**
 * Prompt for runtime camera and microphone permissions before initializing Agora.
 * Android and iOS require explicit runtime grants for hardware audio/video access.
 */
export async function requestCallPermissions(isVideo: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return true;

  try {
    if (Platform.OS === 'android') {
      const permissionsToRequest: any[] = [
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ];
      if (isVideo) {
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      }

      const results = await PermissionsAndroid.requestMultiple(permissionsToRequest);

      const audioGranted =
        results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
      if (!audioGranted) {
        showPermissionAlert('Microphone');
        return false;
      }

      if (isVideo) {
        const cameraGranted =
          results[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
        if (!cameraGranted) {
          showPermissionAlert('Camera');
          return false;
        }
      }

      return true;
    }

    if (Platform.OS === 'ios') {
      const audioStatus = await requestRecordingPermissionsAsync();
      if (!audioStatus.granted) {
        showPermissionAlert('Microphone');
        return false;
      }

      if (isVideo) {
        const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
        if (!cameraStatus.granted) {
          showPermissionAlert('Camera');
          return false;
        }
      }

      return true;
    }
  } catch (err) {
    console.warn('[Agora] Error requesting runtime call permissions:', err);
  }

  return true;
}

/** Create + initialize the engine, register handlers, set role/profile. */
export function createCallEngine(isVideo: boolean, handlers: CallEngineHandlers): IRtcEngine | null {
  if (!isAgoraAvailable || !rtc) {
    console.warn('[Agora] Cannot initialize engine — Agora module unavailable or AGORA_APP_ID missing');
    return null;
  }
  engine = rtc.createAgoraRtcEngine();
  if (!engine) return null;

  engine.initialize({
    appId: AGORA_APP_ID,
    channelProfile: rtc.ChannelProfileType.ChannelProfileCommunication,
  });

  const eventHandler: IRtcEngineEventHandler = {
    onJoinChannelSuccess: (connection: any, elapsed: number) => {
      console.log(`[Agora Joined Successfully]: Channel ${connection?.channelId}, UID: ${connection?.localUid}, elapsed: ${elapsed}ms`);
      handlers.onJoinSuccess?.(connection, elapsed);
    },
    onRejoinChannelSuccess: (connection: any, elapsed: number) => {
      console.log(`[Agora Rejoined Successfully]: Channel ${connection?.channelId}, UID: ${connection?.localUid}, elapsed: ${elapsed}ms`);
      handlers.onRejoinSuccess?.(connection, elapsed);
    },
    onUserJoined: (_conn: unknown, uid: number) => {
      console.log(`[Agora Remote User Joined]: UID ${uid}`);
      handlers.onUserJoined?.(uid);
    },
    onUserOffline: (_conn: unknown, uid: number, reason: any) => {
      console.log(`[Agora Remote User Offline]: UID ${uid}, reason: ${reason}`);
      handlers.onUserOffline?.(uid);
    },
    onError: (err: number, msg: string) => {
      console.error(`[Agora Error ${err}]: ${msg}`);
      handlers.onError?.(err, msg);
    },
    onConnectionStateChanged: (_conn: any, state: any, reason: any) => {
      console.log(`[Agora Connection State]: ${state}, Reason: ${reason}`);
      handlers.onConnectionStateChanged?.(state, reason);
    },
    onConnectionLost: () => {
      console.warn('[Agora Connection Lost]');
      handlers.onConnectionLost?.();
    },
    onTokenPrivilegeWillExpire: (_conn: any, token: string) => {
      console.warn('[Agora Token Privilege Expiring]');
      handlers.onTokenPrivilegeWillExpire?.(token);
    },
    onRequestToken: (_conn: any) => {
      console.warn('[Agora Token Expired / Requested]');
      handlers.onRequestToken?.();
    },
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

export function renewToken(token: string): void {
  if (!engine) return;
  try {
    engine.renewToken(token);
    console.log('[Agora] Token renewed successfully');
  } catch (err) {
    console.error('[Agora] Failed to renew token:', err);
  }
}
