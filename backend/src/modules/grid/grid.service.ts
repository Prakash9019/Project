import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { env } from '../../config/env';
import { activityStatus } from '../../utils/geo';
import { MIN_PHOTOS_FOR_DISCOVERY } from '../profile/catalogs';

const CANDIDATE_FETCH = 300;

export interface GridFilters {
  viewerId: string;
  lat: number;
  lng: number;
  radiusM: number;
  limit: number;
  offset: number;
  // optional filters
  onlineOnly?: boolean;
  ageMin?: number;
  ageMax?: number;
  heightMin?: number;
  heightMax?: number;
  bodyType?: string;
  tribes?: string[];
  tags?: string[];
  lookingFor?: string[];
  sort?: 'distance' | 'fresh'; // default = distance (+ boost + reputation)
  nationwideMode?: boolean;
}

/** Build the geo-sourced ranked grid page with all server-side filters applied. */
export async function getGrid(filters: GridFilters) {
  const { viewerId, lat, lng, radiusM, limit, offset, nationwideMode } = filters;
  const effectiveRadius = nationwideMode ? env.nationwideRadiusM : radiusM;

  // 1. Pull nearest candidates from the Redis geo index.
  const raw = (await redis.geosearch(
    RedisKeys.geoUsers,
    'FROMLONLAT', lng, lat,
    'BYRADIUS', effectiveRadius, 'm',
    'ASC', 'WITHDIST', 'COUNT', CANDIDATE_FETCH,
  )) as [string, string][];

  const distanceById = new Map<string, number>();
  for (const [member, dist] of raw) {
    if (member !== viewerId) distanceById.set(member, Number(dist));
  }
  if (distanceById.size === 0) return { total: 0, page: [] as never[] };

  // 2. Viewer settings + block list.
  const [viewerSettings, blocks] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: viewerId } }),
    prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);

  const blockedIds = new Set<string>();
  for (const b of blocks) blockedIds.add(b.blockerId === viewerId ? b.blockedId : b.blockerId);

  // 3. DB filter — applies profile-level filters.
  const candidateIds = [...distanceById.keys()];

  // Online-only: check Redis presence.
  let onlineIds: Set<string> | null = null;
  if (filters.onlineOnly) {
    const pipeline = redis.pipeline();
    for (const id of candidateIds) pipeline.get(RedisKeys.presence(id));
    const presenceResults = await pipeline.exec();
    onlineIds = new Set<string>();
    candidateIds.forEach((id, i) => {
      if (presenceResults?.[i]?.[1]) onlineIds!.add(id);
    });
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: candidateIds },
      phoneVerified: true,
      name: { not: null },
      settings: {
        discoverable: true,
        // location dealbreaker: viewer's setting; handled in app (radius already clamped)
        // stealthMode users' discoverability: not directly queryable — handled below
      },
      ...(viewerSettings?.verifiedOnly ? { isVerified: true } : {}),
      // photo verification filter
      ...(filters.bodyType ? { bodyType: filters.bodyType as any } : {}),
      ...(filters.ageMin || filters.ageMax ? { age: { ...(filters.ageMin ? { gte: filters.ageMin } : {}), ...(filters.ageMax ? { lte: filters.ageMax } : {}) } } : {}),
      ...(filters.heightMin || filters.heightMax ? { height: { ...(filters.heightMin ? { gte: filters.heightMin } : {}), ...(filters.heightMax ? { lte: filters.heightMax } : {}) } } : {}),
    },
    include: {
      photos: { where: { isPrivate: false }, orderBy: { order: 'asc' } },
      settings: true,
    },
  });

  // 4. App-level post-filters.
  const now = Date.now();
  const onlineWindowMs = env.grid.onlineWindowSeconds * 1000;

  const visible = users.filter((u) => {
    if (blockedIds.has(u.id)) return false;
    if (u.settings?.stealthMode) return false;
    // must have min 3 public photos for discoverability
    if (u.photos.length < MIN_PHOTOS_FOR_DISCOVERY) return false;
    if (onlineIds && !onlineIds.has(u.id)) return false;
    // tribes filter — must have at least one matching tribe
    if (filters.tribes?.length) {
      const userTribes = new Set(u.tribes);
      if (!filters.tribes.some((t) => userTribes.has(t))) return false;
    }
    // tags filter
    if (filters.tags?.length) {
      const userTags = new Set(u.tags);
      if (!filters.tags.some((t) => userTags.has(t))) return false;
    }
    // lookingFor filter
    if (filters.lookingFor?.length) {
      const userLf = new Set(u.lookingFor);
      if (!filters.lookingFor.some((t) => userLf.has(t))) return false;
    }
    return true;
  });

  // 5. Feed boosts.
  const boosts = await prisma.feedBoost.findMany({
    where: { userId: { in: visible.map((u) => u.id) }, expiresAt: { gt: new Date() } },
    select: { userId: true },
  });
  const boostedSet = new Set(boosts.map((b) => b.userId));

  // 6. Rank.
  interface RankedEntry { user: typeof visible[number]; distanceMeters: number; boosted: boolean; rankScore: number }
  const ranked: RankedEntry[] = visible.map((u) => {
    const distanceMeters = distanceById.get(u.id) ?? effectiveRadius;
    const { online } = activityStatus(new Date(u.lastActiveAt));

    let rankScore: number;
    if (filters.sort === 'fresh') {
      // "Fresh" — newest profiles first
      rankScore = -(new Date(u.createdAt).getTime());
    } else {
      const distNorm = Math.min(1, distanceMeters / effectiveRadius);
      const repTerm = 1 - u.reputationScore;
      const recencyTerm = online ? 0 : now - new Date(u.lastActiveAt).getTime();
      const recencyNorm = Math.min(1, recencyTerm / (7 * 24 * 3600 * 1000));
      rankScore = 0.5 * distNorm + 0.3 * repTerm + 0.2 * recencyNorm;
    }
    return { user: u, distanceMeters, boosted: boostedSet.has(u.id), rankScore };
  });

  ranked.sort((a, b) => {
    if (a.boosted !== b.boosted) return a.boosted ? -1 : 1;
    return a.rankScore - b.rankScore;
  });

  return { total: ranked.length, page: ranked.slice(offset, offset + limit) };
}
