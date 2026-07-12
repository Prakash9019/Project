import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { Errors, HttpError } from '../../utils/httpError';
import { detectProvider } from '../../utils/paymentProvider';
import { razorpay } from '../../adapters/razorpay';
import { stripe } from '../../adapters/stripe';
import { env } from '../../config/env';
import { PLAN_PRICES, PERIOD_DAYS } from './billingPlans';
import { issueTokenPair } from '../auth/auth.service';

const PENDING_ORDER_TTL = 1800; // 30 min — time to complete payment

// ── Schemas ───────────────────────────────────────────────

export const createSubscriptionSchema = z.object({
  plan:            z.enum(['premium', 'gold', 'platinum']),
  billingCycle:    z.enum(['monthly', 'three_month', 'six_month', 'annual']),
  paymentProvider: z.string().optional(),
});

export const verifySubscriptionSchema = z.object({
  orderId:         z.string().min(1),
  paymentId:       z.string().min(1),
  signature:       z.string().min(1),
  paymentProvider: z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────

function pendingOrderKey(orderId: string) { return `sub:pending:${orderId}`; }

// ── Handlers ─────────────────────────────────────────────

/** POST /api/subscriptions — initiate a subscription payment order. */
export async function createSubscription(req: Request, res: Response): Promise<void> {
  const { plan, billingCycle, paymentProvider: reqProvider } = req.body as z.infer<typeof createSubscriptionSchema>;
  const userId = req.user!.sub;

  const amount = (PLAN_PRICES as Record<string, Record<string, number>>)[plan]?.[billingCycle];
  if (!amount) throw Errors.validation('Invalid plan/billingCycle combination');

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  const provider = detectProvider(user?.phone, reqProvider);

  if (provider === 'razorpay') {
    const receipt = randomUUID().slice(0, 36);
    const order = await razorpay.createOrder(amount, receipt);
    // Stash pending order metadata for verify step
    await redis.set(
      pendingOrderKey(order.id),
      JSON.stringify({ plan, billingCycle, amount, userId }),
      'EX', PENDING_ORDER_TTL,
    );
    res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: 'INR',
      paymentProvider: 'razorpay',
      key: env.payments.razorpayKeyId,
    });
  } else {
    const intent = await stripe.createPaymentIntent(amount);
    await redis.set(
      pendingOrderKey(intent.id),
      JSON.stringify({ plan, billingCycle, amount, userId }),
      'EX', PENDING_ORDER_TTL,
    );
    res.status(201).json({
      orderId: intent.id, amount, currency: 'INR',
      paymentProvider: 'stripe',
      key: env.payments.stripePublishableKey,
      clientSecret: intent.client_secret,
    });
  }
}

/** POST /api/subscriptions/verify — confirm payment and activate plan. */
export async function verifySubscription(req: Request, res: Response): Promise<void> {
  const { orderId, paymentId, signature, paymentProvider: reqProvider } = req.body as z.infer<typeof verifySubscriptionSchema>;
  const userId = req.user!.sub;

  // Idempotency: if a subscription was already activated for this order, return it
  const existingSub = await prisma.subscription.findFirst({
    where: { userId, providerSubscriptionId: orderId, active: true },
  });
  if (existingSub && existingSub.expiresAt > new Date()) {
    res.status(200).json({ plan: existingSub.plan, planExpiresAt: existingSub.expiresAt, ok: true });
    return;
  }

  // Load pending order metadata from Redis
  const raw = await redis.get(pendingOrderKey(orderId));
  if (!raw) throw new HttpError(400, 'order_not_found', 'Order not found or expired. Please restart payment.');
  const { plan, billingCycle, amount } = JSON.parse(raw) as { plan: string; billingCycle: string; amount: number; userId: string };

  // Verify signature
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, phoneVerified: true, emailVerified: true, tier: true },
  });
  const provider = detectProvider(user?.phone, reqProvider);

  if (provider === 'razorpay') {
    if (!razorpay.verifySignature(orderId, paymentId, signature)) {
      throw new HttpError(400, 'invalid_signature', 'Payment signature verification failed.');
    }
  } else {
    const intent = await stripe.retrievePaymentIntent(orderId);
    if (intent.status !== 'succeeded') {
      throw new HttpError(400, 'payment_not_completed', 'Stripe payment has not succeeded.');
    }
  }

  const periodDays = PERIOD_DAYS[billingCycle] ?? 30;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + periodDays * 86400_000);

  const [subscription] = await prisma.$transaction([
    prisma.subscription.upsert({
      where: { userId },
      update: {
        plan: plan as never,
        billingCycle: billingCycle as never,
        priceInr: amount,
        active: true,
        startedAt: now,
        expiresAt,
        paymentProvider: provider,
        providerSubscriptionId: orderId,
        cancelledAt: null,
      },
      create: {
        userId,
        tier: 'free', // legacy field — ignored in v3
        plan: plan as never,
        billingCycle: billingCycle as never,
        priceInr: amount,
        active: true,
        expiresAt,
        paymentProvider: provider,
        providerSubscriptionId: orderId,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { plan: plan as never, planExpiresAt: expiresAt },
    }),
  ]);

  // Clean up pending order key
  redis.del(pendingOrderKey(orderId)).catch(() => {});

  // Gold/Platinum subscribers get the verified badge included — earned, not rented,
  // so it's never revoked automatically on downgrade/expiry.
  if (plan === 'gold' || plan === 'platinum') {
    await prisma.user.update({
      where: { id: userId },
      data: { verifiedBadge: true, isVerified: true },
    });
  }

  // Issue a fresh token pair so the new plan's entitlements (radius, incognito,
  // hideExactDistance, exploreAccess, ...) take effect immediately instead of
  // waiting for the old JWT to expire.
  const tokens = await issueTokenPair(
    userId,
    user?.phoneVerified ?? false,
    user?.emailVerified ?? false,
    user?.tier ?? 'free',
    plan,
    subscription.expiresAt,
  );

  res.status(200).json({
    plan: subscription.plan,
    planExpiresAt: subscription.expiresAt,
    ok: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
}

/** GET /api/subscriptions/current */
export async function currentSubscription(req: Request, res: Response): Promise<void> {
  const sub = await prisma.subscription.findFirst({
    where: { userId: req.user!.sub, active: true, expiresAt: { gt: new Date() } },
  });
  if (!sub) {
    res.status(200).json({ plan: 'free', expiresAt: null, autoRenew: false });
    return;
  }
  res.status(200).json({
    plan: sub.plan,
    billingCycle: sub.billingCycle,
    priceInr: sub.priceInr,
    startedAt: sub.startedAt,
    expiresAt: sub.expiresAt,
    autoRenew: sub.cancelledAt === null,
  });
}

/** DELETE /api/subscriptions/current — cancel at period end. */
export async function cancelSubscription(req: Request, res: Response): Promise<void> {
  const sub = await prisma.subscription.findFirst({
    where: { userId: req.user!.sub, active: true, expiresAt: { gt: new Date() } },
  });
  if (!sub) throw Errors.notFound('No active subscription found');

  const cancelled = await prisma.subscription.update({
    where: { id: sub.id },
    data: { cancelledAt: new Date() },
  });
  res.status(200).json({ cancelledAt: cancelled.cancelledAt, effectiveAt: sub.expiresAt });
}
