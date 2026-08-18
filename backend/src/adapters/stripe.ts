/**
 * Stripe payment adapter — stub matching real Stripe API shapes.
 * Production: install 'stripe' package and replace StripeStubClient.
 */
import { randomUUID } from 'crypto';
import { env } from '../config/env';

/**
 * Whether a REAL Stripe client is available. The client below is still a stub
 * whose `retrievePaymentIntent` unconditionally reports `succeeded`, so this is
 * hard-false in production no matter what STRIPE_SECRET_KEY holds. Flip the
 * `!env.isProd` guard only once StripeStubClient is replaced by the Stripe SDK.
 *
 * `utils/paymentProvider.detectProvider` reads this to route every production
 * payment through Razorpay (which does verify an HMAC signature) instead.
 */
export const stripeConfigured: boolean = !env.isProd && Boolean(env.payments.stripeSecretKey);

export interface StripePaymentIntent {
  id: string;
  amount: number;  // in smallest currency unit
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'succeeded' | 'canceled';
  client_secret: string;
}

export interface StripeClient {
  createPaymentIntent(amountInr: number): Promise<StripePaymentIntent>;
  retrievePaymentIntent(id: string): Promise<StripePaymentIntent>;
}

class StripeStubClient implements StripeClient {
  private assertNotProd(): void {
    if (env.isProd) {
      throw new Error(
        'Stripe is not implemented (adapters/stripe is a stub that always reports "succeeded"). ' +
        'Refusing to use it in production.',
      );
    }
  }

  async createPaymentIntent(amountInr: number): Promise<StripePaymentIntent> {
    this.assertNotProd();
    // TODO (production): replace with real Stripe SDK call:
    // const stripe = new Stripe(env.payments.stripeSecretKey, { apiVersion: '2024-04-10' });
    // return stripe.paymentIntents.create({ amount: amountInr * 100, currency: 'inr' });
    const id = `pi_stub_${randomUUID().slice(0, 8)}`;
    return {
      id,
      amount: amountInr * 100,
      currency: 'inr',
      status: 'requires_payment_method',
      client_secret: `${id}_secret_stub`,
    };
  }

  async retrievePaymentIntent(id: string): Promise<StripePaymentIntent> {
    this.assertNotProd();
    // TODO (production): return stripe.paymentIntents.retrieve(id);
    // Stub always returns "succeeded" for dev
    return {
      id,
      amount: 0,
      currency: 'inr',
      status: 'succeeded',
      client_secret: `${id}_secret_stub`,
    };
  }
}

export const stripe: StripeClient = new StripeStubClient();

export interface StripeIdentitySession {
  id: string;
  url: string;
}

/** Stub for Stripe Identity verification session creation. */
export async function createIdentityVerificationSession(): Promise<StripeIdentitySession> {
  if (env.isProd) {
    throw new Error('Stripe Identity is not implemented — refusing to hand out a stub session URL in production.');
  }
  // Production: const stripe = new Stripe(...); return stripe.identity.verificationSessions.create({ type: 'document' });
  const id = `vs_stub_${randomUUID().slice(0, 8)}`;
  return { id, url: `https://verify.stripe.com/start/${id}` };
}
