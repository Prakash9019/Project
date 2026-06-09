import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as c from './grid.controller';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

router.get('/', validate(c.gridQuerySchema, 'query'), asyncHandler(c.grid));

export default router;
