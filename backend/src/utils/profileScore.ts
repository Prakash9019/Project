import { prisma } from '../config/prisma';

/**
 * Recompute and persist profileCompletenessScore.
 * Called after profile updates and photo changes.
 */
export async function recomputeCompletenessScore(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true, age: true, bio: true, height: true,
      genderIdentity: true, interests: true, tribes: true, lookingFor: true,
      photos: { where: { isPrivate: false, isPrimary: true }, take: 1 },
    },
  });
  if (!user) return 0;

  let score = 0;
  if (user.firstName) score += 20;
  if (user.age) score += 10;
  if (user.photos.length > 0) score += 15;
  if (user.bio && user.bio.length > 50) score += 15;
  if ((user.interests?.length ?? 0) > 0 || (user.tribes?.length ?? 0) > 0) score += 10;
  if ((user.lookingFor?.length ?? 0) > 0) score += 10;
  if (user.height) score += 10;
  if (user.genderIdentity) score += 10;

  await prisma.user.update({ where: { id: userId }, data: { profileCompletenessScore: score } });
  return score;
}
