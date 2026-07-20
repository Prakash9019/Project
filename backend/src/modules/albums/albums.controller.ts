import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { Errors, HttpError } from '../../utils/httpError';
import { isBlocked } from '../../utils/blocks';
import { moderateImage } from '../../services/imageModeration';
import { signUrl } from '../../utils/signUrl';


// ── Schemas ──────────────────────────────────────────────

export const createAlbumSchema = z.object({
  title: z.string().min(1).max(50),
});

export const updateAlbumSchema = z.object({
  title:       z.string().min(1).max(50).optional(),
  coverPhotoId: z.string().uuid().optional().nullable(),
  privacy:     z.enum(['everyone', 'matches', 'chats_only', 'nobody']).optional(),
});

/**
 * Whether `viewerId` may see `ownerId`'s albums given `privacy`.
 * 'chats_only' (default) and 'matches' both require the owner to have replied
 * at least once in a conversation with the viewer — there is no separate
 * match concept in this app, so a two-way conversation stands in for it.
 */
async function canViewAlbums(viewerId: string, ownerId: string, privacy: string): Promise<boolean> {
  if (viewerId === ownerId) return true;
  if (privacy === 'everyone') return true;
  if (privacy === 'nobody') return false;

  const [userAId, userBId] = ownerId < viewerId ? [ownerId, viewerId] : [viewerId, ownerId];
  const convo = await prisma.conversation.findUnique({
    where: { userAId_userBId: { userAId, userBId } },
    select: { aHasReplied: true, bHasReplied: true },
  });
  if (!convo) return false;
  return convo.aHasReplied || convo.bHasReplied;
}

export const reorderPhotosSchema = z.object({
  order: z.array(z.object({
    photoId: z.string().uuid(),
    order:   z.number().int().min(0),
  })).min(1),
});

// ── Endpoints ────────────────────────────────────────────

