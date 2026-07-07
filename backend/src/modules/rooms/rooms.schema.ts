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

export const listMessagesQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
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
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SendMessageBody = z.infer<typeof sendMessageSchema>;
export type ReactBody = z.infer<typeof reactSchema>;
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
export type UpdateRoomBody = z.infer<typeof updateRoomSchema>;
export type PinMessageBody = z.infer<typeof pinMessageSchema>;
export type UpdateMemberRoleBody = z.infer<typeof updateMemberRoleSchema>;
export type UpdateRoomPhotoBody = z.infer<typeof updateRoomPhotoSchema>;
export type TransferOwnershipBody = z.infer<typeof transferOwnershipSchema>;
