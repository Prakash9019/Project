import { z } from 'zod';

export const ROOM_CATEGORIES = [
  'city_dating',
  'orientation',
  'age_group',
  'relationship_intent',
  'events',
  'local_meetups',
] as const;

export const listRoomsQuerySchema = z.object({
  category: z.enum(ROOM_CATEGORIES).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listJoinedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// User-created group. The creator's RoomMember row is seeded with role 'admin'
// (RoomRole has no 'creator' value — creator status is derived from Room.creatorId).
export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  category: z.enum(ROOM_CATEGORIES),
  // Accepts a hosted URL or a bare R2 object key (signUrl presigns keys on read).
  coverImageUrl: z.string().trim().min(1).max(2048).optional(),
  isVerifiedOnly: z.boolean().optional().default(false),
  // Private groups are hidden from Discover and can only be joined via the
  // invite link or an admin add.
  isPrivate: z.boolean().optional().default(false),
});

export const bulkAddMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(50),
});

export const listMessagesQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

// Media / links / documents tab in Group Info. `type` narrows the shared-media
// query; omitting it returns all shared media (images + docs + voice).
export const listMediaQuerySchema = z.object({
  type: z.enum(['image', 'link', 'document', 'voice']).optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

export const sendMessageSchema = z
  .object({
    // Media messages (images/GIFs/voice) carry empty content; text needs content.
    content: z.string().trim().max(1000, 'Message too long').default(''),
    type: z.enum(['text', 'image', 'voice']).default('text'),
    // Accepts either a full hosted URL (e.g. Tenor GIFs) OR a bare R2 object key
    // (when MEDIA_BASE_URL is unset — signUrl() presigns keys on read). A strict
    // .url() check here rejected keys and silently broke image/voice sends.
    mediaUrl: z.string().min(1).max(2048).optional(),
    replyToId: z.string().uuid().optional(),
    // Opaque JSON metadata (e.g. voice-note waveform amplitudes) — never shown
    // as message text, unlike `content`. Not moderated/content-rule-checked.
    metadata: z.string().max(4000).optional(),
  })
  .refine((b) => (b.type === 'image' || b.type === 'voice' ? !!b.mediaUrl : b.content.length > 0), {
    message: 'Message cannot be empty',
    path: ['content'],
  });

export const reactSchema = z.object({
  emoji: z.string().min(1).max(2),
});

export const listMembersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  online: z.coerce.boolean().optional(),
});

export const reportRoomSchema = z.object({
  reason: z.string().trim().min(1).max(200),
  details: z.string().trim().max(1000).optional(),
});

export const reportMessageSchema = z.object({
  reason: z.string().trim().min(1).max(200),
});

export const updateRoomSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.name !== undefined || b.description !== undefined, {
    message: 'Provide name and/or description',
  });

export const pinMessageSchema = z.object({
  pin: z.boolean(),
});

export const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export const forwardMessageSchema = z.object({
  targetConversationIds: z.array(z.string().uuid()).min(1).max(20),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export const updateRoomPhotoSchema = z.object({
  // Accepts a hosted URL or a bare R2 object key (signUrl presigns keys on read).
  photoUrl: z.string().trim().min(1).max(2048),
});

export const transferOwnershipSchema = z.object({
  userId: z.string().uuid(),
});

export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;
export type ListJoinedQuery = z.infer<typeof listJoinedQuerySchema>;
export type CreateRoomBody = z.infer<typeof createRoomSchema>;
export type BulkAddMembersBody = z.infer<typeof bulkAddMembersSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>;
export type SendMessageBody = z.infer<typeof sendMessageSchema>;
export type ReactBody = z.infer<typeof reactSchema>;
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
export type UpdateRoomBody = z.infer<typeof updateRoomSchema>;
export type PinMessageBody = z.infer<typeof pinMessageSchema>;
export type EditMessageBody = z.infer<typeof editMessageSchema>;
export type ForwardMessageBody = z.infer<typeof forwardMessageSchema>;
export type UpdateMemberRoleBody = z.infer<typeof updateMemberRoleSchema>;
export type UpdateRoomPhotoBody = z.infer<typeof updateRoomPhotoSchema>;
export type TransferOwnershipBody = z.infer<typeof transferOwnershipSchema>;