/** GET /api/albums — list the authenticated user's albums. */
export async function listAlbums(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const albums = await prisma.album.findMany({
    where: { userId, deletedAt: null },
    include: {
      _count: { select: { photos: true } },
      coverPhoto: { select: { id: true, photoUrl: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const serialized = await Promise.all(
    albums.map(async (a) => ({
      id: a.id,
      title: a.title,
      privacy: a.privacy,
      photoCount: a._count.photos,
      coverPhoto: a.coverPhoto ? { id: a.coverPhoto.id, url: await signUrl(a.coverPhoto.photoUrl) } : null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }))
  );
  res.status(200).json({ albums: serialized });
}

/** POST /api/albums — create a new album (enforces plan album limit). */
export async function createAlbum(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { title } = req.body as z.infer<typeof createAlbumSchema>;
  const { maxAlbums } = req.effectiveLimits!.albums;
  if (maxAlbums !== null) {
    const existing = await prisma.album.count({ where: { userId, deletedAt: null } });
    if (existing >= maxAlbums) {
      throw Errors.forbidden(`Album limit reached. Your plan allows ${maxAlbums} album(s). Upgrade to create more.`);
    }
  }
  const album = await prisma.album.create({ data: { userId, title } });
  res.status(201).json({ id: album.id, title: album.title, photoCount: 0, coverPhoto: null, createdAt: album.createdAt });
}

/** GET /api/albums/:albumId — get album detail with all photos (cursor-based pagination). */
export async function getAlbum(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { albumId } = req.params;
  const cursor = req.query.cursor as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 20), 100);

  const album = await prisma.album.findFirst({
    where: { id: albumId, userId, deletedAt: null },
    include: { coverPhoto: { select: { id: true, photoUrl: true } } },
  });
  if (!album) throw Errors.notFound('Album not found');

  const photos = await prisma.albumPhoto.findMany({
    where: { albumId, ...(cursor ? { id: { gt: cursor } } : {}) },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });

  const hasMore = photos.length > limit;
  const page = hasMore ? photos.slice(0, limit) : photos;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const signedPhotos = await Promise.all(
    page.map(async (p) => ({
      id: p.id,
      url: await signUrl(p.photoUrl),
      path: p.photoUrl,
      order: p.order,
      createdAt: p.createdAt,
    }))
  );
  res.status(200).json({
    id: album.id,
    title: album.title,
    coverPhoto: album.coverPhoto
      ? { id: album.coverPhoto.id, url: await signUrl(album.coverPhoto.photoUrl) }
      : null,
    photos: signedPhotos,
    nextCursor,
    hasMore,
  });
}

/** PATCH /api/albums/:albumId — update album title or cover photo. */
export async function updateAlbum(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { albumId } = req.params;
  const { title, coverPhotoId, privacy } = req.body as z.infer<typeof updateAlbumSchema>;

  const album = await prisma.album.findFirst({ where: { id: albumId, userId, deletedAt: null } });
  if (!album) throw Errors.notFound('Album not found');

  // Validate coverPhotoId belongs to this album if provided
  if (coverPhotoId) {
    const photo = await prisma.albumPhoto.findFirst({ where: { id: coverPhotoId, albumId } });
    if (!photo) throw Errors.badRequest('Cover photo must belong to this album');
  }

  const updated = await prisma.album.update({
    where: { id: albumId },
    data: {
      ...(title ? { title } : {}),
      ...(coverPhotoId !== undefined ? { coverPhotoId } : {}),
      ...(privacy ? { privacy } : {}),
    },
    include: { coverPhoto: { select: { id: true, photoUrl: true } } },
  });

  res.status(200).json({
    id: updated.id,
    title: updated.title,
    privacy: updated.privacy,
    coverPhoto: updated.coverPhoto
      ? { id: updated.coverPhoto.id, url: await signUrl(updated.coverPhoto.photoUrl) }
      : null,
    updatedAt: updated.updatedAt,
  });
}

/** DELETE /api/albums/:albumId — soft-delete album and all its photos. */
export async function deleteAlbum(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { albumId } = req.params;
  const album = await prisma.album.findFirst({ where: { id: albumId, userId, deletedAt: null } });
  if (!album) throw Errors.notFound('Album not found');

  await prisma.album.update({ where: { id: albumId }, data: { deletedAt: new Date() } });
  res.status(204).send();
}

/** POST /api/albums/:albumId/photos — upload a photo to an album. */
export async function addPhotoToAlbum(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { albumId } = req.params;
  const { url } = req.body as { url: string };

  if (!url || typeof url !== 'string') throw Errors.badRequest('url is required');

  const album = await prisma.album.findFirst({ where: { id: albumId, userId, deletedAt: null } });
  if (!album) throw Errors.notFound('Album not found');

  const { maxPhotosPerAlbum } = req.effectiveLimits!.albums;
  const photoCount = await prisma.albumPhoto.count({ where: { albumId } });
  if (photoCount >= maxPhotosPerAlbum) {
    throw Errors.forbidden(`Photo limit reached. Your plan allows ${maxPhotosPerAlbum} photos per album.`);
  }

  const modResult = await moderateImage(url);
  if (modResult === 'reject') throw Errors.badRequest('Photo rejected: content violates community guidelines');

  const photo = await prisma.albumPhoto.create({
    data: { albumId, userId, photoUrl: url, order: photoCount },
  });

  // Auto-set as cover if this is the first photo
  if (photoCount === 0) {
    await prisma.album.update({ where: { id: albumId }, data: { coverPhotoId: photo.id } });
  }

  const signedU = await signUrl(photo.photoUrl);
  res.status(201).json({ id: photo.id, url: signedU, order: photo.order, createdAt: photo.createdAt });
}

/** DELETE /api/albums/:albumId/photos/:photoId — remove a photo from an album. */
export async function removePhotoFromAlbum(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { albumId, photoId } = req.params;

  const photo = await prisma.albumPhoto.findFirst({ where: { id: photoId, albumId, userId } });
  if (!photo) throw Errors.notFound('Photo not found');

  // If this was the cover, clear it
  const album = await prisma.album.findFirst({ where: { id: albumId } });
  if (album?.coverPhotoId === photoId) {
    await prisma.album.update({ where: { id: albumId }, data: { coverPhotoId: null } });
  }

  await prisma.albumPhoto.delete({ where: { id: photoId } });
  res.status(204).send();
}

/** PATCH /api/albums/:albumId/photos/reorder — reorder photos within an album. */
export async function reorderPhotos(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const { albumId } = req.params;
  const { order } = req.body as z.infer<typeof reorderPhotosSchema>;

  const album = await prisma.album.findFirst({ where: { id: albumId, userId, deletedAt: null } });
  if (!album) throw Errors.notFound('Album not found');

  await prisma.$transaction(
    order.map(({ photoId, order: newOrder }) =>
      prisma.albumPhoto.updateMany({
        where: { id: photoId, albumId, userId },
        data: { order: newOrder },
      })
    )
  );

  res.status(200).json({ ok: true });
}

/** GET /api/v1/users/:userId/albums/:albumId — view a single album owned by another user. */
export async function viewUserAlbumDetail(req: Request, res: Response): Promise<void> {
  const viewerId = req.user!.sub;
  const { userId, albumId } = req.params;
  const cursor = req.query.cursor as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 20), 100);

  if (await isBlocked(viewerId, userId)) {
    throw Errors.notFound('User not found');
  }

  const album = await prisma.album.findFirst({
    where: { id: albumId, userId, deletedAt: null },
    include: { coverPhoto: { select: { id: true, photoUrl: true } } },
  });
  if (!album) throw Errors.notFound('Album not found');

  if (!(await canViewAlbums(viewerId, userId, album.privacy))) {
    throw new HttpError(403, 'album_locked', 'Start a conversation to unlock this album');
  }

  const photos = await prisma.albumPhoto.findMany({
    where: { albumId, ...(cursor ? { id: { gt: cursor } } : {}) },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });

  const hasMore = photos.length > limit;
  const page = hasMore ? photos.slice(0, limit) : photos;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const signedPhotos = await Promise.all(
    page.map(async (p) => ({
      id: p.id,
      url: await signUrl(p.photoUrl),
      order: p.order,
      createdAt: p.createdAt,
    }))
  );

  res.status(200).json({
    id: album.id,
    title: album.title,
    coverPhoto: album.coverPhoto
      ? { id: album.coverPhoto.id, url: await signUrl(album.coverPhoto.photoUrl) }
      : null,
    photos: signedPhotos,
    nextCursor,
    hasMore,
  });
}

/** GET /api/users/:userId/albums — view another user's albums (block-safe). */
export async function viewUserAlbums(req: Request, res: Response): Promise<void> {
  const viewerId = req.user!.sub;
  const { userId } = req.params;

  if (await isBlocked(viewerId, userId)) {
    throw Errors.notFound('User not found');
  }

  const albums = await prisma.album.findMany({
    where: { userId, deletedAt: null },
    include: {
      _count: { select: { photos: true } },
      coverPhoto: { select: { id: true, photoUrl: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const serialized = await Promise.all(
    albums.map(async (a) => {
      const locked = !(await canViewAlbums(viewerId, userId, a.privacy));
      return {
        id: a.id,
        title: a.title,
        photoCount: a._count.photos,
        locked,
        coverPhoto: !locked && a.coverPhoto ? { id: a.coverPhoto.id, url: await signUrl(a.coverPhoto.photoUrl) } : null,
        createdAt: a.createdAt,
      };
    })
  );
  res.status(200).json({ albums: serialized });
}
