import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './calls.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

router.get('/ice-config', asyncHandler(c.iceConfig));
router.get('/', validate(c.callHistoryQuerySchema, 'query'), asyncHandler(c.callHistory));

export default router;
