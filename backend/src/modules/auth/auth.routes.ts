import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import * as c from './auth.controller';

const router = Router();

router.post('/firebase', validate(c.firebaseLoginSchema), asyncHandler(c.firebaseLogin));
router.post('/dev-login', validate(c.devLoginSchema), asyncHandler(c.devLogin));
router.post('/refresh', validate(c.refreshSchema), asyncHandler(c.refresh));
router.post('/logout', validate(c.logoutSchema), asyncHandler(c.logout));
router.get('/me', requireAuth, asyncHandler(c.me));

export default router;
