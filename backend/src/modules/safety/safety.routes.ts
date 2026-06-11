import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './safety.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

// Block / unblock
router.get('/blocks', asyncHandler(c.listBlocks));
router.post('/users/:userId/block', asyncHandler(c.block));
router.delete('/users/:userId/block', asyncHandler(c.unblock));

// Mute / unmute
router.get('/mutes', asyncHandler(c.listMutes));
router.post('/users/:userId/mute', asyncHandler(c.mute));
router.delete('/users/:userId/mute', asyncHandler(c.unmute));

// Report
router.post('/users/:userId/report', validate(c.reportSchema), asyncHandler(c.report));

// Panic hide (women's safety quick-exit)
router.post('/panic-hide', asyncHandler(c.panicHide));

export default router;
