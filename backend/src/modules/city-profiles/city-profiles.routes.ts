import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import { requireTravelAccess } from '../../middleware/travelAccess';
import { externalApiLimiter } from '../../middleware/rateLimit';
import * as c from './city-profiles.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone, requireTravelAccess);

router.get('/', asyncHandler(c.listCityProfiles));
// createCityProfile geocodes via the Google Maps API — a metered third party.
router.post('/', externalApiLimiter, validate(c.createCityProfileSchema), asyncHandler(c.createCityProfile));
router.post('/:profileId/activate', asyncHandler(c.activateCityProfile));
router.delete('/:profileId', asyncHandler(c.deleteCityProfile));

export default router;
