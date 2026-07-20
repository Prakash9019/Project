import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './chat.controller';

// Mounted at /api/v1/messages — cross-conversation starred-message endpoints.
const router = Router();
router.use(requireAuth, requireVerifiedPhone);

router.get('/starred', asyncHandler(c.listStarredMessages));
router.post('/:messageId/star', validate(c.starSchema), asyncHandler(c.starMessage));
router.delete('/:messageId/star', asyncHandler(c.unstarMessage));

export default router;
