import { getMessaging } from 'firebase-admin/messaging';
import { getApp } from './firebase';

export interface SendPushParams {
  fcmToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Typed notification payloads. Each variant carries exactly the fields needed to
 * build the FCM title/body/data — and to let the client navigate on tap.
 */
export type PushPayload =
  | { type: 'new_message';      conversationId: string; senderName: string; preview: string }
  | { type: 'reaction';         conversationId: string; senderName: string; emoji: string }
  | { type: 'missed_call';      conversationId: string; callerName: string; callType: 'audio' | 'video' }
  | { type: 'room_message';     roomId: string; roomName: string; senderName: string; preview: string }
  | { type: 'room_member_join'; roomId: string; roomName: string; memberName: string }
  | { type: 'room_member_left'; roomId: string; roomName: string; memberName: string }
  | { type: 'room_mention';     roomId: string; roomName: string; senderName: string; preview: string };

/** Build the FCM-facing { title, body, data } from a typed PushPayload. */
export function buildPushMessage(payload: PushPayload): { title: string; body: string; data: Record<string, string> } {
  switch (payload.type) {
    case 'new_message':
      return {
        title: payload.senderName,
        body: payload.preview,
        data: { type: payload.type, conversationId: payload.conversationId },
      };
    case 'reaction':
      return {
        title: payload.senderName,
        body: `${payload.emoji} reacted to your message`,
        data: { type: payload.type, conversationId: payload.conversationId },
      };
    case 'missed_call':
      return {
        title: 'Missed call',
        body: `${payload.callerName} called you`,
        data: { type: payload.type, conversationId: payload.conversationId, callType: payload.callType },
      };
    case 'room_message':
      return {
        title: payload.roomName,
        body: `${payload.senderName}: ${payload.preview}`,
        data: { type: payload.type, roomId: payload.roomId },
      };
    case 'room_member_join':
      return {
        title: payload.roomName,
        body: `${payload.memberName} joined the group`,
        data: { type: payload.type, roomId: payload.roomId },
      };
    case 'room_member_left':
      return {
        title: payload.roomName,
        body: `${payload.memberName} left the group`,
        data: { type: payload.type, roomId: payload.roomId },
      };
    case 'room_mention':
      return {
        title: payload.roomName,
        body: `${payload.senderName} mentioned you: ${payload.preview}`,
        data: { type: payload.type, roomId: payload.roomId },
      };
  }
}

/** Send a single FCM push. Reuses the same Firebase app as auth (adapters/firebase.ts). */
export async function sendPushNotification(params: SendPushParams): Promise<void> {
  await getMessaging(getApp()).send({
    token: params.fcmToken,
    notification: { title: params.title, body: params.body },
    data: params.data,
    android: {
      priority: 'high',
      notification: {
        channelId: 'nearme_messages',
        sound: 'default',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
      },
    },
    apns: { payload: { aps: { badge: 1, sound: 'default' } } },
  });
}
