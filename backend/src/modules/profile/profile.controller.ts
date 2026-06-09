import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { env } from '../../config/env';
import { Errors } from '../../utils/httpError';
import { isValidLat, isValidLng } from '../../utils/geo';
import { hashPin, verifyPin } from '../../utils/crypto';
import { serializeSelf, serializePublicProfile, serializeSettings } from './profile.serializer';
import {
  MAX_TRIBES, MAX_TAGS, MAX_DATING_INTENTIONS,
  TOP_PROMPTS, TRIBES, BODY_TYPES, DATING_INTENTIONS,
} from './catalogs';

// ── Schemas ──────────────────────────────────────────────

export const updateProfileSchema = z.object({
  name:             z.string().min(1).max(60).optional(),
  age:              z.number().int().min(18).max(120).optional(),
  gender:           z.enum(['male','female','nonbinary','other']).optional(),
  bio:              z.string().max(150).optional(),
  height:           z.number().int().min(50).max(300).optional(),
  weight:           z.number().int().min(20).max(500).optional(),
  bodyType:         z.enum(['slim','athletic','average','muscular','curvy','plus_size','other']).optional(),
  relationshipType: z.enum(['single','dating','open_relationship','married','complicated','prefer_not_to_say']).optional(),
  lookingFor:       z.array(z.string().max(50)).max(10).optional(),
  datingIntentions: z.array(z.enum(['casual_dates','intimacy_no_commitment','life_partner','ethical_non_monogamy','marriage','friendship','virtual_dating'])).max(MAX_DATING_INTENTIONS).optional(),
  interests:        z.array(z.string().max(50)).max(50).optional(),
  topArtists:       z.array(z.string().max(80)).max(20).optional(),
  tribes:           z.array(z.string().max(50)).max(MAX_TRIBES).optional(),
  tags:             z.array(z.string().max(50)).max(MAX_TAGS).optional(),
  virtualDatingBadge: z.boolean().optional(),
});

export const addPhotoSchema = z.object({
  url:       z.string().url(),
  isPrimary: z.boolean().optional(),
  isPrivate: z.boolean().optional().default(false),
  albumId:   z.string().uuid().optional(),
});

export const settingsSchema = z.object({
  verifiedOnly:          z.boolean().optional(),
  proximityShrink:       z.boolean().optional(),
  stealthMode:           z.boolean().optional(),
  discoverable:          z.boolean().optional(),
  showDistance:          z.boolean().optional(),
  locationDealbreaker:   z.boolean().optional(),
  nationwideMode:        z.boolean().optional(),
  incognito:             z.boolean().optional(),
  appIcon:               z.string().max(40).optional(),
  screenshotBlock:       z.boolean().optional(),
  blockOffensiveLanguage: z.boolean().optional(),
});

export const locationSchema = z.object({
  lat: z.number().refine(isValidLat, 'Invalid latitude'),
  lng: z.number().refine(isValidLng, 'Invalid longitude'),
});

export const promptSchema = z.object({
  prompt: z.string().min(1).max(120),
  answer: z.string().min(1).max(300),
  order:  z.number().int().min(0).optional(),
});

export const pinSetSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits'),
});

export const pinVerifySchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4-8 digits'),
});

// ── Handlers ─────────────────────────────────────────────

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const data = req.body as z.infer<typeof updateProfileSchema>;
  const user = await prisma.user.update({
    where: { id: req.user!.sub },
    data,
    include: { photos: { orderBy: { order: 'asc' } }, settings: true, prompts: { orderBy: { order: 'asc' } } },
  });
  res.status(200).json(serializeSelf(user));
}

export async function addPhoto(req: Request, res: Response): Promise<void> {
  const { url, isPrimary, isPrivate, albumId } = req.body as z.infer<typeof addPhotoSchema>;
  const userId = req.user!.sub;
  const count = await prisma.photo.count({ where: { userId, isPrivate: false } });
  const makePrimary = !isPrivate && (isPrimary || count === 0);

  const photo = await prisma.$transaction(async (tx) => {
    if (makePrimary) await tx.photo.updateMany({ where: { userId }, data: { isPrimary: false } });
    return tx.photo.create({ data: { userId, url, isPrimary: makePrimary, isPrivate: isPrivate ?? false, albumId, order: count } });
  });
  res.status(201).json(photo);
}

export async function setPrimaryPhoto(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { photoId } = req.params;
  const photo = await prisma.photo.findFirst({ where: { id: photoId, userId, isPrivate: false } });
  if (!photo) throw Errors.notFound('Photo not found');
  await prisma.$transaction([
    prisma.photo.updateMany({ where: { userId }, data: { isPrimary: false } }),
    prisma.photo.update({ where: { id: photoId }, data: { isPrimary: true } }),
  ]);
  res.status(200).json({ ok: true });
}

