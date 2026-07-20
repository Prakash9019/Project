/**
 * FCM push notification service. Sends only when the recipient has no live
 * socket connection (RedisKeys.presence) — an in-app toast covers the
 * foreground case. Silently no-ops if the user has no fcmToken or Firebase
 * credentials (FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY) aren't set.
 */
import { prisma } from '../config/prisma';
import { redis, RedisKeys } from '../config/redis';
import { withTimeout } from '../utils/withTimeout';
import { sendPushNotification, buildPushMessage, type PushPayload as TypedPushPayload } from '../adapters/fcm';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

async function sendPushRaw(userId: string, payload: PushPayload): Promise<void> {
  const online = await redis.get(RedisKeys.presence(userId)).catch(() => null);
  if (online) return; // foreground toast already covers this

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
  if (!user?.fcmToken) return;
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[push] Firebase credentials missing — skip → ${userId}: ${payload.title}`);
    }
    return;
  }

  try {
    await sendPushNotification({ fcmToken: user.fcmToken, title: payload.title, body: payload.body, data: payload.data });
  } catch (err) {
    console.warn(JSON.stringify({ event: 'push_notification_send_failed', userId, error: (err as Error).message }));
  }
}

export async function sendPush(userId: string, payload: PushPayload): Promise<void> {
  const result = await withTimeout(sendPushRaw(userId, payload), 5000, null);
  if (result === null) {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({ event: 'push_notification_timeout', userId, title: payload.title }));
  }
}

/**
 * Typed push: builds the correct title/body/data from a PushPayload, then sends
 * through the same presence-gated / credential-guarded path as sendPush. Never
 * throws — safe to fire-and-forget.
 */
export async function sendTypedPush(userId: string, payload: TypedPushPayload): Promise<void> {
  return sendPush(userId, buildPushMessage(payload));
}

export type { TypedPushPayload };

/** True if muterId has muted mutedId (checks Mute table). */
export async function isMuted(muterId: string, mutedId: string): Promise<boolean> {
  const mute = await prisma.mute.findFirst({ where: { muterId, mutedId }, select: { muterId: true } });
  return mute !== null;
}
