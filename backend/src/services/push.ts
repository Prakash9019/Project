/**
 * FCM push notification service.
 * Production: add firebase-admin, store device tokens in a user_device_tokens table.
 * Current: stub that logs only — wire real FCM by replacing the sendToDevice call.
 */
import { prisma } from '../config/prisma';
import { withTimeout } from '../utils/withTimeout';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

async function sendPushRaw(userId: string, payload: PushPayload): Promise<void> {
  // TODO (production): look up FCM token from user_device_tokens WHERE userId=userId
  // and call firebase-admin messaging.sendToDevice(token, { notification: payload }).
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[push] → ${userId}: ${payload.title} — ${payload.body}`);
  }
}

export async function sendPush(userId: string, payload: PushPayload): Promise<void> {
  const result = await withTimeout(sendPushRaw(userId, payload), 5000, null);
  if (result === null) {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({ event: 'push_notification_timeout', userId, title: payload.title }));
  }
}

/** True if muterId has muted mutedId (checks Mute table). */
export async function isMuted(muterId: string, mutedId: string): Promise<boolean> {
  const mute = await prisma.mute.findFirst({ where: { muterId, mutedId }, select: { muterId: true } });
  return mute !== null;
}
