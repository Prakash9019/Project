import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import * as c from './auth.controller';

const router = Router();

router.post('/request-otp', validate(c.requestOtpSchema), asyncHandler(c.requestOtp));
router.post('/verify-otp', validate(c.verifyOtpSchema), asyncHandler(c.verifyOtp));
router.post('/refresh', validate(c.refreshSchema), asyncHandler(c.refresh));
router.post('/logout', requireAuth, asyncHandler(c.logout));
router.get('/me', requireAuth, asyncHandler(c.me));

export default router;
