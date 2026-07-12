import { Gender, RelationshipIntent } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { env } from '../../config/env';
import { getBlockedIds } from '../../utils/blocks';

const CANDIDATE_FETCH = 500;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/** Boost/spotlight add-on tiers score differently, so higher-priced boosts outrank cheaper ones. */
export const BOOST_SCORES: Record<string, number> = {
  boost_local:     8_000_000,
  boost_extended:  9_000_000,
  boost_city_wide: 10_000_000,
  mega_boost:      11_000_000,
  spotlight:       12_000_000,
};

/**
 * Weighted rank score — higher wins. Plan tiers are spaced 5x apart (platinum
 * 5,000,000 vs premium 1,000,000) so a Platinum candidate outranks every
 * non-boosted lower-plan candidate regardless of distance/completeness/reply
 * rate, giving Platinum's "5x algorithm boost" real effect across every page
 * of results, not just relative ordering within one page.
 */
function computeRankScore(
  user: { plan: string; profileCompletenessScore?: number | null; historicalReplyRate?: number | null },
  distanceM: number | null,
  activeBoostType: string | null,
): number {
  let score = 0;

  if (activeBoostType) score += BOOST_SCORES[activeBoostType] ?? 8_000_000;

  const planScore: Record<string, number> = {
    platinum: 5_000_000,
    gold: 2_000_000,
    premium: 1_000_000,
    free: 0,
  };
  score += planScore[user.plan] ?? 0;

  // Closer = higher score: 500,000 pts at 0m, tapering to 0 at 100km. No
  // distance data (fallback pass) contributes nothing rather than a false max.
  const distanceScore = distanceM == null ? 0 : Math.max(0, 500_000 - (distanceM / 100_000) * 500_000);
  score += distanceScore;

  score += (user.profileCompletenessScore ?? 0) * 1_000;
  score += (user.historicalReplyRate ?? 0) * 50_000;

  return score;
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
  gender?: string[];
  relationshipIntent?: string[];
  /** JSON-encoded AdvancedFilters (education/occupation/language/...) — fields not yet on the User model are logged and ignored. */
  advancedFilters?: string;
  sort?: 'distance' | 'fresh';
  nationwideMode?: boolean;
  // plan-gated filters
  verifiedOnly?: boolean;
  activeLast5Min?: boolean;
  activeLast30Min?: boolean;
  recentlyJoined?: boolean;
  highReplyRate?: boolean;
}

/** advancedFilters keys with no matching User model column yet — see grid-service TODO below. */
const KNOWN_ADVANCED_FILTER_KEYS: string[] = [];

