/**
 * NearMe API client — generated from backend-spec.json (v3.0).
 * One typed function per endpoint. Paths/fields/error codes match the spec exactly.
 */
import { BASE_URL, generateRequestId } from './config';
import { getAccessToken, refreshAccessToken } from './auth';
import type {
  Self,
  UserSettings,
  UserCard,
  PublicProfile,
  ConversationSummary,
  Message,
  CallRecord,
  CallType,
  CallStatus,
  Photo,
  AlbumSummary,
  AlbumPhoto,
  Block,
  Plan,
  BillingCycle,
  AddOnType,
  ReportReason,
  ConversationState,
  RightNowCard,
  Gender,
  BodyType,
  SkinTone,
  RelationshipStatus,
  WhereWeCanMeet,
  DatingIntention,
  RoomCard,
  RoomDetail,
  JoinedRoomCard,
  RoomMessageCard,
  RoomMemberCard,
  RoomCategory,
  RoomMessageType,
  RoomRole,
  RoomInviteCard,
  InviteOrAddResult,
} from '../types/api';

export interface ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: { auth?: boolean; isRetry?: boolean; query?: Record<string, unknown> }
): Promise<T> {
  const useAuth = opts?.auth !== false;
  const token = useAuth ? await getAccessToken() : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': generateRequestId(),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let url = `${BASE_URL}${path}`;
  if (opts?.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null) continue;
      qs.append(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    const str = qs.toString();
    if (str) url += `?${str}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh once on 401 for authed requests.
  if (res.status === 401 && useAuth && !opts?.isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(method, path, body, { ...opts, isRetry: true });
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}) as Record<string, unknown>);
    const apiErr = Object.assign(new Error((err.message as string) ?? res.statusText), {
      status: res.status,
      code: err.error as string | undefined,
      data: err,
    }) as ApiError;
    throw apiErr;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/* ─────────────────────────────── Auth ─────────────────────────────── */

export interface FirebaseLoginResponse {
  accessToken: string;
  refreshToken: string;
  profileComplete: boolean;
  isNewUser: boolean;
  user: Self;
}
export const firebaseLogin = (idToken: string) =>
  request<FirebaseLoginResponse>('POST', '/api/v1/auth/firebase', { idToken }, { auth: false });

export const devLogin = (email: string, password: string) =>
  request<FirebaseLoginResponse>('POST', '/api/v1/auth/dev-login', { email, password }, { auth: false });

// ── Email OTP (custom 6-digit code via Resend; no Firebase) ──
export interface SendEmailOtpResponse {
  message: string;
  expiresInSeconds: number;
}
export const sendEmailOtp = (email: string) =>
  request<SendEmailOtpResponse>('POST', '/api/v1/auth/email/send-otp', { email }, { auth: false });

// verify-otp issues a NearMe JWT pair directly (same shape as Firebase login).
export const verifyEmailOtp = (email: string, code: string) =>
  request<FirebaseLoginResponse>('POST', '/api/v1/auth/email/verify-otp', { email, code }, { auth: false });


export const logout = () => request<void>('POST', '/api/v1/auth/logout');

export const getMe = () => request<Self>('GET', '/api/v1/auth/me');

/* ────────────────────────────── Profile ───────────────────────────── */

export interface UpdateProfileBody {
  firstName?: string;
  age?: number;
  gender?: Gender;
  genderIdentity?: string;
  sexualOrientation?: string;
  wantToSee?: string[];
  relationshipIntent?: string;
  bio?: string;
  height?: number;
  weight?: number;
  bodyType?: BodyType;
  skinTone?: SkinTone;
  aboutMe?: string;
  whereAreYouFrom?: string;
  relationshipStatus?: RelationshipStatus;
  lookingFor?: string[];
  whereWeCanMeet?: WhereWeCanMeet[];
  preferences?: string;
  fantasyTags?: string[];
  datingIntentions?: DatingIntention[];
  interests?: string[];
  tribes?: string[];
  tags?: string[];
  // ── Right Now (frontend spec addition; PATCH /me persists these) ──
  // Set rightNowStatus:null to clear an active status.
  rightNowStatus?: string | null;
  rightNowCategory?: string | null;
  rightNowExpiresAt?: string | null;
  // ── Availability toggles ──
  groupsAvailable?: boolean;
  audioCallAvailable?: boolean;
  videoCallAvailable?: boolean;
}
export const updateProfile = (body: UpdateProfileBody) =>
  request<Self>('PATCH', '/api/v1/me', body);

export const updateSettings = (body: Partial<UserSettings>) =>
  request<UserSettings>('PATCH', '/api/v1/me/settings', body);

export const updateLocation = (lat: number, lng: number) =>
  request<{ ok: boolean }>('POST', '/api/v1/me/location', { lat, lng });

// NOTE: data-export and account-deletion are specified by the frontend brief
// (Phase 9) and follow the /me convention; they are not listed in the spec's
// endpoints[] array. Wired here as instructed.
export const exportMyData = () => request<unknown>('GET', '/api/v1/me/export');
export const deleteAccount = () => request<void>('DELETE', '/api/v1/me');

export const addPhoto = (url: string, isPrimary?: boolean, isPrivate?: boolean) =>
  request<Photo>('POST', '/api/v1/me/photos', { url, isPrimary, isPrivate });

// ── Direct-to-R2 upload URLs (upload-url is a frontend spec addition) ──
export interface PhotoUploadUrl {
  uploadUrl: string; // presigned R2 PUT URL
  key: string; // object key to send to POST /me/photos
  mediaUrl: string; // public/base URL for the object
}
export const getPhotoUploadUrl = () =>
  request<PhotoUploadUrl>('GET', '/api/v1/me/photos/upload-url');

/** R2 upload types (backend UPLOAD_TYPE_CONFIG). */
export type UploadType =
  | 'photo'
  | 'album_photo'
  | 'chat_photo'
  | 'video'
  | 'document'
  | 'audio'
  | 'voice_clip'
  | 'room_image';

export interface UploadUrlResponse {
  uploadUrl: string; // presigned R2 PUT URL
  key: string; // object key
  mediaUrl: string; // final URL to store as the message mediaUrl
  expiresAt: string;
}

/** Request a presigned R2 upload URL for any media type. */
export const getUploadUrl = (params: {
  type: UploadType;
  contentType?: string;
  ext?: string;
  roomId?: string;
}) =>
  request<UploadUrlResponse>('GET', '/api/v1/me/upload-url', undefined, {
    query: {
      type: params.type,
      contentType: params.contentType,
      ext: params.ext,
      roomId: params.roomId,
    },
  });

/**
 * Read a local file URI as a Blob using XMLHttpRequest responseType='blob'.
 *
 * React Native's fetch().blob() internally creates a Blob from an ArrayBuffer,
 * which RN's Blob polyfill does not support and throws:
 *   "Creating blobs from ArrayBuffer and ArrayBufferView are not supported."
 *
 * XHR with responseType='blob' uses the native RCTNetworking blob bridge instead,
 * which correctly handles file:// and content:// URIs on both iOS and Android.
 */
function readFileAsBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => {
      if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
        resolve(xhr.response as Blob);
      } else {
        reject(new Error(`Failed to read file (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Failed to read file'));
    xhr.open('GET', uri);
    xhr.send();
  });
}

