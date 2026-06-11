/**
 * Stripe payment adapter — stub matching real Stripe API shapes.
 * Production: install 'stripe' package and replace StripeStubClient.
 */
import { randomUUID } from 'crypto';

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
  async createPaymentIntent(amountInr: number): Promise<StripePaymentIntent> {
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
  // Production: const stripe = new Stripe(...); return stripe.identity.verificationSessions.create({ type: 'document' });
  const id = `vs_stub_${randomUUID().slice(0, 8)}`;
  return { id, url: `https://verify.stripe.com/start/${id}` };
}
