import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { env } from '../../config/env';
import { Errors } from '../../utils/httpError';
import { uuidParam } from '../../utils/validators';
import { isValidLat, isValidLng, fuzzyCoordinates } from '../../utils/geo';
import { hashPin, verifyPin } from '../../utils/crypto';
import { serializeSelf, serializePublicProfile, serializeSettings, serializeGridCard, signUserPhotos } from './profile.serializer';
import { signUrl } from '../../utils/signUrl';
import {
  MAX_TRIBES, MAX_TAGS, MAX_DATING_INTENTIONS,
  TOP_PROMPTS, TRIBES, BODY_TYPES, DATING_INTENTIONS,
  SKIN_TONES, RELATIONSHIP_STATUSES, LOOKING_FOR_OPTIONS,
  WHERE_WE_CAN_MEET, FANTASY_TAGS_CURATED,
} from './catalogs';
import { recomputeCompletenessScore } from '../../utils/profileScore';
import { moderateImage } from '../../services/imageModeration';
import { emitToUser } from '../../realtime/emitter';

export const updateProfileSchema = z.object({
  name:               z.string().min(1).max(60).optional(),
  firstName:          z.string().min(1).max(60).optional(),
  age:                z.number().int().min(18).max(120).optional(),
  gender:             z.enum(['male','female','nonbinary','other']).optional(),
  bio:                z.string().max(600).optional(),
  height:             z.number().int().min(50).max(300).optional(),
  weight:             z.number().int().min(20).max(500).optional(),
  // Change 5: canonical bodyType values
  bodyType:           z.enum(['slim','athletic','average','curvy','heavyset','prefer_not_to_say']).optional(),
  relationshipType:   z.enum(['single','dating','open_relationship','married','complicated','prefer_not_to_say']).optional(),
  // Change 5: typed lookingFor
  lookingFor:         z.array(z.enum(['fwb','one_night','long_term','short_term','casual','friendship'])).max(10).optional(),
  datingIntentions:   z.array(z.enum(['casual_dates','intimacy_no_commitment','life_partner','ethical_non_monogamy','marriage','friendship','virtual_dating'])).max(MAX_DATING_INTENTIONS).optional(),
  interests:          z.array(z.string().max(50)).max(50).optional(),
  topArtists:         z.array(z.string().max(80)).max(20).optional(),
  tribes:             z.array(z.string().max(50)).max(MAX_TRIBES).optional(),
  tags:               z.array(z.string().max(50)).max(MAX_TAGS).optional(),
  virtualDatingBadge: z.boolean().optional(),
  // Change 5: new profile fields
  skinTone:           z.enum(['very_fair','fair','medium','olive','brown','dark','prefer_not_to_say']).optional(),
  aboutMe:            z.string().max(500).optional(),
  whereAreYouFrom:    z.string().max(100).optional(),
  relationshipStatus: z.enum(['single','committed','open_relationship','prefer_not_to_say']).optional(),
  whereWeCanMeet:     z.array(z.enum(['my_place','your_place','restaurant','cafe','hotel','outdoors','virtual'])).optional(),
  preferences:        z.string().max(500).optional(),
  fantasyTags:        z.array(z.string().max(50)).max(20).optional(),
  // v2 identity fields
  genderIdentity:     z.enum(['man','woman','non_binary','trans_man','trans_woman','genderqueer','genderfluid','other']).optional(),
  genderIdentityOther: z.string().max(100).optional(),
  sexualOrientation:  z.enum(['straight','gay','lesbian','bisexual','queer','pansexual','other']).optional(),
  wantToSee:          z.array(z.enum(['men','women','everyone','non_binary_people'])).optional(),
  relationshipIntent: z.enum(['dating','friendship','networking','open_to_anything']).optional(),
  whoCanDiscoverMe:   z.array(z.enum(['men','women','everyone','non_binary_people'])).optional(),
  // Right Now ephemeral status. Send null to clear. Posting all three together.
  rightNowStatus:     z.string().max(120).nullable().optional(),
  rightNowCategory:   z.enum(['drinks','coffee','workout','hangout','other']).nullable().optional(),
  rightNowExpiresAt:  z.string().datetime().nullable().optional(),
  // Availability toggles (Settings → Availability).
  groupsAvailable:    z.boolean().optional(),
  audioCallAvailable: z.boolean().optional(),
  videoCallAvailable: z.boolean().optional(),
});

