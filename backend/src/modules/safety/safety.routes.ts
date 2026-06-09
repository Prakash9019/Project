import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './safety.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

router.get('/blocks', asyncHandler(c.listBlocks));
router.post('/block', validate(c.blockSchema), asyncHandler(c.block));
router.delete('/block/:userId', asyncHandler(c.unblock));
router.post('/report', validate(c.reportSchema), asyncHandler(c.report));

export default router;
