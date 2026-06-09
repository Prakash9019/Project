import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { aiVerification } from '../../adapters/aiVerification';
import { Errors } from '../../utils/httpError';

export const submitSchema = z.object({
  mediaUrl: z.string().url(),
});

async function getProfilePhotoUrls(userId: string): Promise<string[]> {
  const photos = await prisma.photo.findMany({ where: { userId, isPrivate: false }, select: { url: true } });
  return photos.map((p) => p.url);
}

export async function submitPhotoVerification(req: Request, res: Response): Promise<void> {
  const { mediaUrl } = req.body as z.infer<typeof submitSchema>;
  const userId = req.user!.sub;
  const profileUrls = await getProfilePhotoUrls(userId);
  if (profileUrls.length === 0) throw Errors.badRequest('Add at least one profile photo before verifying');

  const result = await aiVerification.verifyPhoto(mediaUrl, profileUrls);

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

export async function submitFaceVerification(req: Request, res: Response): Promise<void> {
  const { mediaUrl } = req.body as z.infer<typeof submitSchema>;
  const userId = req.user!.sub;
  const profileUrls = await getProfilePhotoUrls(userId);
  if (profileUrls.length === 0) throw Errors.badRequest('Add at least one profile photo before verifying');

  const result = await aiVerification.verifyFace(mediaUrl, profileUrls);

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
    await prisma.user.update({ where: { id: userId }, data: { faceVerified: true } });
  }

  res.status(201).json({ id: verification.id, status: verification.status, score: result.score });
}

export async function getVerificationStatus(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const [user, verifications] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { photoVerified: true, faceVerified: true, isVerified: true } }),
    prisma.verification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);
  if (!user) throw Errors.notFound();
  res.status(200).json({
    photoVerified: user.photoVerified,
    faceVerified: user.faceVerified,
    isVerified: user.isVerified,
    history: verifications.map((v) => ({ id: v.id, type: v.type, status: v.status, createdAt: v.createdAt })),
  });
}
