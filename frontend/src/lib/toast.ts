import Toast from 'react-native-toast-message';
import { router } from 'expo-router';
import type { ApiError } from '../services/api';
import { isViewing } from '../utils/navigationRef';
import type {
  MessageToastProps,
  TapToastProps,
  CallToastProps,
  RoomMessageToastProps,
} from '../components/notifications/ToastConfig';

/* ─────────────────────── Generic status toasts ─────────────────────── */

export function showError(message: string, title = 'Error') {
  Toast.show({ type: 'error', text1: title, text2: message, position: 'top' });
}

export function showSuccess(message: string, title = 'Success') {
  Toast.show({ type: 'success', text1: title, text2: message, position: 'top' });
}

export function showInfo(message: string, title?: string) {
  Toast.show({ type: 'info', text1: title ?? message, text2: title ? message : undefined, position: 'top' });
}

/** Surface an API error as a toast, with a sensible default message. */
export function toastApiError(e: unknown, fallback = 'Something went wrong') {
  const err = e as ApiError;
  showError(err?.message ?? fallback);
}

/* ─────────────────────── Rich notification toasts ─────────────────────── */
// Each is suppressed when the user is already viewing the relevant content
// (see utils/navigationRef), so a toast never fires for the screen you're on.

/** New 1:1 message. Tapping opens the conversation. */
export function showMessageToast(params: MessageToastProps) {
  if (isViewing('chat/[id]', params.conversationId)) return;
  Toast.show({
    type: 'message',
    props: params,
    onPress: () =>
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: params.conversationId,
          peerName: params.senderName,
          peerPhoto: params.senderPhoto ?? '',
        },
      }),
  });
}

/** Someone tapped your profile. Tapping opens their profile. */
export function showTapToast(params: TapToastProps) {
  Toast.show({
    type: 'tap_received',
    props: params,
    onPress: () => router.push(`/profile/${params.senderId}`),
  });
}

/**
 * Incoming call. Does NOT auto-hide — the user must Accept or Decline (handled
 * inside the toast component). Any existing call toast is dismissed first.
 */
export function showCallToast(params: CallToastProps) {
  if (isViewing('call/[id]')) return;
  Toast.hide();
  Toast.show({ type: 'call_incoming', autoHide: false, props: params });
}

/** New group (room) message. Tapping opens the room. */
export function showRoomMessageToast(params: RoomMessageToastProps) {
  if (isViewing('rooms/[id]', params.roomId)) return;
  Toast.show({
    type: 'room_message',
    props: params,
    onPress: () => router.push(`/rooms/${params.roomId}`),
  });
}
