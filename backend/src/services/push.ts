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
import {
  decidePush,
  DEFAULT_NOTIFICATION_PREFS,
  REDACTED_BODY,
  type NotificationPrefs,
} from './notificationPrefs';

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

/** Load the recipient's notification preferences, falling back to the schema defaults. */
async function loadPrefs(userId: string): Promise<NotificationPrefs> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: {
      notifyMessages: true,
      notifyPreview: true,
      notifyReactions: true,
      notifyMissedCalls: true,
      notifyGroupMessages: true,
      notifyMemberActivity: true,
      notifyMentionsOnly: true,
    },
  }).catch(() => null);
  return settings ?? DEFAULT_NOTIFICATION_PREFS;
}

/**
 * Typed push: builds the correct title/body/data from a PushPayload, then sends
 * through the same presence-gated / credential-guarded path as sendPush. Never
 * throws — safe to fire-and-forget.
 *
 * This is the single funnel every push in the app goes through, so it is also
 * where the recipient's Settings → Notifications preferences are enforced
 * (see services/notificationPrefs.ts). Mute checks stay at the call sites.
 */
export async function sendTypedPush(userId: string, payload: TypedPushPayload): Promise<void> {
  const decision = decidePush(payload, await loadPrefs(userId));
  if (!decision.send) return;

  const message = buildPushMessage(payload);
  if (decision.hidePreview) message.body = REDACTED_BODY;

  return sendPush(userId, message);
}

export type { TypedPushPayload };

/** True if muterId has muted mutedId (checks Mute table). */
export async function isMuted(muterId: string, mutedId: string): Promise<boolean> {
  const mute = await prisma.mute.findFirst({ where: { muterId, mutedId }, select: { muterId: true } });
  return mute !== null;
}
