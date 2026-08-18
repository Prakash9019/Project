import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import { requireCapability } from '../../middleware/subscription';
import * as c from './explore.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

router.get('/', requireCapability('exploreAccess'), validate(c.exploreQuerySchema, 'query'), asyncHandler(c.explore));
router.get('/for-you', requireCapability('exploreAccess'), asyncHandler(c.forYou));

export default router;
