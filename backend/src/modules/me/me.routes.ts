import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './me.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

router.get('/export', asyncHandler(c.exportData));
router.delete('/', validate(c.deleteAccountSchema), asyncHandler(c.deleteAccount));

export default router;
