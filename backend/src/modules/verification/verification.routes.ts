import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './verification.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

router.get('/status', asyncHandler(c.getVerificationStatus));
router.post('/photo', validate(c.submitSchema), asyncHandler(c.submitPhotoVerification));
router.post('/face', validate(c.submitSchema), asyncHandler(c.submitFaceVerification));

export default router;
