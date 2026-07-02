import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import * as c from './auth.controller';
import * as emailOtp from './emailOtp.controller';

const router = Router();

router.post('/firebase', validate(c.firebaseLoginSchema), asyncHandler(c.firebaseLogin));
router.post('/dev-login', validate(c.devLoginSchema), asyncHandler(c.devLogin));
router.post('/refresh', validate(c.refreshSchema), asyncHandler(c.refresh));
router.post('/logout', validate(c.logoutSchema), asyncHandler(c.logout));
router.get('/me', requireAuth, asyncHandler(c.me));

// Email OTP login (custom 6-digit code via Resend) — no Firebase involved.
router.post('/email/send-otp', validate(emailOtp.sendEmailOtpSchema), asyncHandler(emailOtp.sendEmailOtp));
router.post('/email/verify-otp', validate(emailOtp.verifyEmailOtpSchema), asyncHandler(emailOtp.verifyEmailOtp));

export default router;