/**
 * Upload a picked image as the primary profile photo.
 * GET upload-url → PUT bytes to R2 → POST /me/photos { url: key }.
 * Returns the created Photo (its `url` is the signed URL to display).
 */
export async function uploadProfilePhoto(localUri: string): Promise<Photo> {
  const { uploadUrl, key } = await getPhotoUploadUrl();
  const blob = await readFileAsBlob(localUri);
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': (blob as Blob & { type?: string }).type || 'image/jpeg' },
  });
  if (!put.ok) throw new Error(`R2 upload failed (${put.status})`);
  return await addPhoto(key, true);
}

export const setPrimaryPhoto = (photoId: string) =>
  request<{ ok: boolean }>('PUT', `/api/v1/me/photos/${photoId}/primary`);

export const deletePhoto = (photoId: string) =>
  request<void>('DELETE', `/api/v1/me/photos/${photoId}`);

export const getPublicProfile = (userId: string) =>
  request<PublicProfile>('GET', `/api/v1/users/${userId}`);

// ── Brief-specified profile extensions (NOT in spec endpoints[]) ──
// catalogs, prompts CRUD, and voice/video clips are described in the Phase 10
// brief but are absent from the spec's endpoints[]. Wired per instructions and
// used resiliently (callers tolerate failure).
export interface ProfilePromptDTO {
  id: string;
  question: string;
  answer: string;
}
export interface Catalogs {
  tribes?: string[];
  fantasyTags?: string[];
  promptQuestions?: string[];
}
export const getCatalogs = () => request<Catalogs>('GET', '/api/v1/catalogs', undefined, { auth: false });
export const getPrompts = () => request<{ prompts: ProfilePromptDTO[] }>('GET', '/api/v1/me/prompts');
export const createPrompt = (question: string, answer: string) =>
  request<ProfilePromptDTO>('POST', '/api/v1/me/prompts', { question, answer });
