/**
 * Auto-generated from backend-spec.json (v3.0) — do not edit by hand.
 * Field names match the spec exactly. Fields marked frontendVisible:false are omitted.
 * iso8601 dates and uuids are kept as `string` (format on display).
 */

/* ────────────────────────────── Enums ────────────────────────────── */

export type Plan = 'free' | 'premium' | 'gold' | 'platinum';
export type BillingCycle = 'monthly' | 'three_month' | 'six_month' | 'annual';
export type Gender = 'male' | 'female' | 'nonbinary' | 'other';
export type GenderIdentity =
  | 'man'
  | 'woman'
  | 'non_binary'
  | 'trans_man'
  | 'trans_woman'
  | 'genderqueer'
  | 'genderfluid'
  | 'other';
export type SexualOrientation =
  | 'straight'
  | 'gay'
  | 'lesbian'
  | 'bisexual'
  | 'queer'
  | 'pansexual'
  | 'other';
export type WantToSee = 'men' | 'women' | 'everyone' | 'non_binary_people';
export type RelationshipIntent = 'dating' | 'friendship' | 'networking' | 'open_to_anything';
export type BodyType = 'slim' | 'athletic' | 'average' | 'curvy' | 'heavyset' | 'prefer_not_to_say';
export type SkinTone =
  | 'very_fair'
  | 'fair'
  | 'medium'
  | 'olive'
  | 'brown'
  | 'dark'
  | 'prefer_not_to_say';
export type RelationshipStatus = 'single' | 'committed' | 'open_relationship' | 'prefer_not_to_say';
export type LookingForOption =
  | 'fwb'
  | 'one_night'
  | 'long_term'
  | 'short_term'
  | 'casual'
  | 'friendship';
export type WhereWeCanMeet =
  | 'my_place'
  | 'your_place'
  | 'restaurant'
  | 'cafe'
  | 'hotel'
  | 'outdoors'
  | 'virtual';
export type DatingIntention =
  | 'casual_dates'
  | 'intimacy_no_commitment'
  | 'life_partner'
  | 'ethical_non_monogamy'
  | 'marriage'
  | 'friendship'
  | 'virtual_dating';
/** Right Now status category (frontend spec addition — see backend-spec __frontendSpecAdditions). */
export type RightNowCategory = 'drinks' | 'coffee' | 'workout' | 'hangout' | 'other';
export type ConversationState = 'pending' | 'active' | 'dismissed';
export type MessageType = 'text' | 'photo' | 'video' | 'voice' | 'expiring_photo' | 'voice_note';
export type CallType = 'audio' | 'video';
export type CallStatus =
  | 'ringing'
  | 'accepted'
  | 'declined'
  | 'missed'
  | 'canceled'
  | 'ended'
  | 'initiated'
  | 'ongoing';
export type VerificationType = 'photo' | 'face';
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'none' | 'verified';
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'fake_profile'
  | 'inappropriate_content'
  | 'lgbtq_hate'
  | 'other';
export type AddOnType =
  | 'boost_local'
  | 'boost_extended'
  | 'boost_city_wide'
  | 'mega_boost'
  | 'spotlight'
  | 'chat_pack_s'
  | 'chat_pack_m'
  | 'chat_pack_l'
  | 'travel_pass'
  | 'travel_pass_week'
  | 'verified_badge'
  | 'audio_call_topup'
  | 'video_call_topup';
export type ModerationFlagType =
  | 'explicit_sexual'
  | 'threat'
  | 'hate_speech'
  | 'anti_lgbtq'
  | 'nudity'
  | 'spam';

/* ────────────────────────────── Models ────────────────────────────── */

/** Free-tier daily call-minute usage + limit (live call countdown). null for paid plans. */
export interface CallLimits {
  audioMinutesUsed: number;
  audioMinutesLimit: number;
  videoMinutesUsed: number;
  videoMinutesLimit: number;
}

/** AI feature opt-in map (Platinum). */
export interface AiOptInFeatures {
  icebreakers?: boolean;
  replySuggestions?: boolean;
  compatibility?: boolean;
  dailyTop10?: boolean;
  profileOptimizer?: boolean;
}

/** Profile photo (frontendVisible fields only). */
export interface Photo {
  id: string;
  userId: string;
  url: string; // pre-signed R2 URL
  isPrimary: boolean;
  isPrivate: boolean;
  isPublished: boolean;
  albumId: string | null;
  order: number;
  createdAt: string;
}

