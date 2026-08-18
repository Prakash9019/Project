import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import { requirePlan } from '../../middleware/subscription';
import { aiLimiter } from '../../middleware/rateLimit';
import * as c from './ai.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone, requirePlan('platinum'), aiLimiter);

router.get('/icebreakers', asyncHandler(c.getIcebreakers));
router.get('/reply-suggestions', asyncHandler(c.getReplySuggestions));
router.get('/compatibility/:userId', asyncHandler(c.getCompatibility));
router.get('/top-10', asyncHandler(c.getDailyTop10));
router.get('/profile-optimizer', asyncHandler(c.getProfileOptimizer));

export default router;
