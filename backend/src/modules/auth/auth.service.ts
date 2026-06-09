import { prisma } from '../../config/prisma';
import { issueOtp, verifyOtp } from '../../utils/otp';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { Errors } from '../../utils/httpError';
import { sms } from '../../adapters/sms';

export async function requestOtp(phone: string): Promise<{ devCode?: string }> {
  const code = await issueOtp(phone);
  await sms.sendOtp(phone, code);
  return { devCode: code };
}

export async function verifyOtpAndIssueTokens(phone: string, code: string) {
  await verifyOtp(phone, code);

  // Upsert the user on first successful verification (passwordless onboarding).
  const user = await prisma.user.upsert({
    where: { phone },
    update: { phoneVerified: true, lastActiveAt: new Date() },
    create: {
      phone,
      phoneVerified: true,
      settings: { create: {} },
      wallet: { create: {} },
    },
    include: { photos: true, settings: true },
  });

  const isNew = !user.name; // profile not yet completed
  return { user, tokens: issueTokenPair(user.id, user.phoneVerified, user.tier), profileComplete: !isNew };
}

export async function refreshTokens(refreshToken: string) {
  let claims;
  try {
    claims = verifyRefreshToken(refreshToken);
  } catch {
    throw Errors.unauthorized('Invalid refresh token');
  }
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) throw Errors.unauthorized('User no longer exists');
  return issueTokenPair(user.id, user.phoneVerified, user.tier);
}

function issueTokenPair(userId: string, phoneVerified: boolean, tier: string) {
  return {
    accessToken: signAccessToken({ sub: userId, phoneVerified, tier }),
    refreshToken: signRefreshToken(userId),
  };
}
