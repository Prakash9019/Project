import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import { requireRoomMember } from './requireRoomMember';
import * as c from './rooms.controller';
import {
  listRoomsQuerySchema,
  listJoinedQuerySchema,
  listMessagesQuerySchema,
  sendMessageSchema,
  reactSchema,
  listMembersQuerySchema,
  reportRoomSchema,
  reportMessageSchema,
} from './rooms.schema';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

// Discovery / listing
router.get('/', validate(listRoomsQuerySchema, 'query'), asyncHandler(c.listRooms));
router.get('/joined', validate(listJoinedQuerySchema, 'query'), asyncHandler(c.listJoined));
router.get('/:roomId', asyncHandler(c.getRoom));

// Join / leave
router.post('/:roomId/join', asyncHandler(c.joinRoom));
router.delete('/:roomId/join', asyncHandler(c.leaveRoom));

// Messages — require membership
router.get(
  '/:roomId/messages',
  requireRoomMember,
  validate(listMessagesQuerySchema, 'query'),
  asyncHandler(c.listMessages),
);
router.post(
  '/:roomId/messages',
  requireRoomMember,
  validate(sendMessageSchema),
  asyncHandler(c.sendMessage),
);
router.post(
  '/:roomId/messages/:messageId/react',
  requireRoomMember,
  validate(reactSchema),
  asyncHandler(c.reactToMessage),
);
router.post(
  '/:roomId/messages/:messageId/report',
  validate(reportMessageSchema),
  asyncHandler(c.reportMessage),
);
router.delete('/:roomId/messages/:messageId', asyncHandler(c.deleteMessage));

// Members — require membership
router.get(
  '/:roomId/members',
  requireRoomMember,
  validate(listMembersQuerySchema, 'query'),
  asyncHandler(c.listMembers),
);

// Room-level actions
router.post('/:roomId/mute', asyncHandler(c.muteRoom));
router.post('/:roomId/report', validate(reportRoomSchema), asyncHandler(c.reportRoom));

export default router;
