import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { Errors } from '../../utils/httpError';
import { serializeSelf } from '../profile/profile.serializer';

// ── Schemas ───────────────────────────────────────────────

export const deleteAccountSchema = z.object({
  confirmPhrase: z.literal('DELETE MY ACCOUNT'),
});

// ── GDPR data export ──────────────────────────────────────

export async function exportData(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;

  const [user, conversations, purchases, addOns] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { photos: true, settings: true, prompts: { orderBy: { order: 'asc' } } },
    }),
    prisma.conversation.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        aDeletedAt: null,
        bDeletedAt: null,
      },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { id: true, senderId: true, content: true, type: true, createdAt: true },
        },
      },
      take: 100,
    }),
    prisma.subscription.findMany({ where: { userId } }),
    prisma.addOnPurchase.findMany({ where: { userId } }),
  ]);

  if (!user) throw Errors.notFound();

  const payload = {
    exportedAt: new Date().toISOString(),
    user: serializeSelf(user),
    photos: user.photos.map((p) => ({ id: p.id, url: p.url, isPrimary: p.isPrimary, createdAt: p.createdAt })),
    conversations: conversations.map((c) => ({
      id: c.id,
      peerId: c.userAId === userId ? c.userBId : c.userAId,
      messageCount: c.messages.length,
      messages: c.messages,
    })),
    purchases: {
      subscriptions: purchases.map((s) => ({ id: s.id, tier: s.tier, active: s.active, startedAt: s.startedAt, expiresAt: s.expiresAt })),
      addOns: addOns.map((a) => ({ id: a.id, type: a.addOnType, purchasedAt: a.createdAt })),
    },
  };

  res.setHeader('Content-Disposition', 'attachment; filename="nearme-export.json"');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(payload);
}

// ── Account deletion ──────────────────────────────────────

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  // confirmPhrase already validated by zod schema

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Anonymise PII immediately
    await tx.user.update({
      where: { id: userId },
      data: {
        isBanned: true,           // prevents re-login
        firstName: 'Deleted',
        name: 'Deleted User',
        phone: `deleted-${userId}`,
        bio: null,
        locationLat: null,
        locationLng: null,
        isOnGrid: false,
      },
    });

    // Soft-delete all photos
    await tx.photo.updateMany({ where: { userId }, data: { isPublished: false } });

    // Soft-delete all conversations (both sides)
    await tx.conversation.updateMany({
      where: { userAId: userId },
      data: { aDeletedAt: now },
    });
    await tx.conversation.updateMany({
      where: { userBId: userId },
      data: { bDeletedAt: now },
    });
  });

  // Remove from geo index immediately
  await redis.zrem(RedisKeys.geoUsers, userId);
  // Set banned flag in Redis so all in-flight tokens are rejected
  await redis.set(RedisKeys.banned(userId), '1', 'EX', 60 * 60 * 24 * 30);

  res.status(200).json({ ok: true, message: 'Account scheduled for deletion in 30 days.' });
}
