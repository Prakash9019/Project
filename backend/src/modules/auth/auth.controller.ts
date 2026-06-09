import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { Errors } from '../../utils/httpError';
import { serializeSelf } from '../profile/profile.serializer';
import * as authService from './auth.service';

// E.164 phone format
const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be E.164, e.g. +14155550123');

export const requestOtpSchema = z.object({ phone: phoneSchema });
export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export async function requestOtp(req: Request, res: Response): Promise<void> {
  const { phone } = req.body as z.infer<typeof requestOtpSchema>;
  const { devCode } = await authService.requestOtp(phone);
  res.status(200).json({
    message: 'OTP sent',
    expiresInSeconds: env.otp.ttlSeconds,
    ...(env.otp.devReturn ? { devCode } : {}),
  });
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const { phone, code } = req.body as z.infer<typeof verifyOtpSchema>;
  const { user, tokens, profileComplete } = await authService.verifyOtpAndIssueTokens(phone, code);
  res.status(200).json({ ...tokens, profileComplete, user: serializeSelf(user) });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const tokens = await authService.refreshTokens(refreshToken);
  res.status(200).json(tokens);
}

export async function logout(_req: Request, res: Response): Promise<void> {
  // Stateless JWT: client discards tokens. Refresh-token revocation lists can be added later.
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { photos: { orderBy: { order: 'asc' } }, settings: true },
  });
  if (!user) throw Errors.notFound('User not found');
  res.status(200).json(serializeSelf(user));
}
