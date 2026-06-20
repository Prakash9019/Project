import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { env } from '../../config/env';
import { aiVerification } from '../../adapters/aiVerification';
import { moderateImage } from '../../services/imageModeration';
import { sendEmail } from '../../services/email';
import { signUrl } from '../../utils/signUrl';
import { Errors } from '../../utils/httpError';

// ── Schemas ───────────────────────────────────────────────

export const submitSchema = z.object({
  mediaUrl: z.string().min(1),
});

export const identitySchema = z.object({
  provider: z.enum(['digilocker', 'stripe_identity']),
});

export const collegeSchema = z.object({
  eduEmail: z.string().email(),
});

export const collegeConfirmSchema = z.object({
  otp: z.string().length(6),
});

// ── Helpers ───────────────────────────────────────────────

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Verification status ───────────────────────────────────

export async function getVerificationStatus(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const [user, verifications] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { phoneVerified: true, emailVerified: true, photoVerified: true, faceVerified: true, isVerified: true, isCollegeVerified: true },
    }),
    prisma.verification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);
  if (!user) throw Errors.notFound();

  const computedIsVerified = (user.phoneVerified || user.emailVerified) && user.faceVerified;
  if (computedIsVerified !== user.isVerified) {
    await prisma.user.update({ where: { id: userId }, data: { isVerified: computedIsVerified } });
  }

  res.status(200).json({
    phoneVerified: user.phoneVerified,
    photoVerified: user.photoVerified,
    faceVerified: user.faceVerified,
    isVerified: computedIsVerified,
    isCollegeVerified: user.isCollegeVerified,
    history: verifications.map((v) => ({ id: v.id, type: v.type, status: v.status, createdAt: v.createdAt })),
  });
}

// ── Photo verification ────────────────────────────────────

export async function submitPhotoVerification(req: Request, res: Response): Promise<void> {
  const { mediaUrl } = req.body as z.infer<typeof submitSchema>;
  const userId = req.user!.sub;

  const modResult = await moderateImage(mediaUrl);
  if (modResult === 'reject') throw Errors.badRequest('Selfie rejected: inappropriate content detected');

  const profilePhotos = await prisma.photo.findMany({
    where: { userId, isPublished: true, isPrivate: false },
    select: { url: true },
    orderBy: { order: 'asc' },
  });
  const result = await aiVerification.verifyPhoto(mediaUrl, profilePhotos.map((p) => p.url));

  const verification = await prisma.verification.create({
    data: {
      userId,
      type: 'photo',
      status: result.approved ? 'approved' : 'rejected',
      mediaUrl,
      score: result.score,
      reason: result.reason,
      reviewedAt: new Date(),
    },
  });

  if (result.approved) {
    await prisma.user.update({ where: { id: userId }, data: { photoVerified: true } });
  }

  res.status(201).json({ id: verification.id, status: verification.status, score: result.score });
}

// ── Face verification ─────────────────────────────────────

export async function submitFaceVerification(req: Request, res: Response): Promise<void> {
  const { mediaUrl } = req.body as z.infer<typeof submitSchema>;
  const userId = req.user!.sub;

  const modResult = await moderateImage(mediaUrl);
  if (modResult === 'reject') throw Errors.badRequest('Video selfie rejected: inappropriate content detected');

  const profilePhotos = await prisma.photo.findMany({
    where: { userId, isPublished: true, isPrivate: false },
    select: { url: true },
    orderBy: { order: 'asc' },
  });
  const result = await aiVerification.verifyFace(mediaUrl, profilePhotos.map((p) => p.url));

  const verification = await prisma.verification.create({
    data: {
      userId,
      type: 'face',
      status: result.approved ? 'approved' : 'rejected',
      mediaUrl,
      score: result.score,
      reason: result.reason,
      reviewedAt: new Date(),
    },
  });

  if (result.approved) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phoneVerified: true, emailVerified: true } });
    const isVerified = !!((user?.phoneVerified || user?.emailVerified) && result.approved);
    await prisma.user.update({ where: { id: userId }, data: { faceVerified: true, isVerified } });

    if (isVerified) {
      // Emit socket event — verification.complete
      const { emitToUser } = await import('../../realtime/emitter');
      emitToUser(userId, 'verification.complete', { isVerified: true });
    }
  }

  res.status(201).json({ id: verification.id, status: verification.status, score: result.score });
}

// ── Identity verification ─────────────────────────────────