/**
 * Public-facing user fields shared by Self and PublicProfile.
 * Omits all frontendVisible:false fields (phone, reputationScore, location*,
 * daily*Used, pinHash, restrictedUntil, isBanned, bannedAt, interactionPenalty*).
 */
export interface User {
  id: string;
  phoneVerified: boolean;
  /** Signed URL of the user's primary profile photo (single optional photo). */
  primaryPhotoUrl?: string | null;
  /** Free-tier call-minute usage for the live countdown; null for paid plans. */
  callLimits?: CallLimits | null;
  name: string | null;
  firstName: string | null;
  age: number | null;
  gender: Gender | null;
  genderIdentity: GenderIdentity | null;
  sexualOrientation: SexualOrientation | null;
  wantToSee: WantToSee[];
  relationshipIntent: RelationshipIntent | null;
  whoCanDiscoverMe: WantToSee[];
  bio: string | null;
  height: number | null; // cm
  weight: number | null; // kg
  bodyType: BodyType | null;
  skinTone: SkinTone | null;
  aboutMe: string | null;
  whereAreYouFrom: string | null;
  relationshipStatus: RelationshipStatus | null;
  lookingFor: string[]; // validated against LookingForOption
  whereWeCanMeet: WhereWeCanMeet[];
  preferences: string | null;
  fantasyTags: string[];
  datingIntentions: DatingIntention[];
  interests: string[];
  topArtists: string[];
  tribes: string[];
  tags: string[];
  virtualDatingBadge: boolean;
  voiceClipUrl: string | null;
  videoClipUrl: string | null;
  isVerified: boolean; // computed = phoneVerified OR emailVerified (face verification removed)
  verifiedBadge: boolean;
  isCollegeVerified: boolean;
  photoVerified: boolean;
  profileCompletenessScore: number;
  plan: Plan;
  planExpiresAt: string | null;
  historicalReplyRate: number | null;
  locationUpdatedAt: string | null;
  isOnGrid: boolean;
  incognitoMode: boolean;
  hideActiveStatus: boolean;
  hideLastSeen: boolean;
  hideExactDistance: boolean;
  showOrientationPublicly: boolean;
  disceetMode: boolean;
  pauseIncomingMessages: boolean;
  requireProfileCompletenessToMessage: boolean;
  verifiedUsersOnlyFilter: boolean;
  // ── Availability toggles ──
  groupsAvailable: boolean;
  audioCallAvailable: boolean;
  videoCallAvailable: boolean;
  aiOptInFeatures: AiOptInFeatures | null;
  // ── Right Now (frontend spec addition; see backend-spec __frontendSpecAdditions) ──
  rightNowStatus?: string | null;
  rightNowCategory?: RightNowCategory | null;
  rightNowExpiresAt?: string | null;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}

/** The authenticated user's own full profile (GET /auth/me). */
export type Self = User;

/** Settings subset toggled via PATCH /me/settings. */
export interface UserSettings {
  discoverable?: boolean;
  showDistance?: boolean;
  verifiedUsersOnlyFilter?: boolean;
  pauseIncomingMessages?: boolean;
  incognito?: boolean;
  hideActiveStatus?: boolean;
  hideLastSeen?: boolean;
  hideExactDistance?: boolean;
  blockOffensiveLanguage?: boolean;
  requireProfileCompletenessToMessage?: boolean;
  disceetMode?: boolean;
  showOrientationPublicly?: boolean;
  aiOptInFeatures?: AiOptInFeatures;
}

/** Card returned in the discovery grid (UserCard fields, Change 5). */
export interface UserCard {
  id: string;
  profilePhoto: string | null;
  firstName: string | null;
  age: number | null;
  distance: string; // human-readable / fuzzy, e.g. "1.2 km" or "Near you"
  distanceLabel?: string | null; // server-formatted distance (discovery cards)
  lastActiveAt: string; // human-readable label ("Active Now") on cards; raw ISO on profiles
  /** Server activity status — `activity.online` is the source of truth for the green dot. */
  activity?: { online: boolean; label: string | null } | null;
  isVerified: boolean;
  planBadge?: Plan | null;
  height: number | null;
  weight: number | null;
  bodyType: BodyType | null;
  skinTone: SkinTone | null;
  aboutMe: string | null;
  whereAreYouFrom: string | null;
  relationshipStatus: RelationshipStatus | null;
  lookingFor: string[];
  whereWeCanMeet: WhereWeCanMeet[];
  preferences: string | null;
  fantasyTags: string[];
  tribes: string[];
  tags: string[];
  isShortlisted: boolean;
  isLiked: boolean;
  boosted: boolean;
  // ── Right Now indicator ──
  rightNowStatus?: string | null;
  rightNowCategory?: RightNowCategory | null;
  rightNowActive?: boolean;
  // ── Availability (grid tile shows a 👥 icon when groupsAvailable) ──
  groupsAvailable?: boolean;
  audioCallAvailable?: boolean;
  videoCallAvailable?: boolean;
}

