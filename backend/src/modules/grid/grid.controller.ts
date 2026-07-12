import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { isValidLat, isValidLng } from '../../utils/geo';
import { serializeGridCard, signUserPhotos } from '../profile/profile.serializer';
import { getGrid, getSpotlight } from './grid.service';

export const gridQuerySchema = z.object({
  lat:              z.coerce.number().refine(isValidLat, 'Invalid latitude'),
  lng:              z.coerce.number().refine(isValidLng, 'Invalid longitude'),
  radius:           z.coerce.number().int().positive().optional(),
  limit:            z.coerce.number().int().min(1).max(50).default(20),
  offset:           z.coerce.number().int().min(0).default(0),
  // basic filters
  onlineOnly:       z.coerce.boolean().optional(),
  ageMin:           z.coerce.number().int().min(18).optional(),
  ageMax:           z.coerce.number().int().max(120).optional(),
  heightMin:        z.coerce.number().int().optional(),
  heightMax:        z.coerce.number().int().optional(),
  bodyType:         z.string().optional(),
  tribes:           z.string().optional(), // comma-separated
  tags:             z.string().optional(), // comma-separated
  lookingFor:       z.string().optional(), // comma-separated
  sort:             z.enum(['distance', 'fresh']).optional(),
  gender:           z.string().optional(), // comma-separated
  relationshipIntent: z.string().optional(), // comma-separated
  advancedFilters:  z.string().optional(), // JSON-encoded AdvancedFilters (education/occupation/... — not yet on the User model)
  // plan-gated filters (silently ignored if plan insufficient)
  verifiedOnly:     z.coerce.boolean().optional(),
  activeLast5Min:   z.coerce.boolean().optional(),
  activeLast30Min:  z.coerce.boolean().optional(),
  recentlyJoined:   z.coerce.boolean().optional(),
  highReplyRate:    z.coerce.boolean().optional(),
});

export async function grid(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof gridQuerySchema>;
  const viewerId = req.user!.sub;
  const limits = req.effectiveLimits;
  const plan = limits?.plan ?? 'free';

  const settings = await prisma.userSettings.findUnique({ where: { userId: viewerId } });
  const showDistance = settings?.showDistance ?? true;
  // Radius ceiling per plan: free/premium capped at 25km, gold/platinum up to 100km.
  // proximityShrink overrides everything down to a 500m "nearby only" radius.
  const planMaxRadius = limits?.maxRadiusM ?? 25_000;
  const effectiveMaxRadius = settings?.proximityShrink ? env.grid.shrinkRadiusM : planMaxRadius;
  const radiusM = Math.min(q.radius ?? effectiveMaxRadius, effectiveMaxRadius);
  const nationwideMode = settings?.nationwideMode ?? false;
  const planLimit = limits?.gridProfiles ?? null;

  // Plan gates: silently drop filters the caller's plan can't use
  const isPremiumPlus = plan === 'premium' || plan === 'gold' || plan === 'platinum';
  const isGoldPlus    = plan === 'gold' || plan === 'platinum';

  const { total, page } = await getGrid({
    viewerId, lat: q.lat, lng: q.lng, radiusM, limit: q.limit, offset: q.offset,
    planLimit,
    onlineOnly: q.onlineOnly,
    ageMin: q.ageMin, ageMax: q.ageMax,
    heightMin: q.heightMin, heightMax: q.heightMax,
    bodyType: q.bodyType,
    tribes:     q.tribes    ? q.tribes.split(',').map((s) => s.trim()).filter(Boolean)     : undefined,
    tags:       q.tags      ? q.tags.split(',').map((s) => s.trim()).filter(Boolean)       : undefined,
    lookingFor: q.lookingFor ? q.lookingFor.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    gender:             q.gender             ? q.gender.split(',').map((s) => s.trim()).filter(Boolean)             : undefined,
    relationshipIntent: q.relationshipIntent ? q.relationshipIntent.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    advancedFilters: q.advancedFilters,
    sort: q.sort,
    nationwideMode,
    // plan-gated filters — silently omit if plan is insufficient
    verifiedOnly:   q.verifiedOnly   && isPremiumPlus ? true : undefined,
    activeLast5Min: q.activeLast5Min && isGoldPlus    ? true : undefined,
    activeLast30Min: q.activeLast30Min && isPremiumPlus ? true : undefined,
    recentlyJoined: q.recentlyJoined && isGoldPlus    ? true : undefined,
    highReplyRate:  q.highReplyRate  && isGoldPlus    ? true : undefined,
  });

  res.status(200).json({
    radiusM,
    total,
    limit: q.limit,
    offset: q.offset,
    planLimit,
    cards: await Promise.all(page.map(async (p) => serializeGridCard(
      await signUserPhotos(p.user), p.distanceMeters, p.boosted, showDistance,
      new Set(page.filter((x) => x.isShortlisted).map((x) => x.user.id)),
      new Set(page.filter((x) => x.isLiked).map((x) => x.user.id)),
    ))),
  });
}

export const spotlightQuerySchema = z.object({
  lat: z.coerce.number().refine(isValidLat, 'Invalid latitude'),
  lng: z.coerce.number().refine(isValidLng, 'Invalid longitude'),
});

/** GET /api/v1/grid/spotlight — "Featured Nearby" carousel (active spotlight add-ons). */
export async function spotlight(req: Request, res: Response): Promise<void> {
  const { lat, lng } = req.query as unknown as z.infer<typeof spotlightQuerySchema>;
  const viewerId = req.user!.sub;
  const limits = req.effectiveLimits;
  const radiusM = limits?.maxRadiusM ?? 25_000;

  const { users } = await getSpotlight(viewerId, lat, lng, radiusM);
  res.status(200).json({
    users: await Promise.all(users.map(async (u) => serializeGridCard(await signUserPhotos(u), null, true, false))),
  });
}
