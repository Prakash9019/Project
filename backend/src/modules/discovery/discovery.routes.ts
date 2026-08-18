import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import { requireCapability } from '../../middleware/subscription';
import * as c from './discovery.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

// Favorites
router.get('/favorites', asyncHandler(c.listFavorites));
router.post('/favorites', validate(c.favoriteSchema), asyncHandler(c.addFavorite));
router.delete('/favorites/:userId', asyncHandler(c.removeFavorite));

// Taps
router.post('/taps', validate(c.tapSchema), asyncHandler(c.sendTap));
router.get('/taps', asyncHandler(c.receivedTaps));
router.delete('/taps/:userId', asyncHandler(c.removeTap));

// Viewed me — Gold+ (`whoViewedMe` in PLAN_LIMITS), enforced server-side.
router.get('/views', requireCapability('whoViewedMe'), asyncHandler(c.viewedMe));

// Right Now feed (nearby users with an active status)
router.get('/right-now', asyncHandler(c.rightNowFeed));

// Private albums
router.get('/albums', asyncHandler(c.listMyAlbums));
router.post('/albums', validate(c.createAlbumSchema), asyncHandler(c.createAlbum));
router.post('/albums/:albumId/grant', validate(c.grantAlbumSchema), asyncHandler(c.grantAlbumAccess));
router.delete('/albums/:albumId/grant/:userId', asyncHandler(c.revokeAlbumAccess));
router.get('/albums/shared', asyncHandler(c.sharedWithMe));

export default router;
