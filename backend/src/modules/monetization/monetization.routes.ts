import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './monetization.controller';

const router = Router();

// public catalog
router.get('/plans', asyncHandler(c.plans));

// everything else needs an authenticated, verified user
router.use(requireAuth, requireVerifiedPhone);

router.get('/wallet', asyncHandler(c.wallet));
router.post('/subscribe', validate(c.subscribeSchema), asyncHandler(c.subscribe));
router.post('/credits/purchase', validate(c.purchaseCreditsSchema), asyncHandler(c.purchaseCredits));
router.post('/boosts', validate(c.boostSchema), asyncHandler(c.createBoost));
router.get('/boosts/active', asyncHandler(c.activeBoost));
router.post('/verify', validate(c.verifySchema), asyncHandler(c.verifyAccount));

export default router;