export const updatePrompt = (promptId: string, answer: string) =>
  request<ProfilePromptDTO>('PATCH', `/api/v1/me/prompts/${promptId}`, { answer });
export const deletePrompt = (promptId: string) =>
  request<void>('DELETE', `/api/v1/me/prompts/${promptId}`);
export const uploadVoiceClip = (url: string) =>
  request<{ voiceClipUrl: string }>('POST', '/api/profile/voice-clip', { url });
export const uploadVideoClip = (url: string) =>
  request<{ videoClipUrl: string }>('POST', '/api/profile/video-clip', { url });

/* ─────────────────────────────── Grid ─────────────────────────────── */

export interface GridQuery {
  lat: number;
  lng: number;
  radius?: number;
  limit?: number;
  offset?: number;
  onlineOnly?: boolean;
  ageMin?: number;
  ageMax?: number;
  heightMin?: number;
  heightMax?: number;
  bodyType?: string | string[];
  tribes?: string[];
  tags?: string[];
  lookingFor?: string[];
  sort?: 'distance' | 'fresh';
  // ── Frontend additions (extra query params; see __frontendSpecAdditions) ──
  gender?: string[];
  relationshipIntent?: string[];
  verifiedOnly?: boolean;
  activeLast5Min?: boolean;
  activeLast30Min?: boolean;
  highReplyRate?: boolean;
  recentlyJoined?: boolean;
  /** JSON-encoded AdvancedFilters object (Premium+). */
  advancedFilters?: string;
}
export interface GridResponse {
  cards: UserCard[];
  total: number;
  limit: number;
  offset: number;
}
export const getGrid = (query: GridQuery) =>
  request<GridResponse>('GET', '/api/v1/grid', undefined, {
    query: query as unknown as Record<string, unknown>,
  });

/* ────────────────────────── Conversations ─────────────────────────── */

export interface StartConversationResponse {
  id: string;
  state: ConversationState;
  audioCallEnabled: boolean;
  videoCallEnabled: boolean;
}
export const startConversation = (userId: string) =>
  request<StartConversationResponse>('POST', '/api/v1/conversations/start', { userId });

export interface ListConversationsResponse {
  folder: string;
  conversations: ConversationSummary[];
}
export const listConversations = (folder: 'inbox' | 'requests' = 'inbox') =>
  request<ListConversationsResponse>('GET', '/api/v1/conversations', undefined, {
    query: { folder },
  });

export interface ListMessagesResponse {
  messages: Message[];
  audioCallEnabled: boolean;
  videoCallEnabled: boolean;
}
export const markConversationRead = (conversationId: string) =>
  request<void>('POST', `/api/v1/conversations/${conversationId}/read`);

export const listMessages = (conversationId: string, query?: { cursor?: string; limit?: number }) =>
  request<ListMessagesResponse>(
    'GET',
    `/api/v1/conversations/${conversationId}/messages`,
    undefined,
    { query: query as Record<string, unknown> | undefined }
  );

export interface SendMessageBody {
  type: 'text' | 'photo' | 'video' | 'voice' | 'expiring_photo' | 'voice_note';
  content?: string;
  ciphertext?: string;
  mediaUrls?: string[];
  viewOnce?: boolean;
  expiresInSeconds?: number;
}
export type SendMessageResponse = Message & {
  audioCallEnabled: boolean;
  videoCallEnabled: boolean;
};
export const sendMessage = (conversationId: string, body: SendMessageBody) =>
  request<SendMessageResponse>(
    'POST',
    `/api/v1/conversations/${conversationId}/messages`,
    body
  );

