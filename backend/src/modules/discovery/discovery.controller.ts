import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { Errors } from '../../utils/httpError';
import { serializeGridCard } from '../profile/profile.serializer';
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
  res.status(200).json({ favorites: favorites.map((f) => serializeGridCard(f.favorite, 0, false, false, favIds)) });
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

  const senderCard = sender ? serializeGridCard(sender, 0, false, false) : null;
  emitToUser(receiverId, 'tap.received', { tapId: tap.id, senderId, senderCard, createdAt: tap.createdAt });
  res.status(201).json({ id: tap.id });
}

export async function receivedTaps(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const taps = await prisma.tap.findMany({
    where: { receiverId: userId },
    include: { sender: { include: { photos: { where: { isPrimary: true }, take: 1 } } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.status(200).json({ taps: taps.map((t) => ({ id: t.id, sender: serializeGridCard(t.sender, 0, false, false), createdAt: t.createdAt })) });
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
    views: views.map((v) => ({
      id: v.id,
      viewer: serializeGridCard(v.viewer, 0, false, false),
      viewedAt: v.createdAt,
    })),
  });
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
  res.status(200).json({ albums: grants.map((g) => ({ ...g.album, owner: serializeGridCard(g.album.owner, 0, false, false) })) });
}
