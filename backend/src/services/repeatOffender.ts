import { prisma } from '../config/prisma';
import { redis, RedisKeys } from '../config/redis';
import { env } from '../config/env';

const RESTRICTION_HOURS = 48;

/**
 * Called after a new confirmed report is created.
 * Checks total confirmed reports for the reported user and applies escalating penalties.
 * Fire-and-forget — never throws to the caller.
 */
export async function checkRepeatOffender(reportedUserId: string): Promise<void> {
  try {
    const confirmedCount = await prisma.report.count({
      where: { reportedId: reportedUserId },
    });

    const { reportThresholdForBan, reportThresholdForReview } = env.safety;

    if (confirmedCount >= reportThresholdForBan) {
      // Auto-ban
      const now = new Date();
      await prisma.user.update({
        where: { id: reportedUserId },
        data: {
          isBanned: true,
          bannedAt: now,
          isOnGrid: false,
        },
      });
      // Set Redis banned flag with 30-day TTL so all in-flight tokens are rejected
      await redis.set(RedisKeys.banned(reportedUserId), '1', 'EX', 60 * 60 * 24 * 30);
      return;
    }

    if (confirmedCount >= reportThresholdForReview) {
      // Temporary restriction + grid removal
      const restrictedUntil = new Date(Date.now() + RESTRICTION_HOURS * 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: reportedUserId },
        data: {
          restrictedUntil,
          isOnGrid: false,
          interactionPenaltyUntil: restrictedUntil,
          interactionPenaltyMultiplier: 0.5,
        },
      });
    }
  } catch {
    // Fire-and-forget: never propagate
  }
}
