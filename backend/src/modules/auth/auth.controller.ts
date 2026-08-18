import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { redis, RedisKeys } from '../../config/redis';
import { Errors } from '../../utils/httpError';
import { serializeSelf, signUserPhotos } from '../profile/profile.serializer';
import { getCallLimits } from '../../utils/callLimits';
import { computeEffectiveLimits } from '../../middleware/subscription';
import * as authService from './auth.service';
import { logEvent } from '../../middleware/logger';

export const firebaseLoginSchema = z.object({ idToken: z.string().min(10) });
export const devLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(10) });
export const logoutSchema = z.object({ refreshToken: z.string().min(10) });

/** Increment a Redis counter and set TTL on first write. Returns new count. */
async function incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ttlSeconds);
  return count;
}

function clientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown'
  );
}

export async function firebaseLogin(req: Request, res: Response): Promise<void> {
  const { idToken } = req.body as z.infer<typeof firebaseLoginSchema>;

  const ip = clientIp(req);
  const count = await incrWithTtl(RedisKeys.firebaseLoginRate(ip), 60);
  if (count > 10) {
    res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Try again later.' });
    return;
  }

  const { user, tokens, profileComplete, isNewUser } = await authService.loginWithFirebase(idToken);
  logEvent({ event: 'firebase_login_success', userId: user.id, plan: user.plan });
  res.status(200).json({ ...tokens, profileComplete, isNewUser, user: serializeSelf(await signUserPhotos(user)) });
}

export async function devLogin(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as z.infer<typeof devLoginSchema>;
  const { user, tokens, profileComplete, isNewUser } = await authService.devLogin(email, password);
  logEvent({ event: 'dev_login_success', userId: user.id, plan: user.plan });
  res.status(200).json({ ...tokens, profileComplete, isNewUser, user: serializeSelf(await signUserPhotos(user)) });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const ip = clientIp(req);
  const count = await incrWithTtl(RedisKeys.refreshRate(ip), 60);
  if (count > 10) {
    res.status(429).json({ error: 'rate_limited', message: 'Too many token refresh requests.' });
    return;
  }

  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const tokens = await authService.refreshTokens(refreshToken);
  try {
    const payload = JSON.parse(Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString());
    logEvent({ event: 'token_refreshed', userId: payload.sub as string });
  } catch { /* skip */ }
  res.status(200).json(tokens);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as z.infer<typeof logoutSchema>;
  if (refreshToken) await authService.logoutSession(refreshToken);
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    include: { photos: { orderBy: { order: 'asc' } }, settings: true },
  });
  if (!user) throw Errors.notFound('User not found');
  // callLimits: free-tier live call countdown (null for paid plans).
  const callLimits = await getCallLimits(user.id, user.plan);
  const effectiveLimits = computeEffectiveLimits(
    user.plan,
    user.planExpiresAt ? Math.floor(user.planExpiresAt.getTime() / 1000) : null,
  );
  // travelModeActive: whether the user has an activated city profile right now.
  // The client uses this to suppress routine GPS location pushes — otherwise
  // the periodic/on-focus real-location sync in updateLocation() immediately
  // auto-deactivates travel mode (see profile.controller.ts "returning home"
  // logic), undoing an activation within seconds of the user tapping Activate.
  const activeCityProfile = await prisma.cityProfile.findFirst({
    where: { userId: user.id, isActive: true },
    select: { id: true },
  });
  res.status(200).json({
    ...serializeSelf(await signUserPhotos(user)),
    callLimits,
    effectiveLimits,
    travelModeActive: Boolean(activeCityProfile),
  });
}
