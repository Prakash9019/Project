/**
 * Payment verification.
 * TODO: wire Stripe / Google Play / App Store IAP. In production, every entitlement grant
 * (subscription, credits, boost, verification) must verify the provider reference via a
 * server-to-server call or signed webhook BEFORE granting. The stub trusts the reference.
 */
export interface PaymentsAdapter {
  verifyPurchase(externalRef: string): Promise<{ valid: boolean; reason?: string }>;
}

class StubPaymentsAdapter implements PaymentsAdapter {
  async verifyPurchase(externalRef: string): Promise<{ valid: boolean; reason?: string }> {
    // TODO: await stripe.checkout.sessions.retrieve(externalRef) and assert payment_status === 'paid'
    return { valid: Boolean(externalRef) };
  }
}

export const payments: PaymentsAdapter = new StubPaymentsAdapter();
