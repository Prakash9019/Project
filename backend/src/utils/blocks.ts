import { prisma } from '../config/prisma';
import { redis, RedisKeys } from '../config/redis';

const BLOCKED_IDS_TTL = 30; // seconds

/** Returns true if either user has blocked the other (fully mutual). */
export async function isBlocked(userAId: string, userBId: string): Promise<boolean> {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userAId, blockedId: userBId },
        { blockerId: userBId, blockedId: userAId },
      ],
    },
    select: { id: true },
  });
  return !!block;
}

/** Returns the block record where blockerId blocked blockedId, or null. */
export async function getBlockRecord(blockerId: string, blockedId: string) {
  return prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });
}

/** Returns the set of user IDs that have any block relationship with the given user.
 *  Cached in Redis for 30 seconds to reduce repeated DB hits. */
export async function getBlockedIds(userId: string): Promise<Set<string>> {
  const cacheKey = RedisKeys.blockedIds(userId);
  const cached = await redis.get(cacheKey);
  if (cached) {
    return new Set<string>(JSON.parse(cached) as string[]);
  }

  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const b of blocks) {
    ids.add(b.blockerId === userId ? b.blockedId : b.blockerId);
  }

  await redis.set(cacheKey, JSON.stringify([...ids]), 'EX', BLOCKED_IDS_TTL);
  return ids;
}

/** Invalidate the blocked IDs cache for a user (call after block/unblock). */
export async function invalidateBlockedIds(userId: string): Promise<void> {
  await redis.del(RedisKeys.blockedIds(userId));
}
