import { Platform } from 'react-native';

export const RAZORPAY_KEY_ID = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? '';

/**
 * react-native-razorpay is native-only (no web, no shipped types). Loaded via a
 * guarded require so web bundling does not try to resolve it.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RazorpayCheckout: any = Platform.OS === 'web' ? null : require('react-native-razorpay').default;

export const isPaymentsAvailable = RazorpayCheckout != null;

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface OpenCheckoutParams {
  key: string;
  amount: number; // in paise
  orderId: string;
  currency: 'INR' | 'USD';
  name: string;
  description: string;
  prefillContact?: string;
}

/** Opens the Razorpay checkout and resolves with the payment result. */
export function openRazorpayCheckout(params: OpenCheckoutParams): Promise<RazorpaySuccess> {
  if (!RazorpayCheckout) return Promise.reject(new Error('Payments unavailable on this device'));
  return RazorpayCheckout.open({
    key: params.key,
    amount: params.amount,
    currency: params.currency,
    order_id: params.orderId,
    name: params.name,
    description: params.description,
    theme: { color: '#FF4458' },
    prefill: params.prefillContact ? { contact: params.prefillContact } : undefined,
  });
}
