import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { Errors } from '../../utils/httpError';
import { serializeGridCard, signUserPhotos } from '../profile/profile.serializer';
import { isOrientationVisible } from '../grid/grid.service';
import { getBlockedIds } from '../../utils/blocks';
import { emitToUser } from '../../realtime/emitter';
import { recordInteraction } from '../chat/chat.service';
import { uuidParam } from '../../utils/validators';

const targetSchema = z.object({ userId: z.string().uuid() });

// ── Favorites ─────────────────────────────────────────────

export async function listFavorites(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    include: { favorite: { include: { photos: { where: { isPrimary: true }, take: 1 } } } },
    orderBy: { createdAt: 'desc' },
  });
  const favIds = new Set(favorites.map((f) => f.favoriteId));
  res.status(200).json({ favorites: await Promise.all(favorites.map(async (f) => serializeGridCard(await signUserPhotos(f.favorite), 0, false, false, favIds))) });
}

export async function addFavorite(req: Request, res: Response): Promise<void> {
  const { userId: favoriteId } = req.body as z.infer<typeof targetSchema>;
  const userId = req.user!.sub;
  if (userId === favoriteId) throw Errors.badRequest('Cannot favorite yourself');

  // Shortlisting counts as a "like" interaction for the free-tier cap
  await recordInteraction(userId, favoriteId, 'like');

  const fav = await prisma.favorite.upsert({
    where: { userId_favoriteId: { userId, favoriteId } },
    update: {},
    create: { userId, favoriteId },
  });
  res.status(201).json({ id: fav.id });
}

export async function removeFavorite(req: Request, res: Response): Promise<void> {
  const parsedFavoriteId = uuidParam.safeParse(req.params.userId);
  if (!parsedFavoriteId.success) { res.status(400).json({ error: 'validation_error', message: 'Invalid ID format' }); return; }
  const favoriteId = parsedFavoriteId.data;
  await prisma.favorite.deleteMany({ where: { userId: req.user!.sub, favoriteId } });
  res.status(204).send();
}

export { targetSchema as favoriteSchema };

// ── Taps (Likes) ─────────────────────────────────────────

export const tapSchema = z.object({ userId: z.string().uuid() });

export async function sendTap(req: Request, res: Response): Promise<void> {
  const senderId = req.user!.sub;
  const { userId: receiverId } = req.body as z.infer<typeof tapSchema>;
  if (senderId === receiverId) throw Errors.badRequest('Cannot tap yourself');

  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: senderId, blockedId: receiverId }, { blockerId: receiverId, blockedId: senderId }] },
    select: { id: true },
  });
  if (blocked) throw Errors.forbidden('Cannot tap this user');

  await recordInteraction(senderId, receiverId, 'like');

  const [tap, sender] = await Promise.all([
    prisma.tap.upsert({
      where: { senderId_receiverId: { senderId, receiverId } },
      update: { createdAt: new Date() },
      create: { senderId, receiverId },
    }),
    prisma.user.findUnique({
      where: { id: senderId },
      include: { photos: { where: { isPrimary: true, isPrivate: false }, take: 1 }, settings: true, cityProfiles: { where: { isActive: true }, take: 1 } },
    }),
  ]);

  const senderCard = sender ? serializeGridCard(await signUserPhotos(sender), 0, false, false) : null;
  emitToUser(receiverId, 'tap.received', {
    tapId: tap.id,
    senderId,
    senderCard,
    createdAt: tap.createdAt.toISOString(),
  });
  res.status(201).json({ id: tap.id });
}

export async function removeTap(req: Request, res: Response): Promise<void> {
  const senderId = req.user!.sub;
  const parsedReceiverId = uuidParam.safeParse(req.params.userId);
  if (!parsedReceiverId.success) { res.status(400).json({ error: 'validation_error', message: 'Invalid ID format' }); return; }
  await prisma.tap.deleteMany({ where: { senderId, receiverId: parsedReceiverId.data } });
  res.status(204).send();
}

