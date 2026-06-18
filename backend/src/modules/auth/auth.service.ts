import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../../utils/jwt';
import { Errors } from '../../utils/httpError';
import { verifyFirebaseToken } from '../../adapters/firebase';

export async function loginWithFirebase(idToken: string) {
  const decoded = await verifyFirebaseToken(idToken).catch(() => {
    throw Errors.unauthorized('Invalid Firebase ID token');
  });

  const firebaseUid = decoded.uid;
  const email = decoded.email ?? null;
  const emailVerified = decoded.email_verified ?? false;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ firebaseUid }, ...(email ? [{ email }] : [])] },
    select: { id: true },
  });
  const isNewUser = !existing;

  const user = await prisma.user.upsert({
    where: { firebaseUid },
    update: {
      email,
      emailVerified,
      phoneVerified: emailVerified,  // keeps existing DB filters (grid/explore) working
      lastActiveAt: new Date(),
    },
    create: {
      firebaseUid,
      email,
      emailVerified,
      phoneVerified: emailVerified,  // grid/explore filter on phoneVerified: true
      settings: { create: {} },
      wallet: { create: {} },
    },
    include: { photos: true, settings: true },
  });

  const profileComplete = Boolean(user.name || user.firstName);
  const tokens = await issueTokenPair(user.id, user.emailVerified, user.tier, user.plan, user.planExpiresAt);
  return { user, tokens, profileComplete, isNewUser };
}

export async function refreshTokens(refreshToken: string) {
  let claims;
  try {
    claims = verifyRefreshToken(refreshToken);
  } catch {
    throw Errors.unauthorized('Invalid refresh token');
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored) throw Errors.unauthorized('Invalid refresh token');

  if (stored.usedAt !== null) {
    await prisma.refreshToken.deleteMany({ where: { family: stored.family } });
    throw Errors.unauthorized('Token reuse detected — all sessions invalidated');
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) throw Errors.unauthorized('User no longer exists');

  return issueTokenPair(user.id, user.emailVerified, user.tier, user.plan, user.planExpiresAt, stored.family);
}

export async function logoutSession(refreshToken: string): Promise<void> {
  let tokenHash: string;
  try {
    tokenHash = hashToken(refreshToken);
  } catch {
    return;
  }
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, select: { family: true } });
  if (stored) {
    await prisma.refreshToken.deleteMany({ where: { family: stored.family } });
  }
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

function effectivePlan(plan: string, planExpiresAt: Date | null): string {
  if (plan === 'free') return 'free';
  if (!planExpiresAt) return plan;
  return planExpiresAt > new Date() ? plan : 'free';
}

async function issueTokenPair(
  userId: string,
  emailVerified: boolean,
  tier: string,
  plan: string,
  planExpiresAt: Date | null,
  existingFamily?: string,
) {
  const effectPlan = effectivePlan(plan, planExpiresAt);
  const accessToken = signAccessToken({
    sub: userId,
    phoneVerified: false,  // OTP auth removed; always false for Firebase users
    emailVerified,
    tier,
    plan: effectPlan,
    planExpiresAt:
      effectPlan !== 'free' && planExpiresAt ? Math.floor(planExpiresAt.getTime() / 1000) : null,
  });
  const refreshToken = signRefreshToken(userId);
  const family = existingFamily ?? randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      family,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}
