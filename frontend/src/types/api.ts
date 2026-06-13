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
  url: string; // pre-signed GCS URL
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
  isVerified: boolean; // computed = phoneVerified && faceVerified
  verifiedBadge: boolean;
  isCollegeVerified: boolean;
  photoVerified: boolean;
  faceVerified: boolean;
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
  aiOptInFeatures: AiOptInFeatures | null;
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
  lastActiveAt: string; // human-readable, e.g. "online", "2 hrs ago"
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
  faceVerified?: boolean;
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

/** Conversation row in inbox/requests listing. */
export interface ConversationSummary {
  id: string;
  state: ConversationState;
  isPinned: boolean;
  peer: UserCard;
  lastMessageAt: string | null;
  lastMessage: string | null;
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
  albumId: string;
  userId: string;
  photoUrl: string; // signed GCS URL (15 min expiry)
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
