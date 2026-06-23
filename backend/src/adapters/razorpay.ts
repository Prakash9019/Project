/**
 * Razorpay payment adapter. Uses the official SDK when keys are configured;
 * falls back to a stub for local dev without credentials.
 */
import { createHmac, randomUUID } from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env';

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  currency: string;
  receipt: string;
}

export interface RazorpayClient {
  createOrder(amountInr: number, receipt: string): Promise<RazorpayOrder>;
  verifySignature(orderId: string, paymentId: string, signature: string): boolean;
}

class RazorpayLiveClient implements RazorpayClient {
  private rzp: Razorpay;

  constructor() {
    this.rzp = new Razorpay({
      key_id: env.payments.razorpayKeyId,
      key_secret: env.payments.razorpayKeySecret,
    });
  }

  async createOrder(amountInr: number, receipt: string): Promise<RazorpayOrder> {
    const order = await this.rzp.orders.create({
      amount: amountInr * 100,
      currency: 'INR',
      receipt,
    });
    return {
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      receipt: order.receipt ?? receipt,
    };
  }

  verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    const expected = createHmac('sha256', env.payments.razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return expected === signature;
  }
}

class RazorpayStubClient implements RazorpayClient {
  async createOrder(amountInr: number, receipt: string): Promise<RazorpayOrder> {
    return { id: `order_stub_${randomUUID().slice(0, 8)}`, amount: amountInr * 100, currency: 'INR', receipt };
  }

  verifySignature(_orderId: string, _paymentId: string, _signature: string): boolean {
    return true;
  }
}

const hasRazorpayKeys = Boolean(env.payments.razorpayKeyId && env.payments.razorpayKeySecret);

export const razorpay: RazorpayClient = hasRazorpayKeys
  ? new RazorpayLiveClient()
  : new RazorpayStubClient();