export interface ConsumeExpiringPhotoResponse {
  ok: boolean;
  url: string | null;
  viewedAt: string;
  expiresInSeconds: number | null;
}
export const consumeExpiringPhoto = (conversationId: string, messageId: string) =>
  request<ConsumeExpiringPhotoResponse>(
    'POST',
    `/api/v1/conversations/${conversationId}/messages/${messageId}/view`
  );

export interface ChatPhotoUploadUrl {
  uploadUrl: string;
  key: string;
  mediaUrl: string;
}
export const getChatPhotoUploadUrl = () =>
  request<ChatPhotoUploadUrl>('GET', '/api/v1/me/photos/upload-url', undefined, {
    query: { type: 'chat_photo' },
  });

/** Upload a local image for chat (photo or view-once). Returns the R2 key for mediaUrls. */
export async function uploadChatPhoto(localUri: string): Promise<string> {
  const { uploadUrl, key } = await getChatPhotoUploadUrl();
  const blob = await readFileAsBlob(localUri);
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': (blob as Blob & { type?: string }).type || 'image/jpeg' },
  });
  if (!put.ok) throw new Error(`Photo upload failed (${put.status})`);
  return key;
}

/* ─────────────────────────────── Calls ────────────────────────────── */

export interface InitiateCallResponse {
  id: string;
  agoraChannelName: string;
  agoraToken: string;
  type: CallType;
}
export const initiateCall = (conversationId: string, type: CallType) =>
  request<InitiateCallResponse>('POST', '/api/v1/calls', { conversationId, type });

export interface UpdateCallResponse {
  id: string;
  status: string;
  durationSeconds: number | null;
}
/** Status values accepted by PATCH /calls/:id (distinct from the model's CallStatus). */
export type CallUpdateStatus = 'answered' | 'declined' | 'ended' | 'missed';
export const updateCall = (
  callId: string,
  status: CallUpdateStatus,
  endReason?: 'normal' | 'timeout' | 'no_answer' | 'error'
) => request<UpdateCallResponse>('PATCH', `/api/v1/calls/${callId}`, { status, endReason });

export const getCallHistory = () =>
  request<{ calls: CallRecord[] }>('GET', '/api/v1/calls');

/* ──────────────────────────── Discovery ───────────────────────────── */
// NOTE: `POST /discovery/taps` is referenced in the spec's freeInteractionCap
// enforcement prose. `favorites` (shortlist) follows the same convention and is
// specified by the frontend brief. Both also count toward the interaction cap,
// so they can return 403 interaction_limit_reached.

export const tapUser = (userId: string) =>
  request<{ ok: boolean }>('POST', '/api/v1/discovery/taps', { userId });

export const untapUser = (userId: string) =>
  request<void>('DELETE', `/api/v1/discovery/taps/${userId}`);

// ── Interest: who viewed me / taps received ──
// Shapes match the backend exactly (see backend-spec.json notes).
// Views are Gold+ (whoViewedMe); taps are Premium+ to view detail.

/** GET /api/v1/discovery/views → who viewed my profile (Gold+). */
export interface ProfileViewItem {
  id: string; // the ProfileView row id (NOT the user id — use viewer.id to navigate)
  viewer: UserCard;
  viewedAt: string; // iso8601
}
export interface ViewsResponse {
  views: ProfileViewItem[];
}
export const getViews = () => request<ViewsResponse>('GET', '/api/v1/discovery/views');

/** GET /api/v1/discovery/taps → taps received. */
export interface TapItem {
  id: string; // the Tap row id (use sender.id to navigate)
  sender: UserCard;
  createdAt: string; // iso8601
}
export interface TapsResponse {
  taps: TapItem[];
}
export const getReceivedTaps = () => request<TapsResponse>('GET', '/api/v1/discovery/taps');

// ── Right Now feed ──
/** GET /api/v1/discovery/right-now → nearby users with an active Right Now status. */
export interface RightNowResponse {
  statuses: RightNowCard[];
  total: number;
}
export const getRightNow = () => request<RightNowResponse>('GET', '/api/v1/discovery/right-now');

export const shortlistUser = (userId: string) =>
  request<{ ok: boolean }>('POST', '/api/v1/discovery/favorites', { userId });

