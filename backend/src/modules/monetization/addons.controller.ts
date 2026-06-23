import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { Errors, HttpError } from '../../utils/httpError';
import { detectProvider } from '../../utils/paymentProvider';
import { razorpay } from '../../adapters/razorpay';
import { stripe } from '../../adapters/stripe';
import { emitToUser } from '../../realtime/emitter';
import { coarseGeohash } from '../../utils/geo';
import { env } from '../../config/env';
import { ADDON_PRICES } from './billingPlans';

const PENDING_ADDON_TTL = 1800;

// Boost durations in ms
const BOOST_DURATION_MS: Record<string, number> = {
  boost_local:     30 * 60_000,
  boost_extended:  30 * 60_000,
  boost_city_wide: 30 * 60_000,
  mega_boost:      60 * 60_000,
};

// ── Schemas ───────────────────────────────────────────────

const ADDON_TYPES = [
  'boost_local', 'boost_extended', 'boost_city_wide', 'mega_boost',
  'spotlight', 'chat_pack_s', 'chat_pack_m', 'chat_pack_l',
  'travel_pass', 'travel_pass_week', 'verified_badge',
  'audio_call_topup', 'video_call_topup',
] as const;

export const purchaseAddonSchema = z.object({
  addonType:       z.enum(ADDON_TYPES),
  paymentProvider: z.string().optional(),
  quantity:        z.number().int().min(1).max(10).optional(),
});

export const verifyAddonSchema = z.object({
  orderId:         z.string().min(1),
  paymentId:       z.string().min(1),
  signature:       z.string().min(1),
  addonType:       z.enum(ADDON_TYPES),
  paymentProvider: z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────

function pendingAddonKey(orderId: string) { return `addon:pending:${orderId}`; }

// ── Handlers ─────────────────────────────────────────────

/** GET /api/addons — public catalog */
export async function listAddons(_req: Request, res: Response): Promise<void> {
  // Re-export the catalog from billingPlans
  const { BILLING_CATALOG } = await import('./billingPlans');
  res.status(200).json({ addOns: BILLING_CATALOG.addOns });
}

/** POST /api/addons/purchase — initiate add-on payment */
export async function purchaseAddon(req: Request, res: Response): Promise<void> {
  const { addonType, paymentProvider: reqProvider } = req.body as z.infer<typeof purchaseAddonSchema>;
  const userId = req.user!.sub;

  const amount = ADDON_PRICES[addonType];
  if (!amount) throw Errors.validation('Unknown addon type');

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  const provider = detectProvider(user?.phone, reqProvider);

  let orderId: string;
  let amountPaise = amount * 100;
  let extra: Record<string, unknown> = {};

  if (provider === 'razorpay') {
    const order = await razorpay.createOrder(amount, randomUUID().slice(0, 36));
    orderId = order.id;
    amountPaise = order.amount;
    extra = { key: env.payments.razorpayKeyId };
  } else {
    const intent = await stripe.createPaymentIntent(amount);
    orderId = intent.id;
    extra = { clientSecret: intent.client_secret };
  }

  await redis.set(
    pendingAddonKey(orderId),
    JSON.stringify({ addonType, amount, userId }),
    'EX', PENDING_ADDON_TTL,
  );

  res.status(201).json({
    orderId,
    amount: amountPaise,
    currency: 'INR',
    paymentProvider: provider,
    ...extra,
  });
}

/** POST /api/addons/verify — confirm payment and activate add-on */
export async function verifyAddon(req: Request, res: Response): Promise<void> {
  const { orderId, paymentId, signature, addonType, paymentProvider: reqProvider } =
    req.body as z.infer<typeof verifyAddonSchema>;
  const userId = req.user!.sub;

  // Idempotency
  const existing = await prisma.addOnPurchase.findFirst({
    where: { userId, providerOrderId: orderId },
  });
  if (existing) {
    res.status(200).json({ addonType, activatedAt: existing.activatedAt, expiresAt: existing.expiresAt, ok: true });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, plan: true, locationLat: true, locationLng: true },
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

  const amount = ADDON_PRICES[addonType] ?? 0;
  const now = new Date();
  let expiresAt: Date | null = null;
  let extraFields: Record<string, unknown> = {};
  let responseExtra: Record<string, unknown> = {};

  // ── Activate based on add-on type ──────────────────────

  if (addonType in BOOST_DURATION_MS) {
    // Boost add-ons
    expiresAt = new Date(now.getTime() + BOOST_DURATION_MS[addonType]);
    const geohash = coarseGeohash(user?.locationLat ?? 0, user?.locationLng ?? 0);
    const boost = await prisma.feedBoost.create({
      data: { userId, geohash, expiresAt },
    });
    emitToUser(userId, 'boost.activated', { boostId: boost.id, boostType: addonType, expiresAt });

  } else if (addonType === 'spotlight') {
    expiresAt = new Date(now.getTime() + 24 * 60 * 60_000);

  } else if (addonType === 'chat_pack_s' || addonType === 'chat_pack_m' || addonType === 'chat_pack_l') {
    // Legacy — v3 uses lifetime interaction cap; record but take no other action
    const slots = addonType === 'chat_pack_s' ? 10 : addonType === 'chat_pack_m' ? 25 : 50;
    extraFields = { chatSlotsAdded: slots };
    expiresAt = null;
    responseExtra = { note: 'Chat packs are legacy — v3 uses lifetime interaction cap.' };

  } else if (addonType === 'travel_pass' || addonType === 'travel_pass_week') {
    const hours = addonType === 'travel_pass' ? 24 : 168;
    expiresAt = new Date(now.getTime() + hours * 60 * 60_000);
    // Travel mode active status is determined by AddOnPurchase record, no separate settings field needed

  } else if (addonType === 'verified_badge') {
    // Permanent — verification badge set ONLY after provider confirmation
    expiresAt = null;
    responseExtra = { note: 'Submit verification documents to complete badge activation.' };

  } else if (addonType === 'audio_call_topup') {
    if (user?.plan !== 'free') {
      throw new HttpError(403, 'topup_free_only', 'Audio call top-ups are for free-tier users only.');
    }
    // End of current month
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expiresAt = endOfMonth;
    extraFields = { audioMinutesAdded: 30 };

  } else if (addonType === 'video_call_topup') {
    if (user?.plan !== 'free') {
      throw new HttpError(403, 'topup_free_only', 'Video call top-ups are for free-tier users only.');
    }
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expiresAt = endOfMonth;
    extraFields = { videoMinutesAdded: 30 };
  }

  const purchase = await prisma.addOnPurchase.create({
    data: {
      userId,
      addOnType: addonType as never,
      priceInr: amount,
      isActive: true,
      activatedAt: now,
      expiresAt,
      paymentProvider: provider,
      providerOrderId: orderId,
      ...extraFields,
    },
  });

  redis.del(pendingAddonKey(orderId)).catch(() => {});

  res.status(200).json({
    addonType,
    activatedAt: purchase.activatedAt,
    expiresAt: purchase.expiresAt,
    ok: true,
    ...responseExtra,
  });
}

/** GET /api/addons/active */
export async function activeAddons(req: Request, res: Response): Promise<void> {
  const active = await prisma.addOnPurchase.findMany({
    where: {
      userId: req.user!.sub,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { activatedAt: 'desc' },
    select: {
      id: true, addOnType: true, activatedAt: true, expiresAt: true,
      chatSlotsAdded: true, audioMinutesAdded: true, videoMinutesAdded: true,
    },
  });
  res.status(200).json({ active });
}
