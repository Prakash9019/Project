import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../../utils/jwt';
import { Errors } from '../../utils/httpError';
import { verifyFirebaseToken } from '../../adapters/firebase';
import { env } from '../../config/env';

export async function loginWithFirebase(idToken: string) {
  const decoded = await verifyFirebaseToken(idToken).catch(() => {
    throw Errors.unauthorized('Invalid Firebase ID token');
  });

  const firebaseUid = decoded.uid;
  const email = decoded.email ?? null;
  const emailVerified = decoded.email_verified ?? false;
  // Firebase Phone Auth tokens carry phone_number (E.164); Google/email tokens
  // do not. A present phone_number means the SMS OTP was verified by Firebase.
  const phone = decoded.phone_number ?? null;
  const phoneVerified = !!phone;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ firebaseUid }, ...(email ? [{ email }] : [])] },
    select: { id: true },
  });
  const isNewUser = !existing;

  const user = await prisma.user.upsert({
    where: { firebaseUid },
    update: {
      // Only set fields the token actually carries — never downgrade a prior
      // verification (e.g. a later Google sign-in must not unset phoneVerified).
      ...(email ? { email, emailVerified } : {}),
      ...(phone ? { phone, phoneVerified: true } : {}),
      lastActiveAt: new Date(),
    },
    create: {
      firebaseUid,
      email,
      emailVerified,
      phone,
      phoneVerified,
      settings: { create: {} },
      wallet: { create: {} },
    },
    include: { photos: true, settings: true },
  });

  // isVerified = phoneVerified OR emailVerified (face verification removed).
  const isVerified = user.phoneVerified || user.emailVerified;
  if (isVerified !== user.isVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { isVerified } });
    user.isVerified = isVerified;
  }

  const profileComplete = Boolean(user.name || user.firstName);
  const tokens = await issueTokenPair(user.id, user.phoneVerified, user.emailVerified, user.tier, user.plan, user.planExpiresAt);
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

  return issueTokenPair(user.id, user.phoneVerified, user.emailVerified, user.tier, user.plan, user.planExpiresAt, stored.family);
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

const SEED_EMAIL_DOMAIN = '@nearme.dev';

/** Dev-only: issue tokens for a seeded persona without Firebase. */
export async function devLogin(email: string, password: string) {
  if (!env.devLoginEnabled) {
    throw Errors.forbidden('Dev login is disabled. Set DEV_LOGIN_ENABLED=true in backend/.env');
  }
  if (!email.endsWith(SEED_EMAIL_DOMAIN)) {
    throw Errors.badRequest(`Dev login only works for ${SEED_EMAIL_DOMAIN} seed emails`);
  }
  if (password !== env.devSeedPassword) {
    throw Errors.unauthorized('Invalid email or password');
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { photos: true, settings: true },
  });
  if (!user) throw Errors.notFound(`No seed user with email ${email}. Run: npm run db:seed`);

  const profileComplete = Boolean(user.name || user.firstName);
  const tokens = await issueTokenPair(user.id, user.phoneVerified, user.emailVerified, user.tier, user.plan, user.planExpiresAt);
  return { user, tokens, profileComplete, isNewUser: false };
}

function effectivePlan(plan: string, planExpiresAt: Date | null): string {
  if (plan === 'free') return 'free';
  if (!planExpiresAt) return plan;
  return planExpiresAt > new Date() ? plan : 'free';
}

export async function issueTokenPair(
  userId: string,
  phoneVerified: boolean,
  emailVerified: boolean,
  tier: string,
  plan: string,
  planExpiresAt: Date | null,
  existingFamily?: string,
) {
  const effectPlan = effectivePlan(plan, planExpiresAt);
  const accessToken = signAccessToken({
    sub: userId,
    phoneVerified,
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