export const unshortlistUser = (userId: string) =>
  request<void>('DELETE', `/api/v1/discovery/favorites/${userId}`);

/* ────────────────────────────── Safety ────────────────────────────── */

export const blockUser = (userId: string) =>
  request<{ ok: boolean }>('POST', `/api/users/${userId}/block`);

export const unblockUser = (userId: string) =>
  request<void>('DELETE', `/api/users/${userId}/block`);

export const listBlocks = () =>
  request<{ blocked: Block[] }>('GET', '/api/v1/safety/blocks');

export const reportUser = (
  userId: string,
  body: { reason: ReportReason; details?: string; messageId?: string }
) => request<{ ok: boolean }>('POST', `/api/users/${userId}/report`, body);

/* ─────────────────────────── Verification ─────────────────────────── */

export interface VerificationStatusResponse {
  phoneVerified: boolean;
  emailVerified: boolean;
  isVerified: boolean;
  isCollegeVerified: boolean;
  history: unknown[];
}
export const getVerificationStatus = () =>
  request<VerificationStatusResponse>('GET', '/api/v1/verification/status');

// Face verification was removed (20260618). isVerified = phoneVerified OR emailVerified.

/* ────────────────────────────── Albums ────────────────────────────── */

export const listAlbums = () =>
  request<{ albums: AlbumSummary[] }>('GET', '/api/albums');

export const createAlbum = (title: string) =>
  request<AlbumSummary>('POST', '/api/albums', { title });

export interface AlbumDetailResponse {
  id: string;
  title: string;
  coverPhoto: AlbumPhoto | null;
  photos: AlbumPhoto[];
  nextCursor: string | null;
  hasMore: boolean;
}
export const getAlbum = (albumId: string, query?: { cursor?: string; limit?: number }) =>
  request<AlbumDetailResponse>('GET', `/api/albums/${albumId}`, undefined, {
    query: query as Record<string, unknown> | undefined,
  });

export const updateAlbum = (
  albumId: string,
  body: { title?: string; coverPhotoId?: string | null }
) => request<AlbumSummary>('PATCH', `/api/albums/${albumId}`, body);

export const deleteAlbum = (albumId: string) =>
  request<void>('DELETE', `/api/albums/${albumId}`);

export const addAlbumPhoto = (albumId: string, url: string) =>
  request<AlbumPhoto>('POST', `/api/albums/${albumId}/photos`, { url });

/**
 * Upload a picked image into an album.
 * GET upload-url → PUT bytes to R2 → POST the key.
 */
export async function uploadAlbumPhoto(albumId: string, localUri: string): Promise<AlbumPhoto> {
  const { uploadUrl, key } = await getPhotoUploadUrl();
  const blob = await readFileAsBlob(localUri);
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': (blob as Blob & { type?: string }).type || 'image/jpeg' },
  });
  if (!put.ok) throw new Error(`R2 upload failed (${put.status})`);
  return await addAlbumPhoto(albumId, key);
}

export const removeAlbumPhoto = (albumId: string, photoId: string) =>
  request<void>('DELETE', `/api/albums/${albumId}/photos/${photoId}`);

export const reorderAlbumPhotos = (
  albumId: string,
  order: { photoId: string; order: number }[]
) => request<{ ok: boolean }>('PATCH', `/api/albums/${albumId}/photos/reorder`, { order });

export const getUserAlbums = (userId: string) =>
  request<{ albums: AlbumSummary[] }>('GET', `/api/v1/users/${userId}/albums`);

export const getUserAlbum = (userId: string, albumId: string, query?: { cursor?: string; limit?: number }) =>
  request<AlbumDetailResponse>('GET', `/api/v1/users/${userId}/albums/${albumId}`, undefined, {
    query: query as Record<string, string | number | boolean | undefined>,
  });

/** An album another user has shared with me. */
export interface SharedAlbum {
  id: string;
  title: string;
  coverPhoto: AlbumPhoto | null;
  photoCount: number;
  owner: { id: string; firstName: string | null; profilePhoto: string | null };
}

/**
 * GET /api/v1/discovery/albums/shared → albums others shared with me.
 * Tolerant: resolves to an empty list if the endpoint is unavailable so the
 * "Shared With Me" section degrades gracefully rather than erroring the screen.
 */