// Accepts either a full https:// URL or a raw R2 storage key.
export const addPhotoSchema = z.object({
  url:       z.string().min(1),
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
  hideActiveStatus:      z.boolean().optional(),
  hideLastSeen:          z.boolean().optional(),
  hideExactDistance:     z.boolean().optional(),
  showOrientationPublicly: z.boolean().optional(),
  disceetMode:           z.boolean().optional(),
  pauseIncomingMessages: z.boolean().optional(),
  requireProfileCompletenessToMessage: z.boolean().optional(),
  verifiedUsersOnlyFilter: z.boolean().optional(),
});

export const locationSchema = z.object({
  lat: z.number().refine(isValidLat, 'Invalid latitude'),
  lng: z.number().refine(isValidLng, 'Invalid longitude'),
});

export const fcmTokenSchema = z.object({
  token: z.string().min(1).max(512),
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
  const userId = req.user!.sub;

  // Plan-based bio length enforcement (uses JWT claim — no DB hit)
  if (data.bio !== undefined) {
    const maxBio = req.effectiveLimits?.bioChars ?? 150;
    if (data.bio.length > maxBio) {
      throw Errors.validation(`Bio exceeds plan limit of ${maxBio} characters`);
    }
  }

  // Women's safety defaults: set verifiedUsersOnlyFilter=true the first time gender is set to female/woman
  const needsWomenDefault = data.gender === 'female' || data.genderIdentity === 'woman';
  const updateData: Record<string, unknown> = { ...data };

  if (needsWomenDefault) {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { gender: true, genderIdentity: true },
    });
    // Only apply default on first-time gender assignment
    if (!existing?.gender && !existing?.genderIdentity) {
      updateData.verifiedUsersOnlyFilter = true;
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData as Parameters<typeof prisma.user.update>[0]['data'],
    include: { photos: { orderBy: { order: 'asc' } }, settings: true, prompts: { orderBy: { order: 'asc' } } },
  });
  // Fire-and-forget: recompute completeness score after profile fields change
  recomputeCompletenessScore(userId).catch(() => {});
  res.status(200).json(serializeSelf(await signUserPhotos(updated)));
}

// Change 3.2: profile picture is a single optional upload — no min photo requirement
export async function addPhoto(req: Request, res: Response): Promise<void> {
  const { url, isPrimary, isPrivate, albumId } = req.body as z.infer<typeof addPhotoSchema>;
  const userId = req.user!.sub;

  // Image moderation: reject explicit content; queue for review if suggestive
  const modResult = await moderateImage(url);
  if (modResult === 'reject') {
    throw Errors.badRequest('Photo rejected: content violates community guidelines');
  }
  const isPublished = modResult === 'allow';

  const count = await prisma.photo.count({ where: { userId, isPrivate: false } });
  // Only mark as primary if it passed moderation (is published)
  const makePrimary = isPublished && !isPrivate && (isPrimary || count === 0);

  const photo = await prisma.$transaction(async (tx) => {
    if (makePrimary) await tx.photo.updateMany({ where: { userId }, data: { isPrimary: false } });
    return tx.photo.create({
      data: { userId, url, isPrimary: makePrimary, isPrivate: isPrivate ?? false, albumId, order: count, isPublished },
    });
  });
  recomputeCompletenessScore(userId).catch(() => {});
  const signedPhotoUrl = await signUrl(photo.url) ?? photo.url;
  res.status(201).json({ ...photo, url: signedPhotoUrl, pendingReview: !isPublished });
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
  recomputeCompletenessScore(userId).catch(() => {});
  res.status(204).send();
}

