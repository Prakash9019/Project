import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './albums.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

// Own album management
router.get('/', asyncHandler(c.listAlbums));
router.post('/', validate(c.createAlbumSchema), asyncHandler(c.createAlbum));
router.get('/:albumId', asyncHandler(c.getAlbum));
router.patch('/:albumId', validate(c.updateAlbumSchema), asyncHandler(c.updateAlbum));
router.delete('/:albumId', asyncHandler(c.deleteAlbum));

// Photos within an album
router.post('/:albumId/photos', asyncHandler(c.addPhotoToAlbum));
router.delete('/:albumId/photos/:photoId', asyncHandler(c.removePhotoFromAlbum));
router.patch('/:albumId/photos/reorder', validate(c.reorderPhotosSchema), asyncHandler(c.reorderPhotos));

export default router;