export const getSharedAlbums = () =>
  request<{ albums: SharedAlbum[] }>('GET', '/api/v1/discovery/albums/shared')
    .catch(() => ({ albums: [] as SharedAlbum[] }));

// ── Travel / city profiles (brief-specified; not in spec endpoints[]) ──
// Gold+ travel mode. Spec lists travel_pass add-ons + travelMode plan perk but
// no city-profile endpoints; wired here per the Phase 12 brief.
export interface CityProfile {
  id: string;
  city: string;
  lat?: number;
  lng?: number;
  active: boolean;
}
export const createCityProfile = (city: string, lat?: number, lng?: number) =>
  request<CityProfile>('POST', '/api/city-profiles', { city, lat, lng });
export const activateCityProfile = (id: string) =>
  request<{ ok: boolean }>('POST', `/api/city-profiles/${id}/activate`);
export const listCityProfiles = () =>
  request<{ cityProfiles: CityProfile[] }>('GET', '/api/city-profiles');

/* ────────────────────────────── Billing ───────────────────────────── */

export const getBillingPlans = () =>
  request<unknown>('GET', '/api/v1/billing/plans', undefined, { auth: false });

export interface CreateSubscriptionResponse {
  orderId: string;
  amount: number; // paise
  currency: 'INR' | 'USD';
  key?: string;
}
export const createSubscription = (body: {
  plan: Exclude<Plan, 'free'>;
  billingCycle: BillingCycle;
  paymentProvider: 'razorpay' | 'stripe';
}) => request<CreateSubscriptionResponse>('POST', '/api/v1/billing/subscriptions', body);

export const verifySubscription = (body: {
  orderId: string;
  paymentId: string;
  signature: string;
}) =>
  request<{ plan: string; planExpiresAt: string; ok: true }>(
    'POST',
    '/api/v1/billing/subscriptions/verify',
    body
  );

export interface CurrentSubscription {
  plan: Plan;
  billingCycle: BillingCycle | null;
  priceInr: number | null;
  startedAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
}
export const getCurrentSubscription = () =>
  request<CurrentSubscription>('GET', '/api/v1/billing/subscriptions/current');

export const createAddOnOrder = (addonType: AddOnType) =>
  request<CreateSubscriptionResponse>('POST', '/api/v1/billing/addons/purchase', {
    addonType,
    paymentProvider: 'razorpay',
  });
export const verifyAddOnPurchase = (body: {
  orderId: string;
  paymentId: string;
  signature: string;
  addonType: AddOnType;
}) => request<{ ok: true }>('POST', '/api/v1/billing/addons/verify', body);

/* ──────────────────────────────── AI ──────────────────────────────── */

export const getDailyTop10 = () =>
  request<{ profiles: UserCard[]; refreshesAt: string }>('GET', '/api/ai/top-10');

/* ─────────────────────── Dating Rooms (Groups) ─────────────────────── */