// Keys in settingsSchema that live on the User model, not UserSettings — the
// two models were extended independently and drifted (User gained these
// privacy/safety fields; UserSettings never did). Routing them through
// userSettings.upsert() threw "Unknown argument" PrismaClientValidationErrors,
// surfaced to the client as a generic "Something went wrong" 500.
const USER_MODEL_SETTINGS_KEYS = [
  'hideActiveStatus',
  'hideLastSeen',
  'hideExactDistance',
  'showOrientationPublicly',
  'disceetMode',
  'pauseIncomingMessages',
  'requireProfileCompletenessToMessage',
  'verifiedUsersOnlyFilter',
] as const;

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const data = req.body as z.infer<typeof settingsSchema>;
  const limits = req.effectiveLimits;

  // Plan-gated setting guards
  if (data.incognito && !limits?.incognitoMode) {
    throw Errors.forbidden('Incognito mode requires Gold or Platinum plan');
  }
  if (data.hideExactDistance && !limits?.hideExactDistance) {
    throw Errors.forbidden('Hiding your exact distance requires Gold or Platinum plan');
  }

  const userData: Record<string, unknown> = {};
  const settingsData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if ((USER_MODEL_SETTINGS_KEYS as readonly string[]).includes(key)) {
      userData[key] = value;
    } else {
      settingsData[key] = value;
    }
  }

  const [settings, user] = await Promise.all([
    Object.keys(settingsData).length
      ? prisma.userSettings.upsert({
          where: { userId: req.user!.sub },
          update: settingsData,
          create: { userId: req.user!.sub, ...settingsData },
        })
      : prisma.userSettings.findUnique({ where: { userId: req.user!.sub } }),
    Object.keys(userData).length
      ? prisma.user.update({ where: { id: req.user!.sub }, data: userData })
      : null,
  ]);

  const userExtras = user
    ? Object.fromEntries(USER_MODEL_SETTINGS_KEYS.map((k) => [k, (user as Record<string, unknown>)[k]]))
    : {};
  res.status(200).json({ ...serializeSettings(settings ?? {}), ...userExtras });
}

// Distance accuracy depends on BOTH users having recently sent location updates.
// Stale distances are expected if either user hasn't opened the app recently:
// coordinates are only refreshed when a client foregrounds / focuses a
// discovery tab and calls this endpoint (see frontend _layout.tsx AppState +
// (tabs)/index.tsx & right-now.tsx focus effects). This handler persists to BOTH
// the durable DB columns (survives a Redis flush/restart) AND the Redis geo
// index (the fast query layer) so neither layer can silently go stale.
export async function updateLocation(req: Request, res: Response): Promise<void> {
  const { lat, lng } = req.body as z.infer<typeof locationSchema>;
  const userId = req.user!.sub;

  // Check for active city profile (travel mode)
  const activeProfile = await prisma.cityProfile.findFirst({
    where: { userId, isActive: true },
  });

  if (activeProfile) {
    // User is in travel mode — real location update deactivates travel mode ("returning home")
    await prisma.cityProfile.updateMany({
      where: { userId },
      data: { isActive: false, visitingSoonBadge: false },
    });
  }

  // Fuzz to ±500m grid before storing — exact coordinates are NEVER persisted
  const { lat: fuzzyLat, lng: fuzzyLng } = fuzzyCoordinates(lat, lng);
  // Durable source of truth: persist the fuzzed coords so location survives a
  // Redis flush/restart and downstream features (grid rehydration, geohash for
  // add-ons) can read it. The Redis geo index below is the fast query layer.
  await prisma.user.update({
    where: { id: userId },
    data: { locationLat: fuzzyLat, locationLng: fuzzyLng, locationUpdatedAt: new Date() },
  });
  await redis.geoadd(RedisKeys.geoUsers, fuzzyLng, fuzzyLat, userId);
  await redis.set(RedisKeys.presence(userId), '1', 'EX', env.grid.onlineWindowSeconds);
  res.status(200).json({ ok: true });
}

/** POST /api/v1/me/fcm-token — register/refresh this device's FCM token for background push. */
export async function setFcmToken(req: Request, res: Response): Promise<void> {
  const { token } = req.body as z.infer<typeof fcmTokenSchema>;
  await prisma.user.update({ where: { id: req.user!.sub }, data: { fcmToken: token } });
  res.status(200).json({ ok: true });
}