export async function getGrid(filters: GridFilters) {
  const {
    viewerId, lat, lng, radiusM, limit, offset, nationwideMode, planLimit,
  } = filters;
  const effectiveRadius = nationwideMode ? env.nationwideRadiusM : radiusM;

  // 1. Load viewer + blocked IDs — needed for both the geo pass and the fallback pass below.
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

  // 2. Geo-candidates from Redis
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

  // 3. Two-pass fallback: if Redis has no geo hit (new user who hasn't synced
  // location yet, sparse area, or everyone is beyond any configured radius),
  // fall back to a DB-only candidate pool rather than showing an empty grid.
  // onlineOnly has no meaning without presence-checked geo candidates, so it
  // skips the fallback and stays empty.
  const usingFallback = distanceById.size === 0 && !filters.onlineOnly;
  let candidateIds: string[];
  if (usingFallback) {
    const fallback = await prisma.user.findMany({
      where: { id: { notIn: [...blockedIds, viewerId] }, isOnGrid: true },
      select: { id: true },
      take: CANDIDATE_FETCH,
    });
    candidateIds = fallback.map((f) => f.id);
  } else {
    candidateIds = [...distanceById.keys()].filter((id) => !blockedIds.has(id));
  }
  if (candidateIds.length === 0) return { total: 0, page: [] };

  // 4. Online presence check for onlineOnly filter
  let onlineIds: Set<string> | null = null;
  if (filters.onlineOnly) {
    const pipeline = redis.pipeline();
    for (const id of candidateIds) pipeline.get(RedisKeys.presence(id));
    const results = await pipeline.exec();
    onlineIds = new Set<string>();
    candidateIds.forEach((id, i) => { if (results?.[i]?.[1]) onlineIds!.add(id); });
  }

  // 5. Inactivity threshold
  const activeThreshold = new Date(Date.now() - FOURTEEN_DAYS_MS);

  // 6. Build DB where clause for plan-gated time-based filters
  const fiveMinAgo   = filters.activeLast5Min  ? new Date(Date.now() - 5 * 60 * 1000)  : null;
  const thirtyMinAgo = filters.activeLast30Min ? new Date(Date.now() - 30 * 60 * 1000) : null;
  const twoDaysAgo   = filters.recentlyJoined  ? new Date(Date.now() - 48 * 60 * 60 * 1000) : null;

  // advancedFilters (education/occupation/language/religion/drinking/smoking/relationshipGoal):
  // TODO: add these columns to the User model. Until then, parse the payload so
  // it round-trips cleanly, apply any recognized keys, and log the rest instead
  // of silently dropping the whole param.
  if (filters.advancedFilters) {
    try {
      const parsed = JSON.parse(filters.advancedFilters) as Record<string, unknown>;
      const unknownKeys = Object.keys(parsed).filter((k) => !KNOWN_ADVANCED_FILTER_KEYS.includes(k));
      if (unknownKeys.length) {
        // eslint-disable-next-line no-console
        console.warn(`[grid] advancedFilters keys not yet supported by the User model, ignoring: ${unknownKeys.join(', ')}`);
      }
    } catch {
      // eslint-disable-next-line no-console
      console.warn('[grid] failed to parse advancedFilters JSON, ignoring');
    }
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: candidateIds },
      AND: [
        // Verified-identity gate: phone OTP OR email OTP (face verification removed).
        { OR: [{ phoneVerified: true }, { emailVerified: true }] },
        // A candidate with no UserSettings row (legacy/never-saved) defaults to discoverable.
        { OR: [{ settings: { discoverable: true, stealthMode: false } }, { settings: { is: null } }] },
      ],
      isOnGrid: true,
      incognitoMode: false,
      pauseIncomingMessages: false,
      lastActiveAt: { gte: fiveMinAgo ?? thirtyMinAgo ?? activeThreshold },
      ...(twoDaysAgo ? { createdAt: { gte: twoDaysAgo } } : {}),
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
      ...(filters.gender?.length ? { gender: { in: filters.gender as Gender[] } } : {}),
      ...(filters.relationshipIntent?.length ? { relationshipIntent: { in: filters.relationshipIntent as RelationshipIntent[] } } : {}),
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
    select: { userId: true, addOnType: true },
    orderBy: { activatedAt: 'desc' },
  });
  const boostedMap = new Map<string, string>();
  for (const b of boostPurchases) {
    if (!boostedMap.has(b.userId)) boostedMap.set(b.userId, b.addOnType);
  }

  // 8. Batch shortlist + tap resolution
  const [favRows, tapRows] = await Promise.all([
    prisma.favorite.findMany({ where: { userId: viewerId }, select: { favoriteId: true } }),
    prisma.tap.findMany({ where: { senderId: viewerId }, select: { receiverId: true } }),
  ]);
  const favoritedIds = new Set(favRows.map((f) => f.favoriteId));
  const tappedIds    = new Set(tapRows.map((t) => t.receiverId));

  // 9. v3 ranking: weighted score — boosted > platinum (5x) > gold > premium > free,
  // then distance/completeness/replyRate as tiebreakers within a tier.
  interface Ranked { user: typeof visible[number]; distanceMeters: number | null; boostType: string | null; boosted: boolean }
  const ranked: Ranked[] = visible.map((u) => {
    const boostType = boostedMap.get(u.id) ?? null;
    return {
      user: u,
      distanceMeters: usingFallback ? null : distanceById.get(u.id) ?? effectiveRadius,
      boostType,
      boosted: boostType !== null,
    };
  });

  if (filters.sort === 'fresh') {
    ranked.sort((a, b) => b.user.createdAt.getTime() - a.user.createdAt.getTime());
  } else {
    ranked.sort((a, b) => (
      computeRankScore(b.user, b.distanceMeters, b.boostType) - computeRankScore(a.user, a.distanceMeters, a.boostType)
    ));
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

/** GET /api/v1/grid/spotlight — users with an active spotlight add-on near the viewer. */
export async function getSpotlight(viewerId: string, lat: number, lng: number, radiusM: number) {
  const blockedIds = await getBlockedIds(viewerId);

  const raw = (await redis.geosearch(
    RedisKeys.geoUsers,
    'FROMLONLAT', lng, lat,
    'BYRADIUS', radiusM, 'm',
    'ASC', 'COUNT', CANDIDATE_FETCH,
  )) as string[];

  const nearbyIds = raw.filter((id) => id !== viewerId && !blockedIds.has(id));
  if (nearbyIds.length === 0) return { users: [] };

  const spotlightPurchases = await prisma.addOnPurchase.findMany({
    where: {
      userId: { in: nearbyIds },
      addOnType: 'spotlight' as never,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { activatedAt: 'desc' },
    select: { userId: true, activatedAt: true },
  });
  if (spotlightPurchases.length === 0) return { users: [] };

  const orderedIds = spotlightPurchases.map((s) => s.userId).slice(0, 5);
  const users = await prisma.user.findMany({
    where: {
      id: { in: orderedIds },
      isOnGrid: true,
      incognitoMode: false,
      OR: [{ phoneVerified: true }, { emailVerified: true }],
    },
    include: {
      photos: { where: { isPrimary: true, isPrivate: false }, take: 1 },
      cityProfiles: { where: { isActive: true }, take: 1 },
    },
  });

  const byId = new Map(users.map((u) => [u.id, u]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter((u): u is typeof users[number] => !!u);

  return { users: ordered };
}
