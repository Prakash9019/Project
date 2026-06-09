import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { isValidLat, isValidLng } from '../../utils/geo';
import { serializeGridCard } from '../profile/profile.serializer';
import { getGrid } from './grid.service';

export const gridQuerySchema = z.object({
  lat:         z.coerce.number().refine(isValidLat, 'Invalid latitude'),
  lng:         z.coerce.number().refine(isValidLng, 'Invalid longitude'),
  radius:      z.coerce.number().int().positive().optional(),
  limit:       z.coerce.number().int().min(1).max(50).default(20),
  offset:      z.coerce.number().int().min(0).default(0),
  // filters
  onlineOnly:  z.coerce.boolean().optional(),
  ageMin:      z.coerce.number().int().min(18).optional(),
  ageMax:      z.coerce.number().int().max(120).optional(),
  heightMin:   z.coerce.number().int().optional(),
  heightMax:   z.coerce.number().int().optional(),
  bodyType:    z.string().optional(),
  tribes:      z.string().optional(), // comma-separated
  tags:        z.string().optional(), // comma-separated
  lookingFor:  z.string().optional(), // comma-separated
  sort:        z.enum(['distance', 'fresh']).optional(),
});

export async function grid(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof gridQuerySchema>;
  const viewerId = req.user!.sub;

  const settings = await prisma.userSettings.findUnique({ where: { userId: viewerId } });
  const showDistance = settings?.showDistance ?? true;
  const maxRadius = settings?.proximityShrink ? env.grid.shrinkRadiusM : env.grid.defaultRadiusM;
  const radiusM = Math.min(q.radius ?? maxRadius, maxRadius);
  const nationwideMode = settings?.nationwideMode ?? false;

  const { total, page } = await getGrid({
    viewerId, lat: q.lat, lng: q.lng, radiusM, limit: q.limit, offset: q.offset,
    onlineOnly: q.onlineOnly,
    ageMin: q.ageMin, ageMax: q.ageMax,
    heightMin: q.heightMin, heightMax: q.heightMax,
    bodyType: q.bodyType,
    tribes: q.tribes ? q.tribes.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    tags: q.tags ? q.tags.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    lookingFor: q.lookingFor ? q.lookingFor.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    sort: q.sort,
    nationwideMode,
  });

  res.status(200).json({
    radiusM,
    total,
    limit: q.limit,
    offset: q.offset,
    cards: page.map((p) => serializeGridCard(p.user, p.distanceMeters, p.boosted, showDistance)),
  });
}
