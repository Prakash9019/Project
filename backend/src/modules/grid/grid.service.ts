import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { env } from '../../config/env';
import { getBlockedIds } from '../../utils/blocks';

const CANDIDATE_FETCH = 500;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// v3 ranking tier score — lower = higher priority
function planTierScore(plan: string): number {
  switch (plan) {
    case 'platinum': return 1;
    case 'gold':     return 2;
    case 'premium':  return 3;
    default:         return 4;
  }
}

/** Map gender/genderIdentity to a WantToSee label for orientation filtering. */
function toDiscoverLabel(gender: string | null, genderIdentity: string | null): string | null {
  if (genderIdentity === 'non_binary' || gender === 'nonbinary') return 'non_binary_people';
  if (gender === 'male')   return 'men';
  if (gender === 'female') return 'women';
  return null;
}

/** Orientation-aware visibility check: viewer × candidate cross-reference. */
function orientationVisible(
  viewerWantToSee: string[],
  viewerGender: string | null,
  viewerGenderIdentity: string | null,
  candidateWhoCanDiscoverMe: string[],
  candidateGender: string | null,
  candidateGenderIdentity: string | null,
): boolean {
  // Step 1: viewer wants to see this candidate's gender
  if (viewerWantToSee.length > 0 && !viewerWantToSee.includes('everyone')) {
    const candidateLabel = toDiscoverLabel(candidateGender, candidateGenderIdentity);
    if (candidateLabel && !viewerWantToSee.includes(candidateLabel)) return false;
  }

  // Step 2: candidate is discoverable by viewer's gender
  if (candidateWhoCanDiscoverMe.length > 0 && !candidateWhoCanDiscoverMe.includes('everyone')) {
    const viewerLabel = toDiscoverLabel(viewerGender, viewerGenderIdentity);
    if (viewerLabel && !candidateWhoCanDiscoverMe.includes(viewerLabel)) return false;
  }

  return true;
}

/** Reusable orientation-visibility check (viewer × candidate), for non-grid feeds. */
export function isOrientationVisible(
  viewer: { wantToSee?: string[] | null; gender?: string | null; genderIdentity?: string | null },
  candidate: { whoCanDiscoverMe?: string[] | null; gender?: string | null; genderIdentity?: string | null },
): boolean {
  return orientationVisible(
    (viewer.wantToSee ?? []) as string[], viewer.gender ?? null, viewer.genderIdentity ?? null,
    (candidate.whoCanDiscoverMe ?? []) as string[], candidate.gender ?? null, candidate.genderIdentity ?? null,
  );
}

export interface GridFilters {
  viewerId: string;
  lat: number;
  lng: number;
  radiusM: number;
  limit: number;
  offset: number;
  planLimit: number | null;
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
  nationwideMode?: boolean;
  // plan-gated filters
  verifiedOnly?: boolean;
  activeLast5Min?: boolean;
  activeLast30Min?: boolean;
  recentlyJoined?: boolean;
  highReplyRate?: boolean;
}

