import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import * as c from './auth.controller';
import * as emailOtp from './emailOtp.controller';
import { authLimiter, otpLimiter } from '../../middleware/rateLimit';

const router = Router();

router.post('/firebase', authLimiter, validate(c.firebaseLoginSchema), asyncHandler(c.firebaseLogin));
router.post('/dev-login', authLimiter, validate(c.devLoginSchema), asyncHandler(c.devLogin));
router.post('/refresh', authLimiter, validate(c.refreshSchema), asyncHandler(c.refresh));
router.post('/logout', validate(c.logoutSchema), asyncHandler(c.logout));
router.get('/me', requireAuth, asyncHandler(c.me));

// Email OTP login (custom 6-digit code via Resend) — no Firebase involved.
router.post('/email/send-otp', otpLimiter, validate(emailOtp.sendEmailOtpSchema), asyncHandler(emailOtp.sendEmailOtp));
router.post('/email/verify-otp', authLimiter, validate(emailOtp.verifyEmailOtpSchema), asyncHandler(emailOtp.verifyEmailOtp));

export default router;
