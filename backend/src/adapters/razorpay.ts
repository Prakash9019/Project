/**
 * Razorpay payment adapter — stub matching real Razorpay API shapes.
 * Production: install 'razorpay' package and replace RazorpayStubClient.
 * HMAC verification is real (uses Node.js built-in crypto).
 */
import { createHmac, randomUUID } from 'crypto';
import { env } from '../config/env';

export interface RazorpayOrder {
  id: string;
  amount: number;      // in paise
  currency: string;
  receipt: string;
}

export interface RazorpayClient {
  createOrder(amountInr: number, receipt: string): Promise<RazorpayOrder>;
  verifySignature(orderId: string, paymentId: string, signature: string): boolean;
}

class RazorpayStubClient implements RazorpayClient {
  async createOrder(amountInr: number, receipt: string): Promise<RazorpayOrder> {
    // TODO (production): replace with real Razorpay SDK call:
    // const Razorpay = require('razorpay');
    // const rzp = new Razorpay({ key_id: env.payments.razorpayKeyId, key_secret: env.payments.razorpayKeySecret });
    // return rzp.orders.create({ amount: amountInr * 100, currency: 'INR', receipt });
    return { id: `order_stub_${randomUUID().slice(0, 8)}`, amount: amountInr * 100, currency: 'INR', receipt };
  }

  verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!env.payments.razorpayKeySecret) return true; // dev: skip verification
    const expected = createHmac('sha256', env.payments.razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return expected === signature;
  }
}

export const razorpay: RazorpayClient = new RazorpayStubClient();