export async function getPublicProfile(req: Request, res: Response): Promise<void> {
  const viewerId = req.user!.sub;
  const parsedUserId = uuidParam.safeParse(req.params.userId);
  if (!parsedUserId.success) { res.status(400).json({ error: 'validation_error', message: 'Invalid ID format' }); return; }
  const userId = parsedUserId.data;

  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: viewerId, blockedId: userId }, { blockerId: userId, blockedId: viewerId }] },
    select: { id: true },
  });
  if (blocked) throw Errors.notFound('Profile not available');

  const [user, viewer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { photos: { orderBy: { order: 'asc' } }, prompts: { orderBy: { order: 'asc' } } },
    }),
    prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        incognitoMode: true,
        interests: true,
        topArtists: true,
        tribes: true,
        settings: true,
      },
    }),
  ]);
  if (!user) throw Errors.notFound('Profile not found');

  const viewerIncognito = viewer?.incognitoMode || viewer?.settings?.incognito;
  if (!viewerIncognito && viewerId !== userId) {
    const now = new Date();
    const view = await prisma.profileView.upsert({
      where: { viewerId_viewedId: { viewerId, viewedId: userId } },
      update: { createdAt: now },
      create: { viewerId, viewedId: userId, createdAt: now },
    });

    const viewerCardUser = await prisma.user.findUnique({
      where: { id: viewerId },
      include: {
        photos: { where: { isPrimary: true, isPrivate: false }, take: 1 },
        settings: true,
        cityProfiles: { where: { isActive: true }, take: 1 },
      },
    });
    if (viewerCardUser) {
      emitToUser(userId, 'profile.viewed', {
        viewId: view.id,
        viewerId,
        viewerCard: serializeGridCard(await signUserPhotos(viewerCardUser), 0, false, false),
        viewedAt: view.createdAt.toISOString(),
      });
    }
  }

  // Surface the viewer's own like (tap) / shortlist (favorite) state so the
  // profile screen can render Fire/Star as active and stay in sync with the grid.
  const [tap, favorite] = await Promise.all([
    prisma.tap.findUnique({
      where: { senderId_receiverId: { senderId: viewerId, receiverId: userId } },
      select: { id: true },
    }),
    prisma.favorite.findUnique({
      where: { userId_favoriteId: { userId: viewerId, favoriteId: userId } },
      select: { id: true },
    }),
  ]);

  res.status(200).json(
    serializePublicProfile(await signUserPhotos(user), viewer, { isLiked: !!tap, isShortlisted: !!favorite }),
  );
}

// ── Rooms a user has joined (mutual-groups) ──────────────
// Powers the "Groups in Common" section of the in-chat contact profile. The
// client intersects this with its own joined rooms. Blocked either direction → 404.
export async function getUserRooms(req: Request, res: Response): Promise<void> {
  const viewerId = req.user!.sub;
  const parsed = uuidParam.safeParse(req.params.userId);
  if (!parsed.success) { res.status(400).json({ error: 'validation_error', message: 'Invalid ID format' }); return; }
  const userId = parsed.data;

  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: viewerId, blockedId: userId }, { blockerId: userId, blockedId: viewerId }] },
    select: { id: true },
  });
  if (blocked) throw Errors.notFound('Profile not available');

  const memberships = await prisma.roomMember.findMany({
    where: { userId },
    include: { room: true },
  });
  const active = memberships.filter((m) => m.room.isActive);
  const rooms = await Promise.all(
    active.map(async (m) => ({
      id: m.room.id,
      name: m.room.name,
      category: m.room.category,
      coverImageUrl: await signUrl(m.room.coverImageUrl),
      memberCount: m.room.memberCount,
    })),
  );
  res.status(200).json({ rooms });
}

// ── Prompts ──────────────────────────────────────────────

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
  const cacheKey = RedisKeys.cacheCatalogs;
  const cached = await redis.get(cacheKey);
  if (cached) {
    res.status(200).json(JSON.parse(cached));
    return;
  }
  const payload = {
    prompts: TOP_PROMPTS,
    tribes: TRIBES,
    bodyTypes: BODY_TYPES,
    skinTones: SKIN_TONES,
    relationshipStatuses: RELATIONSHIP_STATUSES,
    lookingForOptions: LOOKING_FOR_OPTIONS,
    whereWeCanMeet: WHERE_WE_CAN_MEET,
    fantasyTagsCurated: FANTASY_TAGS_CURATED,
    datingIntentions: DATING_INTENTIONS,
  };
  await redis.set(cacheKey, JSON.stringify(payload), 'EX', 86400);
  res.status(200).json(payload);
}