export async function verifyIdentity(req: Request, res: Response): Promise<void> {
  const { provider } = req.body as z.infer<typeof identitySchema>;

  if (provider === 'digilocker') {
    const { clientId, redirectUri } = env.digilocker;
    if (!clientId) throw Errors.badRequest('DigiLocker not configured');
    const redirectUrl =
      `https://api.digitallocker.gov.in/public/oauth2/1/authorize` +
      `?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${req.user!.sub}`;
    return res.status(200).json({ redirectUrl }) as unknown as void;
  }

  // Stripe Identity
  const stripe = await import('../../adapters/stripe');
  const session = await stripe.createIdentityVerificationSession();
  res.status(200).json({ redirectUrl: session.url });
}

// ── College verification ──────────────────────────────────

const EDU_DOMAIN_REGEX = /\.edu$/i;

export async function verifyCollege(req: Request, res: Response): Promise<void> {
  const { eduEmail } = req.body as z.infer<typeof collegeSchema>;
  const userId = req.user!.sub;

  if (!EDU_DOMAIN_REGEX.test(eduEmail)) {
    throw Errors.badRequest('Email must be from a .edu institution');
  }

  const otp = generateOtp();
  await redis.set(RedisKeys.collegeOtp(userId), JSON.stringify({ otp, email: eduEmail }), 'EX', env.collegeOtpTtlSeconds);

  await sendEmail(
    eduEmail,
    'NearMe — College Verification OTP',
    `Your NearMe college verification code is: ${otp}\n\nThis code expires in ${env.collegeOtpTtlSeconds / 60} minutes.`
  );

  res.status(200).json({ ok: true, message: 'OTP sent to edu email' });
}

export async function confirmCollegeOtp(req: Request, res: Response): Promise<void> {
  const { otp } = req.body as z.infer<typeof collegeConfirmSchema>;
  const userId = req.user!.sub;

  const raw = await redis.get(RedisKeys.collegeOtp(userId));
  if (!raw) throw Errors.badRequest('OTP expired or not found');

  const stored = JSON.parse(raw) as { otp: string; email: string };
  if (stored.otp !== otp) throw Errors.badRequest('Incorrect OTP');

  await redis.del(RedisKeys.collegeOtp(userId));
  await prisma.user.update({ where: { id: userId }, data: { isCollegeVerified: true } });
  res.status(200).json({ ok: true, isCollegeVerified: true });
}

// ── Profile views ─────────────────────────────────────────

export async function listProfileViews(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  if (!req.effectiveLimits?.whoViewedMe) throw Errors.forbidden('Profile views require Gold or Platinum plan');

  // Get recent profile views excluding blocked users
  const views = await prisma.profileView.findMany({
    where: { viewedId: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      viewer: { select: { id: true, firstName: true, name: true, photos: { where: { isPrimary: true }, select: { url: true }, take: 1 } } },
    },
  });

  // Exclude viewers who have since blocked the requesting user
  const blockedByViewers = await prisma.block.findMany({
    where: { blockerId: { in: views.map((v) => v.viewerId) }, blockedId: userId },
    select: { blockerId: true },
  });
  const blockedSet = new Set(blockedByViewers.map((b) => b.blockerId));

  const filtered = views.filter((v) => !blockedSet.has(v.viewerId));

  const serialized = await Promise.all(
    filtered.map(async (v) => ({
      viewerId: v.viewerId,
      viewerName: v.viewer.firstName ?? v.viewer.name ?? null,
      viewerPhoto: await signUrl(v.viewer.photos[0]?.url ?? null),
      viewedAt: v.createdAt,
    }))
  );

  res.status(200).json({ views: serialized });
}

// ── Analytics ─────────────────────────────────────────────

const PERIOD_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

export async function getProfileAnalytics(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  if (!req.effectiveLimits?.whoViewedMe) throw Errors.forbidden('Analytics require Gold or Platinum plan');

  const period = (req.query.period as string) ?? '7d';
  const days = PERIOD_DAYS[period] ?? 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [views, taps, chatOpens, replyConvos, totalConvos] = await Promise.all([
    prisma.profileView.count({ where: { viewedId: userId, createdAt: { gte: since } } }),
    prisma.tap.count({ where: { receiverId: userId, createdAt: { gte: since } } }),
    // Conversations where this user is the recipient and the other user opened chat
    prisma.conversation.count({ where: { userBId: userId, createdAt: { gte: since } } }),
    // Conversations in last 30d where userId sent at least one reply (as recipient)
    prisma.conversation.count({
      where: {
        userBId: userId,
        createdAt: { gte: thirtyDaysAgo },
        messages: { some: { senderId: userId } },
      },
    }),
    prisma.conversation.count({ where: { userBId: userId, createdAt: { gte: thirtyDaysAgo } } }),
  ]);

  const replyRate = totalConvos > 0 ? Math.round((replyConvos / totalConvos) * 100) / 100 : 0;

  res.status(200).json({ views, taps, chatOpens, replyRate, period });
}
