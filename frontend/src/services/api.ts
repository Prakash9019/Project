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
  Gender,
  BodyType,
  SkinTone,
  RelationshipStatus,
  WhereWeCanMeet,
  DatingIntention,
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

export interface RequestOtpResponse {
  message: string;
  expiresInSeconds: number;
}
export const requestOtp = (phone: string) =>
  request<RequestOtpResponse>('POST', '/api/v1/auth/request-otp', { phone }, { auth: false });

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  profileComplete: boolean;
  isNewUser: boolean;
  user: Self;
}
export const verifyOtp = (phone: string, code: string) =>
  request<VerifyOtpResponse>('POST', '/api/v1/auth/verify-otp', { phone, code }, { auth: false });

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
  bodyType?: string;
  tribes?: string[];
  tags?: string[];
  lookingFor?: string[];
  sort?: 'distance' | 'fresh';
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

export const shortlistUser = (userId: string) =>
  request<{ ok: boolean }>('POST', '/api/v1/discovery/favorites', { userId });

export const unshortlistUser = (userId: string) =>
  request<void>('DELETE', '/api/v1/discovery/favorites', { userId });

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
  photoVerified: boolean;
  faceVerified: boolean;
  isVerified: boolean;
  history: unknown[];
}
export const getVerificationStatus = () =>
  request<VerificationStatusResponse>('GET', '/api/v1/verification/status');

export const verifyPhoto = (mediaUrl: string) =>
  request<{ id: string; status: string; score: number }>('POST', '/api/v1/verification/photo', {
    mediaUrl,
  });

export const verifyFace = (mediaUrl: string) =>
  request<{ id: string; status: string; score: number }>('POST', '/api/v1/verification/face', {
    mediaUrl,
  });

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

export const removeAlbumPhoto = (albumId: string, photoId: string) =>
  request<void>('DELETE', `/api/albums/${albumId}/photos/${photoId}`);

export const reorderAlbumPhotos = (
  albumId: string,
  order: { photoId: string; order: number }[]
) => request<{ ok: boolean }>('PATCH', `/api/albums/${albumId}/photos/reorder`, { order });

export const getUserAlbums = (userId: string) =>
  request<{ albums: AlbumSummary[] }>('GET', `/api/v1/users/${userId}/albums`);

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
  amount: number;
  currency: 'INR' | 'USD';
}
export const createSubscription = (body: {
  plan: Exclude<Plan, 'free'>;
  billingCycle: BillingCycle;
  paymentProvider: 'razorpay' | 'stripe';
}) => request<CreateSubscriptionResponse>('POST', '/api/subscriptions', body);

export const verifySubscription = (body: {
  orderId: string;
  paymentId: string;
  signature: string;
}) =>
  request<{ plan: string; planExpiresAt: string; ok: true }>(
    'POST',
    '/api/subscriptions/verify',
    body
  );

export const getCurrentSubscription = () =>
  request<{ plan: string; billingCycle: string; expiresAt: string; autoRenew: boolean }>(
    'GET',
    '/api/subscriptions/current'
  );

// ── Add-on purchases (brief-specified; not in spec endpoints[]) ──
// The spec lists add-ons as a root constant + AddOnType enum but no purchase
// endpoint. These follow the subscription convention per the Phase 11 brief.
export const createAddOnOrder = (addOnType: AddOnType) =>
  request<CreateSubscriptionResponse>('POST', '/api/addons', {
    addOnType,
    paymentProvider: 'razorpay',
  });
export const verifyAddOnPurchase = (body: { orderId: string; paymentId: string; signature: string }) =>
  request<{ ok: true }>('POST', '/api/addons/verify', body);

/* ──────────────────────────────── AI ──────────────────────────────── */

export const getDailyTop10 = () =>
  request<{ profiles: UserCard[]; refreshesAt: string }>('GET', '/api/ai/top-10');

export { BASE_URL };