export async function getGrid(filters: GridFilters) {
  const {
    viewerId, lat, lng, radiusM, limit, offset, nationwideMode, planLimit,
  } = filters;
  const effectiveRadius = nationwideMode ? env.nationwideRadiusM : radiusM;

  // 1. Geo-candidates from Redis
  const raw = (await redis.geosearch(
    RedisKeys.geoUsers,
    'FROMLONLAT', lng, lat,
    'BYRADIUS', effectiveRadius, 'm',
    'ASC', 'WITHDIST', 'COUNT', CANDIDATE_FETCH,
  )) as [string, string][];

  const distanceById = new Map<string, number>();
  for (const [member, dist] of raw) {
    if (member !== viewerId) distanceById.set(member, Number(dist) * 1000); // km→m
  }
  if (distanceById.size === 0) return { total: 0, page: [] };

  // 2. Load viewer + blocked IDs
  const [viewer, blockedIds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        wantToSee: true, gender: true, genderIdentity: true,
        settings: true,
      },
    }),
    getBlockedIds(viewerId),
  ]);

  const candidateIds = [...distanceById.keys()].filter((id) => !blockedIds.has(id));

  // 3. Online presence check for onlineOnly filter
  let onlineIds: Set<string> | null = null;
  if (filters.onlineOnly) {
    const pipeline = redis.pipeline();
    for (const id of candidateIds) pipeline.get(RedisKeys.presence(id));
    const results = await pipeline.exec();
    onlineIds = new Set<string>();
    candidateIds.forEach((id, i) => { if (results?.[i]?.[1]) onlineIds!.add(id); });
  }

  // 4. Inactivity threshold
  const activeThreshold = new Date(Date.now() - FOURTEEN_DAYS_MS);

  // 5. Build DB where clause for plan-gated time-based filters
  const fiveMinAgo   = filters.activeLast5Min  ? new Date(Date.now() - 5 * 60 * 1000)  : null;
  const thirtyMinAgo = filters.activeLast30Min ? new Date(Date.now() - 30 * 60 * 1000) : null;
  const twoDaysAgo   = filters.recentlyJoined  ? new Date(Date.now() - 48 * 60 * 60 * 1000) : null;

  const users = await prisma.user.findMany({
    where: {
      id: { in: candidateIds },
      // Verified-identity gate: phone OTP OR email OTP (face verification removed).
      AND: [{ OR: [{ phoneVerified: true }, { emailVerified: true }] }],
      isOnGrid: true,
      incognitoMode: false,
      pauseIncomingMessages: false,
      lastActiveAt: { gte: fiveMinAgo ?? thirtyMinAgo ?? activeThreshold },
      ...(twoDaysAgo ? { createdAt: { gte: twoDaysAgo } } : {}),
      settings: { discoverable: true, stealthMode: false },
      ...(filters.verifiedOnly ? { isVerified: true } : {}),
      ...(filters.highReplyRate ? { historicalReplyRate: { gt: 0.6 } } : {}),
      ...(filters.bodyType ? { bodyType: filters.bodyType as never } : {}),
      ...(filters.ageMin || filters.ageMax ? {
        age: {
          ...(filters.ageMin ? { gte: filters.ageMin } : {}),
          ...(filters.ageMax ? { lte: filters.ageMax } : {}),
        },
      } : {}),
      ...(filters.heightMin || filters.heightMax ? {
        height: {
          ...(filters.heightMin ? { gte: filters.heightMin } : {}),
          ...(filters.heightMax ? { lte: filters.heightMax } : {}),
        },
      } : {}),
      ...(filters.tribes?.length ? { tribes: { hasSome: filters.tribes } } : {}),
      ...(filters.tags?.length ? { tags: { hasSome: filters.tags } } : {}),
      ...(filters.lookingFor?.length ? { lookingFor: { hasSome: filters.lookingFor } } : {}),
    },
    include: {
      photos: { where: { isPrimary: true, isPrivate: false }, take: 1 },
      settings: true,
      cityProfiles: { where: { isActive: true }, take: 1 },
    },
  });

  // 6. In-memory filters: orientation, onlineOnly, remaining
  const viewerWantToSee = viewer?.wantToSee ?? [];
  const viewerGender = viewer?.gender ?? null;
  const viewerGenderIdentity = viewer?.genderIdentity ?? null;

  const visible = users.filter((u) => {
    if (onlineIds && !onlineIds.has(u.id)) return false;
    // Orientation filter
    if (
      !orientationVisible(
        viewerWantToSee as string[], viewerGender, viewerGenderIdentity,
        u.whoCanDiscoverMe as string[], u.gender, u.genderIdentity,
      )
    ) return false;
    return true;
  });

  // 7. Load active boost/spotlight add-ons for visible set
  const visibleIds = visible.map((u) => u.id);
  const boostPurchases = await prisma.addOnPurchase.findMany({
    where: {
      userId: { in: visibleIds },
      addOnType: { in: ['boost_local', 'boost_extended', 'boost_city_wide', 'mega_boost', 'spotlight'] as never[] },
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { userId: true },
  });
  const boostedSet = new Set(boostPurchases.map((b) => b.userId));

  // 8. Batch shortlist + tap resolution
  const [favRows, tapRows] = await Promise.all([
    prisma.favorite.findMany({ where: { userId: viewerId }, select: { favoriteId: true } }),
    prisma.tap.findMany({ where: { senderId: viewerId }, select: { receiverId: true } }),
  ]);
  const favoritedIds = new Set(favRows.map((f) => f.favoriteId));
  const tappedIds    = new Set(tapRows.map((t) => t.receiverId));

  // 9. v3 ranking: boosted > platinum > gold > premium > free, then distance, completeness, replyRate
  interface Ranked { user: typeof visible[number]; distanceMeters: number; boosted: boolean }
  const ranked: Ranked[] = visible.map((u) => ({
    user: u,
    distanceMeters: distanceById.get(u.id) ?? effectiveRadius,
    boosted: boostedSet.has(u.id),
  }));

  if (filters.sort === 'fresh') {
    ranked.sort((a, b) => b.user.createdAt.getTime() - a.user.createdAt.getTime());
  } else {
    ranked.sort((a, b) => {
      const boostA = a.boosted ? 0 : 1;
      const boostB = b.boosted ? 0 : 1;
      if (boostA !== boostB) return boostA - boostB;

      const tierA = planTierScore(a.user.plan);
      const tierB = planTierScore(b.user.plan);
      if (tierA !== tierB) return tierA - tierB;

      if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;

      const compA = a.user.profileCompletenessScore ?? 0;
      const compB = b.user.profileCompletenessScore ?? 0;
      if (compA !== compB) return compB - compA;

      const rrA = a.user.historicalReplyRate ?? 0;
      const rrB = b.user.historicalReplyRate ?? 0;
      return rrB - rrA;
    });
  }

  const total = ranked.length;

  // 10. Plan-gated profile limit
  const capped = planLimit !== null ? ranked.slice(0, planLimit) : ranked;
  const page   = capped.slice(offset, offset + limit);

  return {
    total,
    page: page.map((p) => ({
      ...p,
      isShortlisted: favoritedIds.has(p.user.id),
      isLiked:       tappedIds.has(p.user.id),
    })),
  };
}

/** Used by explore and for-you — same inactivity + block logic, no geo radius. */
export async function getBlockedIdsForUser(userId: string): Promise<Set<string>> {
  return getBlockedIds(userId);
}
