import { prisma } from '../config/prisma';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Fire-and-forget: recompute and persist historicalReplyRate for userId. */
export async function updateReplyRate(userId: string): Promise<void> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const [initiated, replied] = await Promise.all([
    prisma.conversation.count({ where: { initiatorId: userId, createdAt: { gte: since } } }),
    prisma.conversation.count({
      where: {
        initiatorId: userId,
        createdAt: { gte: since },
        messages: { some: { senderId: { not: userId }, deletedAt: null } },
      },
    }),
  ]);
  if (initiated === 0) return;
  await prisma.user.update({
    where: { id: userId },
    data: { historicalReplyRate: replied / initiated },
  });
}
