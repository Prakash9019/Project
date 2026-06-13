import Toast from 'react-native-toast-message';
import type { ApiError } from '../services/api';

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
