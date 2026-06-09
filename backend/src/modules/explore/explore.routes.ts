import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import { premiumFeature } from '../common/premium';
import * as c from './explore.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

router.get('/', premiumFeature('explore'), validate(c.exploreQuerySchema, 'query'), asyncHandler(c.explore));
router.get('/for-you', premiumFeature('for_you'), asyncHandler(c.forYou));

export default router;
