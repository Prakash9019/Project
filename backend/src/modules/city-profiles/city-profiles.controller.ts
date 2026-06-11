import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { Errors } from '../../utils/httpError';
import { geocodeCity } from '../../adapters/geocoding';
import { fuzzyCoordinates } from '../../utils/geo';

const MAX_CITY_PROFILES = 3;

// ── Schemas ───────────────────────────────────────────────

export const createCityProfileSchema = z.object({
  city:       z.string().min(1).max(100),
  country:    z.string().min(1).max(100),
});

// ── List city profiles ────────────────────────────────────

export async function listCityProfiles(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const profiles = await prisma.cityProfile.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    // Never return lat/lng — frontendVisible: false
    select: { id: true, cityName: true, isActive: true, visitingSoonBadge: true, createdAt: true },
  });
  res.status(200).json({ profiles });
}

// ── Create city profile ───────────────────────────────────

export async function createCityProfile(req: Request, res: Response): Promise<void> {
  const { city, country } = req.body as z.infer<typeof createCityProfileSchema>;
  const userId = req.user!.sub;

  const count = await prisma.cityProfile.count({ where: { userId } });
  if (count >= MAX_CITY_PROFILES) {
    throw Errors.forbidden(`City profile limit reached. Maximum ${MAX_CITY_PROFILES} allowed.`);
  }

  const geo = await geocodeCity(city, country);
  if (!geo) throw Errors.validation('City not found. Please check the city and country names.');

  const profile = await prisma.cityProfile.create({
    data: { userId, cityName: `${city}, ${country}`, lat: geo.lat, lng: geo.lng, isActive: false, visitingSoonBadge: false },
    select: { id: true, cityName: true, isActive: true, createdAt: true },
  });
  res.status(201).json(profile);
}

// ── Activate city profile ─────────────────────────────────

export async function activateCityProfile(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { profileId } = req.params;

  const profile = await prisma.cityProfile.findFirst({
    where: { id: profileId, userId },
  });
  if (!profile) throw Errors.notFound('City profile not found');

  await prisma.$transaction(async (tx) => {
    // Deactivate all other profiles first
    await tx.cityProfile.updateMany({
      where: { userId, id: { not: profileId } },
      data: { isActive: false, visitingSoonBadge: false },
    });
    // Activate this one
    await tx.cityProfile.update({
      where: { id: profileId },
      data: { isActive: true, visitingSoonBadge: true },
    });
  });

  // Update Redis geo index to city profile coords (fuzzed) — removes real location implicitly
  const { lat: fuzzyLat, lng: fuzzyLng } = fuzzyCoordinates(profile.lat, profile.lng);
  await redis.geoadd(RedisKeys.geoUsers, fuzzyLng, fuzzyLat, userId);

  res.status(200).json({ isActive: true });
}

// ── Delete city profile ───────────────────────────────────

export async function deleteCityProfile(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { profileId } = req.params;

  const profile = await prisma.cityProfile.findFirst({ where: { id: profileId, userId } });
  if (!profile) throw Errors.notFound('City profile not found');

  // If active, remove from geo index (user will need to re-send real location)
  if (profile.isActive) {
    await redis.zrem(RedisKeys.geoUsers, userId);
  }

  await prisma.cityProfile.delete({ where: { id: profileId } });
  res.status(204).send();
}