/** A nearby user with an active Right Now status (GET /discovery/right-now). */
export interface RightNowCard extends UserCard {
  rightNowStatus: string | null;
  rightNowCategory: RightNowCategory | null;
  rightNowExpiresAt: string | null;
  /** When they posted their current status (server: user.updatedAt). */
  rightNowJoinedAt?: string | null;
  /** Raw distance in metres for client-side sorting. */
  distanceMeters?: number | null;
}

/** A profile prompt (Q&A card). */
export interface ProfilePrompt {
  id: string;
  question: string;
  answer: string;
}

/** Public profile view (GET /users/:userId). Superset of UserCard display fields. */
export interface PublicProfile extends UserCard {
  bio: string | null;
  gender: Gender | null;
  photos?: Photo[];
  voiceClipUrl?: string | null;
  videoClipUrl?: string | null;
  prompts?: ProfilePrompt[];
  fantasyTags: string[];
  interests?: string[];
  datingIntentions?: DatingIntention[];
  tags: string[];
  photoVerified?: boolean;
  isCollegeVerified?: boolean;
}

/** Conversation model (frontendVisible fields). */
export interface Conversation {
  id: string;
  userAId: string;
  userBId: string;
  initiatorId: string;
  state: ConversationState;
  aHasReplied: boolean;
  bHasReplied: boolean;
  aIsHidden: boolean;
  bIsHidden: boolean;
  aPinned: boolean;
  bPinned: boolean;
  aArchivedAt: string | null;
  bArchivedAt: string | null;
  aDeletedAt: string | null;
  bDeletedAt: string | null;
  createdAt: string;
  lastMessageAt: string;
}

/** Truncated last message in conversation list responses. */
export interface LastMessagePreview {
  id: string;
  type: string;
  content: string | null;
  senderId: string;
  createdAt: string;
  isUnsent: boolean;
}

/** Conversation row in inbox/requests listing. */
export interface ConversationSummary {
  id: string;
  state: ConversationState;
  isPinned: boolean;
  peer: UserCard;
  lastMessageAt: string | null;
  lastMessage: LastMessagePreview | string | null;
  audioCallEnabled: boolean;
  videoCallEnabled: boolean;
  unreadCount?: number;
}

/** A chat message (frontendVisible fields). */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  ciphertext: string | null;
  content: string | null;
  mediaUrls: string[];
  mediaUrl: string | null;
  viewOnce: boolean;
  expiresInSeconds: number | null;
  viewedAt: string | null;
  expiresAfterView: boolean;
  isUnsent: boolean;
  unsentAt: string | null;
  isEdited: boolean;
  editedAt: string | null;
  translatedContent: string | null;
  flaggedOffensive: boolean;
  moderationFlagged: boolean;
  deliveredAt: string | null;
  readAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

/** Call model (frontendVisible fields — agora* omitted from stored model). */
export interface Call {
  id: string;
  callerId: string;
  calleeId: string;
  conversationId: string | null;
  type: CallType;
  status: CallStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  durationSeconds: number | null;
  endReason: string | null;
  scheduledAt: string | null;
}

/** Call history row. */
export type CallRecord = Call;