export async function receivedTaps(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const taps = await prisma.tap.findMany({
    where: { receiverId: userId },
    include: { sender: { include: { photos: { where: { isPrimary: true }, take: 1 } } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.status(200).json({ taps: await Promise.all(taps.map(async (t) => ({ id: t.id, sender: serializeGridCard(await signUserPhotos(t.sender), 0, false, false), createdAt: t.createdAt }))) });
}

// ── Viewed Me (Gold+) ────────────────────────────────────

export async function viewedMe(req: Request, res: Response): Promise<void> {
  if (!req.effectiveLimits?.whoViewedMe) {
    throw Errors.forbidden('Who viewed me requires a Gold or Platinum plan');
  }
  const views = await prisma.profileView.findMany({
    where: { viewedId: req.user!.sub },
    include: {
      viewer: {
        include: {
          photos: { where: { isPrimary: true, isPrivate: false }, take: 1 },
          settings: true,
          cityProfiles: { where: { isActive: true }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.status(200).json({
    views: await Promise.all(views.map(async (v) => ({
      id: v.id,
      viewer: serializeGridCard(await signUserPhotos(v.viewer), 0, false, false),
      viewedAt: v.createdAt,
    }))),
  });
}

// ── Right Now feed ────────────────────────────────────────
// Nearby users with an active Right Now status. Honours blocks, the 14-day
// inactivity rule, grid visibility, and the same orientation filter as the grid.

const RIGHT_NOW_RADIUS_M = 100_000; // 100km — Right Now is a local feature
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export async function rightNowFeed(req: Request, res: Response): Promise<void> {
  const viewerId = req.user!.sub;
  const now = new Date();

  const [viewer, blockedIds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerId },
      select: { wantToSee: true, gender: true, genderIdentity: true },
    }),
    getBlockedIds(viewerId),
  ]);

  // Proximity candidates from the geo index (if the viewer has a known location).
  const distanceById = new Map<string, number>();
  const pos = (await redis.geopos(RedisKeys.geoUsers, viewerId)) as [string, string][] | null;
  const haveGeo = !!pos?.[0];
  if (haveGeo) {
    const [lng, lat] = pos![0];
    const raw = (await redis.geosearch(
      RedisKeys.geoUsers,
      'FROMLONLAT', lng, lat,
      'BYRADIUS', RIGHT_NOW_RADIUS_M, 'm',
      'ASC', 'WITHDIST', 'COUNT', 500,
    )) as [string, string][];
    for (const [member, dist] of raw) {
      if (member !== viewerId) distanceById.set(member, Number(dist) * 1000); // km→m
    }
  }

  const candidateIds = [...distanceById.keys()].filter((id) => !blockedIds.has(id));

  const users = await prisma.user.findMany({
    where: {
      ...(haveGeo ? { id: { in: candidateIds } } : { id: { notIn: [viewerId, ...blockedIds] } }),
      rightNowExpiresAt: { gt: now },
      isOnGrid: true,
      incognitoMode: false,
      lastActiveAt: { gte: new Date(Date.now() - FOURTEEN_DAYS_MS) },
      // A candidate with no UserSettings row (legacy/never-saved) defaults to
      // discoverable — mirrors the grid query below, otherwise every brand-new
      // user (no settings row yet) is silently excluded from Right Now.
      OR: [{ settings: { discoverable: true, stealthMode: false } }, { settings: { is: null } }],
    },
    include: {
      photos: { where: { isPrimary: true, isPrivate: false }, take: 1 },
      settings: true,
      cityProfiles: { where: { isActive: true }, take: 1 },
    },
    orderBy: { lastActiveAt: 'desc' },
    take: 100,
  });

  const filtered = users.filter((u) =>
    isOrientationVisible(
      { wantToSee: viewer?.wantToSee as string[], gender: viewer?.gender, genderIdentity: viewer?.genderIdentity },
      { whoCanDiscoverMe: u.whoCanDiscoverMe as string[], gender: u.gender, genderIdentity: u.genderIdentity },
    ),
  );
  const statuses = await Promise.all(filtered.map(async (u) => ({
    ...serializeGridCard(await signUserPhotos(u), distanceById.get(u.id) ?? 0, false, true),
    rightNowStatus: u.rightNowStatus,
    rightNowCategory: u.rightNowCategory,
    rightNowExpiresAt: u.rightNowExpiresAt,
    rightNowJoinedAt: u.updatedAt,
    distanceMeters: distanceById.get(u.id) ?? null,
  })));

  res.status(200).json({ statuses, total: statuses.length });
}

// ── Private Albums ────────────────────────────────────────

export const createAlbumSchema = z.object({ name: z.string().min(1).max(80).optional() });
export const grantAlbumSchema = z.object({ userId: z.string().uuid() });

export async function listMyAlbums(req: Request, res: Response): Promise<void> {
  const albums = await prisma.privateAlbum.findMany({
    where: { ownerId: req.user!.sub },
    include: { photos: true, grants: { select: { granteeId: true } } },
  });
  res.status(200).json({ albums });
}

export async function createAlbum(req: Request, res: Response): Promise<void> {
  const { name } = req.body as z.infer<typeof createAlbumSchema>;
  const album = await prisma.privateAlbum.create({ data: { ownerId: req.user!.sub, name: name ?? 'Private Album' } });
  res.status(201).json(album);
}

export async function grantAlbumAccess(req: Request, res: Response): Promise<void> {
  const { albumId } = req.params;
  const { userId: granteeId } = req.body as z.infer<typeof grantAlbumSchema>;
  const album = await prisma.privateAlbum.findFirst({ where: { id: albumId, ownerId: req.user!.sub } });
  if (!album) throw Errors.notFound('Album not found');
  await prisma.privateAlbumGrant.upsert({
    where: { albumId_granteeId: { albumId, granteeId } },
    update: {},
    create: { albumId, granteeId },
  });
  res.status(201).json({ ok: true });
}

export async function revokeAlbumAccess(req: Request, res: Response): Promise<void> {
  const parsedAlbumId = uuidParam.safeParse(req.params.albumId);
  const parsedGranteeId = uuidParam.safeParse(req.params.userId);
  if (!parsedAlbumId.success || !parsedGranteeId.success) { res.status(400).json({ error: 'validation_error', message: 'Invalid ID format' }); return; }
  const albumId = parsedAlbumId.data;
  const granteeId = parsedGranteeId.data;
  const album = await prisma.privateAlbum.findFirst({ where: { id: albumId, ownerId: req.user!.sub } });
  if (!album) throw Errors.notFound('Album not found');
  await prisma.privateAlbumGrant.deleteMany({ where: { albumId, granteeId } });
  res.status(204).send();
}

export async function sharedWithMe(req: Request, res: Response): Promise<void> {
  const grants = await prisma.privateAlbumGrant.findMany({
    where: { granteeId: req.user!.sub },
    include: { album: { include: { photos: true, owner: { include: { photos: { where: { isPrimary: true }, take: 1 } } } } } },
  });
  res.status(200).json({ albums: await Promise.all(grants.map(async (g) => ({ ...g.album, owner: serializeGridCard(await signUserPhotos(g.album.owner), 0, false, false) }))) });
}
