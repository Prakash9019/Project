import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './profile.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

// ── Self profile ──────────────────────────────────────────
router.patch('/me', validate(c.updateProfileSchema), asyncHandler(c.updateProfile));
router.patch('/me/settings', validate(c.settingsSchema), asyncHandler(c.updateSettings));
router.post('/me/location', validate(c.locationSchema), asyncHandler(c.updateLocation));

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

export default router;