/** Verification record. */
export interface Verification {
  id: string;
  userId: string;
  type: VerificationType;
  status: VerificationStatus;
  mediaUrl: string;
  score: number | null;
  reason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

/** Subscription record. */
export interface Subscription {
  id: string;
  userId: string;
  plan: Plan | null;
  billingCycle: BillingCycle | null;
  priceInr: number | null;
  active: boolean;
  startedAt: string;
  expiresAt: string;
  paymentProvider: string | null;
  cancelledAt: string | null;
}

/** Album list/summary item. */
export interface Album {
  id: string;
  userId: string;
  title: string;
  coverPhotoId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Album summary with cover + count (list responses). */
export interface AlbumSummary {
  id: string;
  title: string;
  coverPhoto: AlbumPhoto | null;
  photoCount: number;
}

/** A photo within an album. */
export interface AlbumPhoto {
  id: string;
  /** Signed R2 URL (15 min expiry). Backend serializes this field as `url`. */
  url: string;
  /** Raw R2 object key — present on own-album detail responses for sharing in chat. */
  path?: string;
  order: number;
  createdAt: string;
}

/** Block list entry. */
export interface Block {
  blockedId: string;
  createdAt: string;
}

/** Mute placeholder (spec lists mute under safety; minimal shape). */
export interface Mute {
  mutedId: string;
  createdAt: string;
}

/** Report payload echo. */
export interface Report {
  reason: ReportReason;
  details?: string;
  messageId?: string;
}

/** An add-on purchase record. */
export interface AddOnPurchase {
  id: string;
  userId: string;
  addOnType: AddOnType;
  priceInr: number;
  purchasedAt: string;
  expiresAt: string | null;
}

/* ─────────────────────── API error envelope ─────────────────────── */

export interface ApiErrorEnvelope {
  error: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

/* ─────────────────────── Dating Rooms (Groups) ─────────────────────── */

export type RoomCategory =
  | 'city_dating'
  | 'orientation'
  | 'age_group'
  | 'relationship_intent'
  | 'events'
  | 'local_meetups';

export type RoomRole = 'member' | 'moderator' | 'admin';
export type RoomMessageType = 'text' | 'image' | 'system' | 'voice';

/** Room card in the Discover list (also the base for detail/joined). */
export interface RoomCard {
  id: string;
  name: string;
  description: string | null;
  category: RoomCategory;
  city: string | null;
  state: string | null;
  country: string;
  isOfficial: boolean;
  isVerifiedOnly: boolean;
  coverImageUrl: string | null;
  memberCount: number;
  onlineCount: number;
  lastActivityAt: string;
  rules: string | null;
  isJoined: boolean;
  createdAt: string;
}

export interface RoomDetail extends RoomCard {
  /** Caller's role in this room (null if not a member). Used to gate admin UI. */
  myRole?: RoomRole | null;
  /** True when the caller created this room. */
  isCreator?: boolean;
}

export interface JoinedRoomCard extends RoomCard {
  unreadCount: number;
  role: RoomRole;
}

/** Compact sender/member card inside a room. Never exposes phone/email. */
export interface RoomUserCard {
  id: string;
  firstName: string | null;
  username: string | null;
  age: number | null;
  isVerified: boolean;
  planBadge: Plan | null;
  distanceLabel: string | null;
  profilePhotoUrl: string | null;
  isOnline: boolean;
}

export interface RoomReaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}

export interface RoomReplyPreview {
  id: string;
  senderFirstName: string | null;
  content: string;
}

export interface RoomMessageCard {
  id: string;
  roomId: string;
  senderId: string;
  sender: RoomUserCard;
  type: RoomMessageType;
  content: string;
  mediaUrl: string | null;
  isPinned: boolean;
  isDeleted: boolean;
  replyTo: RoomReplyPreview | null;
  reactions: RoomReaction[];
  /** How many OTHER members have received this message (double-grey at ≥ 1). */
  deliveredCount: number;
  createdAt: string;
  editedAt: string | null;
}

export interface RoomMemberCard {
  id: string;
  role: RoomRole;
  /** True for the member who created the room (tracked via Room.creatorId). */
  isCreator: boolean;
  joinedAt: string;
  user: RoomUserCard;
}

/* ─────────────────────── Room invites (Group availability) ─────────────────────── */

export type RoomInviteStatus = 'pending' | 'accepted' | 'declined';

/** A pending room invite addressed to the current user (GET /api/rooms/invites). */
export interface RoomInviteCard {
  id: string;
  room: {
    id: string;
    name: string;
    coverImageUrl: string | null;
    memberCount: number;
    category: RoomCategory;
  };
  inviter: {
    id: string;
    firstName: string | null;
    profilePhotoUrl: string | null;
    isVerified: boolean;
  };
  createdAt: string;
}

/** Result of POST /api/rooms/:roomId/invite-or-add/:userId. */
export interface InviteOrAddResult {
  added: boolean;
  method: 'direct' | 'invite_sent' | 'already_member' | 'invite_already_sent';
}

/** Payload of the `room_invite:received` socket event. */
export interface RoomInviteReceivedEvent {
  inviteId: string;
  roomId: string;
  roomName: string;
  inviterName: string | null;
  inviterPhoto: string | null;
}
