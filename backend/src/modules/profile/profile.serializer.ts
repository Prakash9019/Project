import { activityStatus, distanceLabel } from '../../utils/geo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UserWithRelations = any;

function profileFields(user: UserWithRelations) {
  return {
    name: user.name,
    age: user.age,
    gender: user.gender,
    bio: user.bio,
    height: user.height,
    weight: user.weight,
    bodyType: user.bodyType,
    relationshipType: user.relationshipType,
    lookingFor: user.lookingFor ?? [],
    datingIntentions: user.datingIntentions ?? [],
    interests: user.interests ?? [],
    topArtists: user.topArtists ?? [],
    tribes: user.tribes ?? [],
    tags: user.tags ?? [],
    virtualDatingBadge: user.virtualDatingBadge ?? false,
    isVerified: user.isVerified,
    photoVerified: user.photoVerified,
    faceVerified: user.faceVerified,
  };
}

/** Full self-view returned to the authenticated owner. */
export function serializeSelf(user: UserWithRelations) {
  return {
    id: user.id,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    ...profileFields(user),
    tier: user.tier,
    reputationScore: user.reputationScore,
    hasPin: Boolean(user.pinHash),
    photos: (user.photos ?? []).map(serializePhoto),
    prompts: (user.prompts ?? []).map(serializePrompt),
    settings: user.settings ? serializeSettings(user.settings) : null,
    createdAt: user.createdAt,
  };
}

/** Public profile view (Profile Inspection Overlay). `viewer` enables shared-highlight computation. */
export function serializePublicProfile(user: UserWithRelations, viewer?: UserWithRelations) {
  const shared = viewer
    ? {
        interests: intersect(viewer.interests, user.interests),
        topArtists: intersect(viewer.topArtists, user.topArtists),
        tribes: intersect(viewer.tribes, user.tribes),
      }
    : undefined;

  return {
    id: user.id,
    ...profileFields(user),
    photos: (user.photos ?? []).filter((p: any) => !p.isPrivate).map(serializePhoto),
    prompts: (user.prompts ?? []).map(serializePrompt),
    activity: activityStatus(new Date(user.lastActiveAt)),
    ...(shared ? { sharedHighlights: shared } : {}),
  };
}

/**
 * Compact grid card. `distanceMeters` is raw distance from Redis; we render only a fuzzed label
 * (precise coordinates are never exposed). `showDistance=false` hides the label but order is kept.
 */
export function serializeGridCard(
  user: UserWithRelations,
  distanceMeters: number,
  boosted: boolean,
  showDistance = true,
) {
  const primary = (user.photos ?? []).find((p: any) => p.isPrimary) ?? user.photos?.[0];
  return {
    id: user.id,
    name: user.name,
    age: user.age,
    isVerified: user.isVerified,
    photoVerified: user.photoVerified,
    bodyType: user.bodyType,
    tribes: user.tribes ?? [],
    thumbnailUrl: primary?.url ?? null,
    distanceLabel: showDistance ? distanceLabel(distanceMeters) : null,
    activity: activityStatus(new Date(user.lastActiveAt)),
    boosted,
  };
}

export function serializeSettings(s: UserWithRelations) {
  return {
    verifiedOnly: s.verifiedOnly,
    proximityShrink: s.proximityShrink,
    stealthMode: s.stealthMode,
    discoverable: s.discoverable,
    showDistance: s.showDistance,
    locationDealbreaker: s.locationDealbreaker,
    nationwideMode: s.nationwideMode,
    incognito: s.incognito,
    appIcon: s.appIcon,
    screenshotBlock: s.screenshotBlock,
    blockOffensiveLanguage: s.blockOffensiveLanguage,
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
