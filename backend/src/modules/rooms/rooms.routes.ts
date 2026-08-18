import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import { requirePlan } from '../../middleware/subscription';
import { requireRoomMember } from './requireRoomMember';
import * as c from './rooms.controller';
import * as calls from './roomCalls.controller';
import {
  listRoomsQuerySchema,
  listJoinedQuerySchema,
  listMessagesQuerySchema,
  listMediaQuerySchema,
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
  createRoomSchema,
  bulkAddMembersSchema,
  editMessageSchema,
  forwardMessageSchema,
} from './rooms.schema';

const router = Router();
router.use(requireAuth, requireVerifiedPhone);

// Discovery / listing
router.get('/', validate(listRoomsQuerySchema, 'query'), asyncHandler(c.listRooms));
router.get('/joined', validate(listJoinedQuerySchema, 'query'), asyncHandler(c.listJoined));

// Create a user-owned group (creator becomes an admin member).
router.post('/', validate(createRoomSchema), asyncHandler(c.createRoom));

// Invites — MUST be registered before '/:roomId' so "invites" isn't matched as a roomId.
router.get('/invites', asyncHandler(c.listInvites));
router.post('/invites/:inviteId/accept', asyncHandler(c.acceptInvite));
router.post('/invites/:inviteId/decline', asyncHandler(c.declineInvite));
router.delete('/invites/:inviteId', asyncHandler(c.cancelInvite));

// Invite-link join — MUST precede '/:roomId' so "by-code" isn't matched as a roomId.
router.get('/by-code/:code', asyncHandler(c.getRoomByCode));
router.post('/by-code/:code/join', asyncHandler(c.joinRoomByCode));

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

// Bulk add/invite members (creator/admin only — asserted in the service).
router.post(
  '/:roomId/members/bulk',
  requireRoomMember,
  validate(bulkAddMembersSchema),
  asyncHandler(c.bulkAddMembers),
);

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
// Shared media / links / documents (Group Info screen) — require membership
router.get(
  '/:roomId/media',
  requireRoomMember,
  validate(listMediaQuerySchema, 'query'),
  asyncHandler(c.listMedia),
);
router.post(
  '/:roomId/messages/:messageId/react',
  requireRoomMember,
  validate(reactSchema),
  asyncHandler(c.reactToMessage),
);
router.get(
  '/:roomId/messages/:messageId/reactions',
  requireRoomMember,
  asyncHandler(c.listMessageReactions),
);
router.post(
  '/:roomId/messages/:messageId/report',
  validate(reportMessageSchema),
  asyncHandler(c.reportMessage),
);
router.delete('/:roomId/messages/:messageId', asyncHandler(c.deleteMessage));
router.delete('/:roomId/messages/:messageId/hide', requireRoomMember, asyncHandler(c.deleteMessageForMe));
router.post(
  '/:roomId/messages/:messageId/forward',
  requireRoomMember,
  validate(forwardMessageSchema),
  asyncHandler(c.forwardMessage),
);
router.patch(
  '/:roomId/messages/:messageId',
  requireRoomMember,
  requirePlan('gold', 'platinum'),
  validate(editMessageSchema),
  asyncHandler(c.editMessage),
);

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

// Group audio/video calling — require membership, mirrors 1:1 calling (calls.routes.ts)
router.get('/:roomId/calls/active', requireRoomMember, asyncHandler(calls.getActiveRoomCall));
router.post(
  '/:roomId/calls',
  requireRoomMember,
  validate(calls.initiateRoomCallSchema),
  asyncHandler(calls.initiateRoomCall),
);
router.post('/:roomId/calls/:callId/join', requireRoomMember, asyncHandler(calls.joinRoomCall));
router.patch(
  '/:roomId/calls/:callId',
  requireRoomMember,
  validate(calls.updateRoomCallSchema),
  asyncHandler(calls.updateRoomCall),
);

export default router;
