export type PaymentProvider = 'razorpay' | 'stripe';

/**
 * Detect payment provider:
 * - If explicitly requested and valid → use that
 * - Phone starts with +91 → razorpay (India)
 * - Otherwise → stripe
 */
export function detectProvider(
  phone: string | null | undefined,
  requestedProvider?: string,
): PaymentProvider {
  if (requestedProvider === 'razorpay' || requestedProvider === 'stripe') {
    return requestedProvider as PaymentProvider;
  }
  if (phone?.startsWith('+91')) return 'razorpay';
  return 'stripe';
}