export interface ListRoomsQuery {
  category?: RoomCategory;
  city?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const listRooms = (query?: ListRoomsQuery) =>
  request<{ rooms: RoomCard[] }>('GET', '/api/rooms', undefined, { query: query as Record<string, unknown> });

export const listJoinedRooms = (query?: { limit?: number; offset?: number }) =>
  request<{ rooms: JoinedRoomCard[] }>('GET', '/api/rooms/joined', undefined, {
    query: query as Record<string, unknown>,
  });

export const getRoom = (roomId: string) =>
  request<{ room: RoomDetail }>('GET', `/api/rooms/${roomId}`);

export const joinRoom = (roomId: string) =>
  request<{ ok: true; room: RoomDetail }>('POST', `/api/rooms/${roomId}/join`);

export const leaveRoom = (roomId: string) =>
  request<void>('DELETE', `/api/rooms/${roomId}/join`);

export const listRoomMessages = (roomId: string, query?: { before?: string; limit?: number }) =>
  request<{ messages: RoomMessageCard[]; hasMore: boolean; nextCursor: string | null }>(
    'GET',
    `/api/rooms/${roomId}/messages`,
    undefined,
    { query: query as Record<string, unknown> },
  );

export interface SendRoomMessageBody {
  content: string;
  type?: RoomMessageType;
  mediaUrl?: string;
  replyToId?: string;
}

export const sendRoomMessage = (roomId: string, body: SendRoomMessageBody) =>
  request<RoomMessageCard>('POST', `/api/rooms/${roomId}/messages`, body);

export const reactToRoomMessage = (roomId: string, messageId: string, emoji: string) =>
  request<{ added: boolean; emoji: string; count: number }>(
    'POST',
    `/api/rooms/${roomId}/messages/${messageId}/react`,
    { emoji },
  );

export const listRoomMembers = (roomId: string, query?: { limit?: number; offset?: number; online?: boolean }) =>
  request<{ members: RoomMemberCard[]; total: number }>('GET', `/api/rooms/${roomId}/members`, undefined, {
    query: query as Record<string, unknown>,
  });

export const muteRoom = (roomId: string) =>
  request<{ muted: boolean }>('POST', `/api/rooms/${roomId}/mute`);

export const reportRoom = (roomId: string, reason: string, details?: string) =>
  request<{ ok: true }>('POST', `/api/rooms/${roomId}/report`, { reason, details });

export const reportRoomMessage = (roomId: string, messageId: string, reason: string) =>
  request<{ ok: true }>('POST', `/api/rooms/${roomId}/messages/${messageId}/report`, { reason });

export const deleteRoomMessage = (roomId: string, messageId: string) =>
  request<void>('DELETE', `/api/rooms/${roomId}/messages/${messageId}`);

/** Admin/creator: edit room name/description. */
export const updateRoom = (roomId: string, body: { name?: string; description?: string }) =>
  request<{ room: RoomDetail }>('PATCH', `/api/rooms/${roomId}`, body);

/** Admin/creator: pin or unpin a message. */
export const pinRoomMessage = (roomId: string, messageId: string, pin: boolean) =>
  request<{ ok: true; isPinned: boolean }>('POST', `/api/rooms/${roomId}/messages/${messageId}/pin`, { pin });

/** Admin/creator: remove a member from the room. */
export const removeRoomMember = (roomId: string, userId: string) =>
  request<void>('DELETE', `/api/rooms/${roomId}/members/${userId}`);

/** Creator only: promote/demote a member between admin and member. */
export const updateRoomMemberRole = (roomId: string, userId: string, role: RoomRole) =>
  request<{ ok: true; role: RoomRole }>('PATCH', `/api/rooms/${roomId}/members/${userId}`, { role });

/** Admin/creator: change the group photo (photoUrl = R2 key or hosted URL). */
export const updateRoomPhoto = (roomId: string, photoUrl: string) =>
  request<{ coverImageUrl: string }>('PATCH', `/api/rooms/${roomId}/photo`, { photoUrl });

/** Creator only: transfer ownership to another member. */
export const transferRoomOwnership = (roomId: string, userId: string) =>
  request<{ ok: true; newCreatorId: string }>('POST', `/api/rooms/${roomId}/transfer-ownership`, { userId });

/** Creator only: permanently delete the group. */
export const deleteRoom = (roomId: string) =>
  request<void>('DELETE', `/api/rooms/${roomId}`);

/* ─────────────────────── Room invites (Group availability) ─────────────────────── */

/**
 * Add a user to a room directly (if they're open to groups) or send them an
 * invite (if not, but you already have a conversation). 403 cannot_add_user
 * when neither is possible.
 */
export const inviteOrAddToRoom = (roomId: string, userId: string) =>
  request<InviteOrAddResult>('POST', `/api/rooms/${roomId}/invite-or-add/${userId}`);

/** Pending room invites addressed to the current user, newest first. */
export const listRoomInvites = () =>
  request<{ invites: RoomInviteCard[] }>('GET', '/api/rooms/invites');

/** Accept a pending invite (invitee). */
export const acceptRoomInvite = (inviteId: string) =>
  request<{ ok: true; roomId: string }>('POST', `/api/rooms/invites/${inviteId}/accept`);

/** Decline a pending invite (invitee). */
export const declineRoomInvite = (inviteId: string) =>
  request<{ ok: true }>('POST', `/api/rooms/invites/${inviteId}/decline`);

/** Cancel an outgoing invite (inviter). */
export const cancelRoomInvite = (inviteId: string) =>
  request<void>('DELETE', `/api/rooms/invites/${inviteId}`);

export { BASE_URL };
