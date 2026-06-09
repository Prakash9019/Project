import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { isValidLat, isValidLng, coarseGeohash } from '../../utils/geo';
import { PRICING } from './pricing';

/**
 * NOTE: All money movement is assumed to be settled by an external payment provider
 * (Stripe / Google Play / App Store IAP). These endpoints take an `externalRef` that a
 * production system would verify via webhook before granting entitlements. Here they grant
 * directly for development.
 */

export const subscribeSchema = z.object({
  tier: z.enum(['basic', 'advanced', 'vip']),
  externalRef: z.string().min(1),
  periodDays: z.number().int().min(1).max(366).default(30),
});

export const purchaseCreditsSchema = z.object({
  quantity: z.number().int().min(1).max(500),
  externalRef: z.string().min(1),
});

export const boostSchema = z.object({
  lat: z.number().refine(isValidLat, 'Invalid latitude'),
  lng: z.number().refine(isValidLng, 'Invalid longitude'),
  externalRef: z.string().min(1),
});

export const verifySchema = z.object({ externalRef: z.string().min(1) });

export async function plans(_req: Request, res: Response): Promise<void> {
  res.status(200).json(PRICING);
}

export async function subscribe(req: Request, res: Response): Promise<void> {
  const { tier, externalRef, periodDays } = req.body as z.infer<typeof subscribeSchema>;
  const userId = req.user!.sub;
  const expiresAt = new Date(Date.now() + periodDays * 86400_000);

  const [subscription] = await prisma.$transaction([
    prisma.subscription.upsert({
      where: { userId },
      update: { tier, active: true, expiresAt, externalRef },
      create: { userId, tier, expiresAt, externalRef },
    }),
    prisma.user.update({ where: { id: userId }, data: { tier } }),
  ]);
  res.status(200).json({ tier: subscription.tier, expiresAt: subscription.expiresAt });
}

export async function wallet(req: Request, res: Response): Promise<void> {
  const w = await prisma.creditWallet.upsert({
    where: { userId: req.user!.sub },
    update: {},
    create: { userId: req.user!.sub },
  });
  res.status(200).json({ balance: w.balance });
}

export async function purchaseCredits(req: Request, res: Response): Promise<void> {
  const { quantity } = req.body as z.infer<typeof purchaseCreditsSchema>;
  const userId = req.user!.sub;

  const w = await prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.upsert({
      where: { userId },
      update: { balance: { increment: quantity } },
      create: { userId, balance: quantity },
    });
    await tx.creditLedger.create({
      data: { userId, delta: quantity, reason: 'purchase', balanceAfter: wallet.balance },
    });
    return wallet;
  });
  res.status(200).json({ balance: w.balance });
}

/** Pin the user's card to the top of the nearby grid within a geofence for 30 minutes. */
export async function createBoost(req: Request, res: Response): Promise<void> {
  const { lat, lng } = req.body as z.infer<typeof boostSchema>;
  const userId = req.user!.sub;
  const expiresAt = new Date(Date.now() + env.feedBoostDurationMinutes * 60_000);

  const boost = await prisma.feedBoost.create({
    data: { userId, geohash: coarseGeohash(lat, lng), expiresAt },
  });
  res.status(201).json({ id: boost.id, expiresAt: boost.expiresAt });
}

export async function activeBoost(req: Request, res: Response): Promise<void> {
  const boost = await prisma.feedBoost.findFirst({
    where: { userId: req.user!.sub, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });
  res.status(200).json({ active: !!boost, boost });
}

/** Trust Verification Economy: grant the authenticated badge after a verified purchase. */
export async function verifyAccount(req: Request, res: Response): Promise<void> {
  await prisma.user.update({ where: { id: req.user!.sub }, data: { isVerified: true } });
  res.status(200).json({ isVerified: true });
}
