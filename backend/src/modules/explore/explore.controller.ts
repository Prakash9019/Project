import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { serializeGridCard, serializePublicProfile } from '../profile/profile.serializer';
import { MIN_PHOTOS_FOR_DISCOVERY } from '../profile/catalogs';

// Explore = worldwide search; no geo-radius required (premium feature, not yet enforced).
export const exploreQuerySchema = z.object({
  q:        z.string().optional(),           // free-text search (name, bio, tags)
  ageMin:   z.coerce.number().int().min(18).optional(),
  ageMax:   z.coerce.number().int().max(120).optional(),
  bodyType: z.string().optional(),
  tribes:   z.string().optional(),           // comma-separated
  gender:   z.enum(['male','female','nonbinary','other']).optional(),
  country:  z.string().max(2).optional(),    // ISO alpha-2 — stored in tags as 'country:<CC>'
  limit:    z.coerce.number().int().min(1).max(50).default(20),
  offset:   z.coerce.number().int().min(0).default(0),
});

export async function explore(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof exploreQuerySchema>;
  const viewerId = req.user!.sub;

  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  const blockedIds = new Set(blocks.map((b) => b.blockerId === viewerId ? b.blockedId : b.blockerId));

  const tribesArr = q.tribes ? q.tribes.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  const users = await prisma.user.findMany({
    where: {
      id: { not: viewerId, notIn: [...blockedIds] },
      phoneVerified: true,
      name: { not: null },
      settings: { discoverable: true },
      ...(q.gender ? { gender: q.gender as any } : {}),
      ...(q.bodyType ? { bodyType: q.bodyType as any } : {}),
      ...(q.ageMin || q.ageMax ? { age: { ...(q.ageMin ? { gte: q.ageMin } : {}), ...(q.ageMax ? { lte: q.ageMax } : {}) } } : {}),
      ...(tribesArr?.length ? { tribes: { hasSome: tribesArr } } : {}),
      ...(q.q ? { OR: [
        { name: { contains: q.q, mode: 'insensitive' } },
        { bio: { contains: q.q, mode: 'insensitive' } },
        { tags: { has: q.q } },
      ] } : {}),
    },
    include: {
      photos: { where: { isPrivate: false }, orderBy: { order: 'asc' } },
    },
    orderBy: { lastActiveAt: 'desc' },
    skip: q.offset,
    take: q.limit,
  });

  const visible = users.filter((u) => u.photos.length >= MIN_PHOTOS_FOR_DISCOVERY);
  res.status(200).json({ total: visible.length, users: visible.map((u) => serializeGridCard(u, 0, false, false)) });
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
  const blockedIds = new Set(blocks.map((b) => b.blockerId === viewerId ? b.blockedId : b.blockerId));

  // Score by overlap with viewer's tribes + interests; fall back to recent activity.
  const candidates = await prisma.user.findMany({
    where: {
      id: { not: viewerId, notIn: [...blockedIds] },
      phoneVerified: true,
      name: { not: null },
      settings: { discoverable: true },
      ...(viewer?.tribes?.length ? { tribes: { hasSome: viewer.tribes } } : {}),
    },
    include: {
      photos: { where: { isPrivate: false, isPrimary: true }, take: 1 },
    },
    orderBy: { lastActiveAt: 'desc' },
    take: 20,
  });

  // Pick 4 with best tribe/interest overlap.
  const scored = candidates
    .filter((u) => u.photos.length > 0)
    .map((u) => {
      const tribeScore = (viewer?.tribes ?? []).filter((t) => u.tribes.includes(t)).length;
      const interestScore = (viewer?.interests ?? []).filter((i) => u.interests.includes(i)).length;
      return { u, score: tribeScore * 2 + interestScore };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => serializeGridCard(x.u, 0, false, false));

  res.status(200).json({ profiles: scored });
}
