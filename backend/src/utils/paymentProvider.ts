import { stripeConfigured } from '../adapters/stripe';

export type PaymentProvider = 'razorpay' | 'stripe';

/**
 * Detect payment provider:
 * - If explicitly requested and valid → use that
 * - Phone starts with +91 → razorpay (India)
 * - Otherwise → stripe
 *
 * SECURITY: `adapters/stripe` is still a stub whose `retrievePaymentIntent`
 * unconditionally reports `succeeded`. Honouring a client-supplied
 * `paymentProvider: 'stripe'` in production would therefore let any
 * authenticated user self-grant a paid plan for free. Until a real Stripe SDK
 * client is wired (`stripeConfigured`), every provider decision collapses to
 * razorpay — which does verify an HMAC signature server-side.
 */
export function detectProvider(
  phone: string | null | undefined,
  requestedProvider?: string,
): PaymentProvider {
  if (!stripeConfigured) return 'razorpay';

  if (requestedProvider === 'razorpay' || requestedProvider === 'stripe') {
    return requestedProvider as PaymentProvider;
  }
  if (phone?.startsWith('+91')) return 'razorpay';
  return 'stripe';
}
