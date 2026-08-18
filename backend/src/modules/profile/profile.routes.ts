import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import { requirePlan } from '../../middleware/subscription';
import { uploadLimiter } from '../../middleware/rateLimit';
import * as c from './profile.controller';
import * as media from './media.controller';
import { viewUserAlbums, viewUserAlbumDetail } from '../albums/albums.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

// ── Self profile ──────────────────────────────────────────
router.patch('/me', validate(c.updateProfileSchema), asyncHandler(c.updateProfile));
router.patch('/me/settings', validate(c.settingsSchema), asyncHandler(c.updateSettings));
router.post('/me/location', validate(c.locationSchema), asyncHandler(c.updateLocation));
router.post('/me/fcm-token', validate(c.fcmTokenSchema), asyncHandler(c.setFcmToken));

// ── Photos ───────────────────────────────────────────────
router.post('/me/photos', validate(c.addPhotoSchema), asyncHandler(c.addPhoto));
router.put('/me/photos/:photoId/primary', asyncHandler(c.setPrimaryPhoto));
router.delete('/me/photos/:photoId', asyncHandler(c.deletePhoto));

// ── Prompts ──────────────────────────────────────────────
router.get('/me/prompts', asyncHandler(c.listPrompts));
router.post('/me/prompts', validate(c.promptSchema), asyncHandler(c.addPrompt));
router.patch('/me/prompts/:promptId', validate(c.promptSchema), asyncHandler(c.updatePrompt));
router.delete('/me/prompts/:promptId', asyncHandler(c.deletePrompt));

// ── PIN lock ─────────────────────────────────────────────
router.post('/me/pin', validate(c.pinSetSchema), asyncHandler(c.setPin));
router.delete('/me/pin', validate(c.pinVerifySchema), asyncHandler(c.removePin));
router.post('/me/pin/verify', validate(c.pinVerifySchema), asyncHandler(c.verifyPinHandler));

// ── Catalogs ─────────────────────────────────────────────
router.get('/catalogs', asyncHandler(c.getCatalogs));

// ── Public profile (Profile Inspection Overlay) ──────────
router.get('/users/:userId', asyncHandler(c.getPublicProfile));

// ── Rooms a user has joined (mutual-groups section in chat contact profile) ──
router.get('/users/:userId/rooms', asyncHandler(c.getUserRooms));

// ── User albums (Change 7: view another user's public albums) ──
router.get('/users/:userId/albums', asyncHandler(viewUserAlbums));
router.get('/users/:userId/albums/:albumId', asyncHandler(viewUserAlbumDetail));

// ── Media clips (Premium+) ───────────────────────────────
router.post(
  '/me/voice-clip',
  requirePlan('premium', 'gold', 'platinum'),
  (req, res, next) => media.voiceUploadMiddleware(req, res, (err) => {
    if (err) return next(err);
    next();
  }),
  asyncHandler(media.uploadVoiceClip)
);
router.post(
  '/me/video-clip',
  requirePlan('premium', 'gold', 'platinum'),
  (req, res, next) => media.videoUploadMiddleware(req, res, (err) => {
    if (err) return next(err);
    next();
  }),
  asyncHandler(media.uploadVideoClip)
);

// ── Pre-signed R2 upload URL ─────────────────────────────
router.get('/me/upload-url', uploadLimiter, asyncHandler(media.getUploadUrl));
router.get('/me/photos/upload-url', uploadLimiter, asyncHandler(media.getUploadUrl));

export default router;
