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
  updateRoomSchema,
  pinMessageSchema,
  updateMemberRoleSchema,
  updateRoomPhotoSchema,
  transferOwnershipSchema,
} from './rooms.schema';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

// Discovery / listing
router.get('/', validate(listRoomsQuerySchema, 'query'), asyncHandler(c.listRooms));
router.get('/joined', validate(listJoinedQuerySchema, 'query'), asyncHandler(c.listJoined));

// Invites — MUST be registered before '/:roomId' so "invites" isn't matched as a roomId.
router.get('/invites', asyncHandler(c.listInvites));
router.post('/invites/:inviteId/accept', asyncHandler(c.acceptInvite));
router.post('/invites/:inviteId/decline', asyncHandler(c.declineInvite));
router.delete('/invites/:inviteId', asyncHandler(c.cancelInvite));

router.get('/:roomId', asyncHandler(c.getRoom));

// Admin / creator: edit room info
router.patch('/:roomId', validate(updateRoomSchema), asyncHandler(c.updateRoom));
// Admin / creator: change the group photo
router.patch('/:roomId/photo', validate(updateRoomPhotoSchema), asyncHandler(c.updateRoomPhoto));
// Creator only: transfer ownership / delete the room
router.post('/:roomId/transfer-ownership', validate(transferOwnershipSchema), asyncHandler(c.transferOwnership));
router.delete('/:roomId', asyncHandler(c.deleteRoom));

// Join / leave
router.post('/:roomId/join', asyncHandler(c.joinRoom));
router.delete('/:roomId/join', asyncHandler(c.leaveRoom));

// Invite or directly add a user to a room (must be a member to do this).
router.post('/:roomId/invite-or-add/:userId', requireRoomMember, asyncHandler(c.inviteOrAddMember));

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

// Admin / creator: pin a message
router.post(
  '/:roomId/messages/:messageId/pin',
  requireRoomMember,
  validate(pinMessageSchema),
  asyncHandler(c.pinMessage),
);

// Members — require membership
router.get(
  '/:roomId/members',
  requireRoomMember,
  validate(listMembersQuerySchema, 'query'),
  asyncHandler(c.listMembers),
);

// Admin / creator: remove a member; creator only: change a member's role
router.delete('/:roomId/members/:userId', asyncHandler(c.removeMember));
router.patch('/:roomId/members/:userId', validate(updateMemberRoleSchema), asyncHandler(c.updateMemberRole));

// Room-level actions
router.post('/:roomId/mute', asyncHandler(c.muteRoom));
router.post('/:roomId/report', validate(reportRoomSchema), asyncHandler(c.reportRoom));

export default router;
