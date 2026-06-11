import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './calls.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

router.get('/ice-config', asyncHandler(c.iceConfig));
router.get('/', validate(c.callHistoryQuerySchema, 'query'), asyncHandler(c.callHistory));
router.post('/', validate(c.initiateCallSchema), asyncHandler(c.initiateCall));
router.post('/schedule', validate(c.scheduleCallSchema), asyncHandler(c.scheduleCall));
router.patch('/:callId', validate(c.updateCallSchema), asyncHandler(c.updateCall));

export default router;