export async function deletePhoto(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { photoId } = req.params;
  const photo = await prisma.photo.findFirst({ where: { id: photoId, userId } });
  if (!photo) throw Errors.notFound('Photo not found');
  await prisma.photo.delete({ where: { id: photoId } });
  res.status(204).send();
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const data = req.body as z.infer<typeof settingsSchema>;
  const settings = await prisma.userSettings.upsert({
    where: { userId: req.user!.sub },
    update: data,
    create: { userId: req.user!.sub, ...data },
  });
  res.status(200).json(serializeSettings(settings));
}

export async function updateLocation(req: Request, res: Response): Promise<void> {
  const { lat, lng } = req.body as z.infer<typeof locationSchema>;
  const userId = req.user!.sub;
  await redis.geoadd(RedisKeys.geoUsers, lng, lat, userId);
  await redis.set(RedisKeys.presence(userId), '1', 'EX', env.grid.onlineWindowSeconds);
  await prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } });
  res.status(200).json({ ok: true });
}

export async function getPublicProfile(req: Request, res: Response): Promise<void> {
  const viewerId = req.user!.sub;
  const { userId } = req.params;

  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: viewerId, blockedId: userId }, { blockerId: userId, blockedId: viewerId }] },
  });
  if (blocked) throw Errors.notFound('Profile not available');

  const [user, viewer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { photos: { orderBy: { order: 'asc' } }, prompts: { orderBy: { order: 'asc' } } },
    }),
    prisma.user.findUnique({ where: { id: viewerId }, select: { interests: true, topArtists: true, tribes: true, settings: true } }),
  ]);
  if (!user) throw Errors.notFound('Profile not found');

  // Record the view unless the viewer has incognito on.
  if (!viewer?.settings?.incognito && viewerId !== userId) {
    await prisma.profileView.upsert({
      where: { viewerId_viewedId: { viewerId, viewedId: userId } },
      update: { createdAt: new Date() },
      create: { viewerId, viewedId: userId },
    });
  }

  res.status(200).json(serializePublicProfile(user, viewer));
}

// ── Prompts (Hinge-style personality prompts) ────────────

export async function listPrompts(req: Request, res: Response): Promise<void> {
  const prompts = await prisma.profilePrompt.findMany({
    where: { userId: req.user!.sub },
    orderBy: { order: 'asc' },
  });
  res.status(200).json({ prompts });
}

export async function addPrompt(req: Request, res: Response): Promise<void> {
  const { prompt, answer, order } = req.body as z.infer<typeof promptSchema>;
  const userId = req.user!.sub;
  const count = await prisma.profilePrompt.count({ where: { userId } });
  if (count >= 6) throw Errors.badRequest('Maximum 6 prompts allowed');
  const p = await prisma.profilePrompt.create({ data: { userId, prompt, answer, order: order ?? count } });
  res.status(201).json(p);
}

export async function updatePrompt(req: Request, res: Response): Promise<void> {
  const { promptId } = req.params;
  const { prompt, answer, order } = req.body as z.infer<typeof promptSchema>;
  const existing = await prisma.profilePrompt.findFirst({ where: { id: promptId, userId: req.user!.sub } });
  if (!existing) throw Errors.notFound('Prompt not found');
  const updated = await prisma.profilePrompt.update({ where: { id: promptId }, data: { prompt, answer, order } });
  res.status(200).json(updated);
}

export async function deletePrompt(req: Request, res: Response): Promise<void> {
  const { promptId } = req.params;
  const existing = await prisma.profilePrompt.findFirst({ where: { id: promptId, userId: req.user!.sub } });
  if (!existing) throw Errors.notFound('Prompt not found');
  await prisma.profilePrompt.delete({ where: { id: promptId } });
  res.status(204).send();
}

// ── PIN lock ─────────────────────────────────────────────

export async function setPin(req: Request, res: Response): Promise<void> {
  const { pin } = req.body as z.infer<typeof pinSetSchema>;
  await prisma.user.update({ where: { id: req.user!.sub }, data: { pinHash: hashPin(pin) } });
  res.status(200).json({ ok: true });
}

export async function removePin(req: Request, res: Response): Promise<void> {
  const { pin } = req.body as z.infer<typeof pinVerifySchema>;
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { pinHash: true } });
  if (!user?.pinHash) throw Errors.badRequest('No PIN set');
  if (!verifyPin(pin, user.pinHash)) throw Errors.forbidden('Incorrect PIN');
  await prisma.user.update({ where: { id: req.user!.sub }, data: { pinHash: null } });
  res.status(200).json({ ok: true });
}

export async function verifyPinHandler(req: Request, res: Response): Promise<void> {
  const { pin } = req.body as z.infer<typeof pinVerifySchema>;
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { pinHash: true } });
  if (!user?.pinHash) throw Errors.badRequest('No PIN set');
  if (!verifyPin(pin, user.pinHash)) throw Errors.forbidden('Incorrect PIN');
  res.status(200).json({ valid: true });
}

// ── Catalogs ─────────────────────────────────────────────

export async function getCatalogs(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ prompts: TOP_PROMPTS, tribes: TRIBES, bodyTypes: BODY_TYPES, datingIntentions: DATING_INTENTIONS });
}
