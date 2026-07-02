import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './verification.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

// Verification status
router.get('/status', asyncHandler(c.getVerificationStatus));

// Photo verification (face verification removed 20260618)
router.post('/photo', validate(c.submitSchema), asyncHandler(c.submitPhotoVerification));

// Identity verification (DigiLocker / Stripe Identity)
router.post('/identity', validate(c.identitySchema), asyncHandler(c.verifyIdentity));

// College verification
router.post('/college', validate(c.collegeSchema), asyncHandler(c.verifyCollege));
router.post('/college/confirm', validate(c.collegeConfirmSchema), asyncHandler(c.confirmCollegeOtp));

// Profile views & analytics (Gold+)
router.get('/profile-views', asyncHandler(c.listProfileViews));
router.get('/analytics', asyncHandler(c.getProfileAnalytics));

export default router;
