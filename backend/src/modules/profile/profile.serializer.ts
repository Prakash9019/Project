import { activityStatus } from '../../utils/geo';
import { signUrl } from '../../utils/signUrl';

/** Gold+ users can hide their exact distance behind a generic "Near you" label. */
function formatDistance(distanceM: number | null, hideExactDistance: boolean): string | null {
  if (hideExactDistance) return 'Near you';
  if (distanceM === null) return null;
  const km = distanceM / 1000;
  if (km < 1) return '< 1 km away';
  return `${km.toFixed(1)} km away`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UserWithRelations = any;

/**
 * Signs all photo URLs in a user object in-place (returns a shallow clone).
 * Must be called before any serializer so the returned URLs are client-safe
 * signed R2 URLs rather than raw storage keys.
 */
export async function signUserPhotos<T extends { photos?: any[] }>(user: T): Promise<T> {
  if (!user.photos?.length) return user;
  const signed = await Promise.all(
    user.photos.map(async (p: any) => ({
      ...p,
      url: (await signUrl(p.url)) ?? p.url,
    }))
  );
  return { ...user, photos: signed };
}

function profileFields(user: UserWithRelations) {
  return {
    name: user.name,
    firstName: user.firstName,
    age: user.age,
    gender: user.gender,
    bio: user.bio,
    height: user.height,
    weight: user.weight,
    bodyType: user.bodyType,
    skinTone: user.skinTone,
    aboutMe: user.aboutMe,
    whereAreYouFrom: user.whereAreYouFrom,
    relationshipStatus: user.relationshipStatus,
    relationshipType: user.relationshipType,
    lookingFor: user.lookingFor ?? [],
    whereWeCanMeet: user.whereWeCanMeet ?? [],
    preferences: user.preferences,
    fantasyTags: user.fantasyTags ?? [],
    datingIntentions: user.datingIntentions ?? [],
    interests: user.interests ?? [],
    topArtists: user.topArtists ?? [],
    tribes: user.tribes ?? [],
    tags: user.tags ?? [],
    virtualDatingBadge: user.virtualDatingBadge ?? false,
    isVerified: user.isVerified,
    photoVerified: user.photoVerified,
    // Availability toggles — surfaced on both self and public profile so the
    // client can render "Open to Groups / Audio / Video" chips and gate actions.
    groupsAvailable: user.groupsAvailable ?? false,
    audioCallAvailable: user.audioCallAvailable ?? true,
    videoCallAvailable: user.videoCallAvailable ?? true,
  };
}

/** Full self-view returned to the authenticated owner. */
export function serializeSelf(user: UserWithRelations) {
  const primary = (user.photos ?? []).find((p: any) => p.isPrimary) ?? user.photos?.[0];
  // primaryPhotoUrl: the published primary photo. Photo.url is stored as a fully
  // qualified URL (addPhotoSchema requires url()), so it is already client-safe.
  const primaryPublished = (user.photos ?? []).find((p: any) => p.isPrimary && p.isPublished);
  return {
    id: user.id,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    ...profileFields(user),
    // Identity / discovery answers from onboarding. These are kept out of the
    // shared profileFields() so the public profile can gate orientation behind
    // showOrientationPublicly — but the owner always sees their own answers,
    // so edit-profile can pre-fill them after an app restart / re-login.
    genderIdentity: user.genderIdentity ?? null,
    genderIdentityOther: user.genderIdentityOther ?? null,
    sexualOrientation: user.sexualOrientation ?? null,
    wantToSee: user.wantToSee ?? [],
    relationshipIntent: user.relationshipIntent ?? null,
    profilePhoto: primary?.url ?? null,
    primaryPhotoUrl: primaryPublished?.url ?? null,
    rightNowStatus: user.rightNowStatus ?? null,
    rightNowCategory: user.rightNowCategory ?? null,
    rightNowExpiresAt: user.rightNowExpiresAt ?? null,
    rightNowHosting: user.rightNowHosting ?? false,
    plan: user.plan,
    tier: user.tier,
    planExpiresAt: user.planExpiresAt,
    reputationScore: user.reputationScore,
    hasPin: Boolean(user.pinHash),
    photos: (user.photos ?? []).map(serializePhoto),
    prompts: (user.prompts ?? []).map(serializePrompt),
    settings: user.settings ? serializeSettings(user.settings) : null,
    createdAt: user.createdAt,
  };
}

/** Public profile view. `viewerState` carries the viewer's like/shortlist of this user. */
export function serializePublicProfile(
  user: UserWithRelations,
  viewer?: UserWithRelations,
  viewerState?: { isLiked?: boolean; isShortlisted?: boolean },
) {
  const shared = viewer
    ? {
        interests: intersect(viewer.interests, user.interests),
        topArtists: intersect(viewer.topArtists, user.topArtists),
        tribes: intersect(viewer.tribes, user.tribes),
      }
    : undefined;

  const primary = (user.photos ?? []).find((p: any) => p.isPrimary && !p.isPrivate) ?? user.photos?.[0];

  return {
    id: user.id,
    ...profileFields(user),
    profilePhoto: primary?.url ?? null,
    activity: activityStatus(new Date(user.lastActiveAt)),
    photos: (user.photos ?? []).filter((p: any) => !p.isPrivate).map(serializePhoto),
    prompts: (user.prompts ?? []).map(serializePrompt),
    isLiked: viewerState?.isLiked ?? false,
    isShortlisted: viewerState?.isShortlisted ?? false,
    ...(shared ? { sharedHighlights: shared } : {}),
  };
}

/**
 * Compact grid card: returns all required card fields.
 * viewerFavs/viewerLikes are used to set isShortlisted/isLiked per card.
 */
export function serializeGridCard(
  user: UserWithRelations,
  distanceMeters: number | null,
  boosted: boolean,
  showDistance = true,
  viewerFavs?: Set<string>,
  viewerLikes?: Set<string>,
) {
  const primary = (user.photos ?? []).find((p: any) => p.isPrimary && !p.isPrivate) ?? user.photos?.[0];
  const settings = user.settings ?? {};

  // Respect candidate's privacy settings
  const hideActivity = settings.hideActiveStatus ?? false;
  const hideLastSeen = settings.hideLastSeen ?? false;
  const activity = hideActivity ? { label: null, isOnline: false } : activityStatus(new Date(user.lastActiveAt));

  // visiting-soon badge: user has an active city profile with visitingSoonBadge=true
  const activeCityProfile = (user.cityProfiles ?? []).find((cp: any) => cp.isActive);
  const visitingSoonBadge = activeCityProfile?.visitingSoonBadge
    ? { cityName: activeCityProfile.cityName as string }
    : null;

  // Orientation shown publicly only if user opted in
  const showOrientation = settings.showOrientationPublicly ?? false;

  // Right Now: only surface the status while it's still active.
  const rightNowActive = !!(user.rightNowExpiresAt && new Date(user.rightNowExpiresAt) > new Date());

  return {
    id: user.id,
    profilePhoto: primary?.url ?? null,
    rightNowActive,
    rightNowStatus: rightNowActive ? user.rightNowStatus ?? null : null,
    rightNowCategory: rightNowActive ? user.rightNowCategory ?? null : null,
    thumbnailUrl: primary?.url ?? null,
    firstName: user.firstName,
    name: user.name,
    age: user.age,
    isVerified: user.isVerified,
    photoVerified: user.photoVerified,
    bodyType: user.bodyType,
    skinTone: user.skinTone,
    height: user.height,
    weight: user.weight,
    aboutMe: user.aboutMe,
    whereAreYouFrom: user.whereAreYouFrom,
    relationshipStatus: user.relationshipStatus,
    lookingFor: user.lookingFor ?? [],
    whereWeCanMeet: user.whereWeCanMeet ?? [],
    preferences: user.preferences,
    fantasyTags: user.fantasyTags ?? [],
    datingIntentions: user.datingIntentions ?? [],
    interests: user.interests ?? [],
    tribes: user.tribes ?? [],
    tags: user.tags ?? [],
    distanceLabel: showDistance ? formatDistance(distanceMeters, user.hideExactDistance ?? false) : null,
    lastActiveAt: hideLastSeen ? null : activity.label,
    activity: hideActivity ? null : activity,
    isOnline: hideActivity ? false : 'online' in activity && activity.online,
    // true when this candidate was found via the Redis geo index (not the DB
    // fallback pass) — the client uses this to decide whether a map marker
    // can be placed at all, without ever receiving real coordinates.
    hasLocation: distanceMeters !== null,
    boosted,
    planBadge: user.plan !== 'free' ? user.plan : null,
    groupsAvailable: user.groupsAvailable ?? false,
    visitingSoonBadge,
    ...(showOrientation ? { genderIdentity: user.genderIdentity, sexualOrientation: user.sexualOrientation } : {}),
    isShortlisted: viewerFavs ? viewerFavs.has(user.id) : undefined,
    isLiked:       viewerLikes ? viewerLikes.has(user.id) : undefined,
  };
}

export function serializeSettings(s: UserWithRelations) {
  return {
    // discovery
    verifiedOnly: s.verifiedOnly,
    proximityShrink: s.proximityShrink,
    stealthMode: s.stealthMode,
    discoverable: s.discoverable,
    showDistance: s.showDistance,
    locationDealbreaker: s.locationDealbreaker,
    nationwideMode: s.nationwideMode,
    customDistanceKm: s.customDistanceKm ?? null,
    // privacy
    incognito: s.incognito,
    appIcon: s.appIcon,
    screenshotBlock: s.screenshotBlock,
    blockOffensiveLanguage: s.blockOffensiveLanguage,
    // gold+ filters
    activeLast5MinFilter: s.activeLast5MinFilter,
    activeLast30MinFilter: s.activeLast30MinFilter,
    recentlyJoinedFilter: s.recentlyJoinedFilter,
    highReplyRateFilter: s.highReplyRateFilter,
    // notifications
    notifyMessages: s.notifyMessages,
    notifyPreview: s.notifyPreview,
    notifySound: s.notifySound,
    notifyVibrate: s.notifyVibrate,
    notifyReactions: s.notifyReactions,
    notifyMissedCalls: s.notifyMissedCalls,
    notifyGroupMessages: s.notifyGroupMessages,
    notifyMemberActivity: s.notifyMemberActivity,
    notifyMentionsOnly: s.notifyMentionsOnly,
  };
}

function serializePrompt(p: any) {
  return { id: p.id, prompt: p.prompt, answer: p.answer, order: p.order };
}

function serializePhoto(p: any) {
  return { id: p.id, url: p.url, isPrimary: p.isPrimary, order: p.order };
}

function intersect(a?: string[], b?: string[]): string[] {
  if (!a || !b) return [];
  const set = new Set(a.map((x) => x.toLowerCase()));
  return b.filter((x) => set.has(x.toLowerCase()));
}
