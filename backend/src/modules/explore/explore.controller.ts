import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { Errors } from '../../utils/httpError';
import { serializeGridCard } from '../profile/profile.serializer';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export const exploreQuerySchema = z.object({
  q:        z.string().optional(),
  ageMin:   z.coerce.number().int().min(18).optional(),
  ageMax:   z.coerce.number().int().max(120).optional(),
  bodyType: z.string().optional(),
  tribes:   z.string().optional(),
  gender:   z.enum(['male', 'female', 'nonbinary', 'other']).optional(),
  country:  z.string().max(2).optional(),
  limit:    z.coerce.number().int().min(1).max(50).default(20),
  offset:   z.coerce.number().int().min(0).default(0),
});

/** Explore = worldwide search. Requires Premium or higher. */
export async function explore(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof exploreQuerySchema>;
  const viewerId = req.user!.sub;
  const limits = req.effectiveLimits;

  if (!limits?.exploreAccess) {
    throw Errors.forbidden('Explore requires a Premium, Gold, or Platinum plan');
  }

  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  const blockedIds = new Set(blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));
  const tribesArr = q.tribes ? q.tribes.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const activeThreshold = new Date(Date.now() - FOURTEEN_DAYS_MS);

  const users = await prisma.user.findMany({
    where: {
      id: { not: viewerId, notIn: [...blockedIds] },
      phoneVerified: true,
      isOnGrid: true,
      incognitoMode: false,
      lastActiveAt: { gte: activeThreshold },
      settings: { discoverable: true, stealthMode: false },
      ...(q.gender ? { gender: q.gender as never } : {}),
      ...(q.bodyType ? { bodyType: q.bodyType as never } : {}),
      ...(q.ageMin || q.ageMax ? {
        age: {
          ...(q.ageMin ? { gte: q.ageMin } : {}),
          ...(q.ageMax ? { lte: q.ageMax } : {}),
        },
      } : {}),
      ...(tribesArr?.length ? { tribes: { hasSome: tribesArr } } : {}),
      ...(q.q ? {
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { bio: { contains: q.q, mode: 'insensitive' } },
          { tags: { has: q.q } },
        ],
      } : {}),
    },
    include: {
      photos: { where: { isPrivate: false }, orderBy: { order: 'asc' } },
      settings: true,
      cityProfiles: { where: { isActive: true }, take: 1 },
    },
    orderBy: { lastActiveAt: 'desc' },
    skip: q.offset,
    take: q.limit,
  });

  res.status(200).json({ total: users.length, users: users.map((u) => serializeGridCard(u, 0, false, false)) });
}

/** For You — 4 curated profiles based on shared tribes, interests, and past interactions. */
export async function forYou(req: Request, res: Response): Promise<void> {
  const viewerId = req.user!.sub;
  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { tribes: true, interests: true, datingIntentions: true },
  });

  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  const blockedIds = new Set(blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));
  const activeThreshold = new Date(Date.now() - FOURTEEN_DAYS_MS);

  const candidates = await prisma.user.findMany({
    where: {
      id: { not: viewerId, notIn: [...blockedIds] },
      phoneVerified: true,
      isOnGrid: true,
      incognitoMode: false,
      lastActiveAt: { gte: activeThreshold },
      settings: { discoverable: true },
      ...(viewer?.tribes?.length ? { tribes: { hasSome: viewer.tribes } } : {}),
    },
    include: {
      photos: { where: { isPrivate: false, isPrimary: true }, take: 1 },
      settings: true,
      cityProfiles: { where: { isActive: true }, take: 1 },
    },
    orderBy: { lastActiveAt: 'desc' },
    take: 20,
  });

  const scored = candidates
    .filter((u) => u.photos.length > 0)
    .map((u) => {
      const tribeScore    = (viewer?.tribes ?? []).filter((t) => u.tribes.includes(t)).length;
      const interestScore = (viewer?.interests ?? []).filter((i) => u.interests.includes(i)).length;
      return { u, score: tribeScore * 2 + interestScore };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => serializeGridCard(x.u, 0, false, false));

  res.status(200).json({ profiles: scored });
}
