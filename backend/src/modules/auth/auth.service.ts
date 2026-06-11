import { randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { issueOtp, verifyOtp } from '../../utils/otp';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../../utils/jwt';
import { Errors } from '../../utils/httpError';
import { sms } from '../../adapters/sms';
// TODO: encrypt phone before storing — use encrypt(phone) when migrating existing data
import { encrypt } from '../../utils/encrypt'; // eslint-disable-line @typescript-eslint/no-unused-vars

export async function requestOtp(phone: string): Promise<{ devCode?: string }> {
  const code = await issueOtp(phone);
  await sms.sendOtp(phone, code);
  return { devCode: code };
}

export async function verifyOtpAndIssueTokens(phone: string, code: string) {
  await verifyOtp(phone, code);

  const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  const isNewUser = !existing;

  const user = await prisma.user.upsert({
    where: { phone },
    update: { phoneVerified: true, lastActiveAt: new Date() },
    create: {
      // TODO: encrypt phone before storing — use encrypt(phone) when migrating existing data
      phone,
      phoneVerified: true,
      settings: { create: {} },
      wallet: { create: {} },
    },
    include: { photos: true, settings: true },
  });

  const profileComplete = Boolean(user.name || user.firstName);
  const tokens = await issueTokenPair(user.id, user.phoneVerified, user.tier, user.plan, user.planExpiresAt);
  return { user, tokens, profileComplete, isNewUser };
}

export async function refreshTokens(refreshToken: string) {
  // 1. Verify JWT signature/expiry
  let claims;
  try {
    claims = verifyRefreshToken(refreshToken);
  } catch {
    throw Errors.unauthorized('Invalid refresh token');
  }

  // 2. Look up RefreshToken by hash
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  // 3. Not found → 401
  if (!stored) {
    throw Errors.unauthorized('Invalid refresh token');
  }

  // 4. Already used → token reuse detected → revoke entire family
  if (stored.usedAt !== null) {
    await prisma.refreshToken.deleteMany({ where: { family: stored.family } });
    throw Errors.unauthorized('Token reuse detected — all sessions invalidated');
  }

  // 5. Mark old token as used
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } });

  // 6. Fetch user and issue new token pair in same family
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) throw Errors.unauthorized('User no longer exists');

  return issueTokenPair(user.id, user.phoneVerified, user.tier, user.plan, user.planExpiresAt, stored.family);
}

export async function logoutSession(refreshToken: string): Promise<void> {
  let tokenHash: string;
  try {
    tokenHash = hashToken(refreshToken);
  } catch {
    return; // silently ignore malformed tokens on logout
  }
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, select: { family: true } });
  if (stored) {
    await prisma.refreshToken.deleteMany({ where: { family: stored.family } });
  }
}

/** Call on account delete or ban — invalidates ALL sessions for a user. */
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
  phoneVerified: boolean,
  tier: string,
  plan: string,
  planExpiresAt: Date | null,
  existingFamily?: string,
) {
  const effectPlan = effectivePlan(plan, planExpiresAt);
  const accessToken = signAccessToken({
    sub: userId,
    phoneVerified,
    tier,
    plan: effectPlan,
    planExpiresAt:
      effectPlan !== 'free' && planExpiresAt ? Math.floor(planExpiresAt.getTime() / 1000) : null,
  });
  const refreshToken = signRefreshToken(userId);
  const family = existingFamily ?? randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

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
