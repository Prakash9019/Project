import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import { requirePlan } from '../../middleware/subscription';
import * as c from './city-profiles.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone, requirePlan('gold', 'platinum'));

router.get('/', asyncHandler(c.listCityProfiles));
router.post('/', validate(c.createCityProfileSchema), asyncHandler(c.createCityProfile));
router.post('/:profileId/activate', asyncHandler(c.activateCityProfile));
router.delete('/:profileId', asyncHandler(c.deleteCityProfile));

export default router;
