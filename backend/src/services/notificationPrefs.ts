/**
 * Server-side enforcement of the Settings → Notifications toggles.
 *
 * Every push in the app funnels through `sendTypedPush`, so gating here covers
 * 1:1 messages, reactions, missed calls, group messages, mentions and group
 * member activity in one place. Mute (the `Mute` table for 1:1 and
 * `RoomMember.isMuted` for rooms) is a separate, earlier check at the call
 * sites — this layer only adds the per-category preferences on top.
 */
import type { PushPayload } from '../adapters/fcm';

export interface NotificationPrefs {
  notifyMessages: boolean;
  notifyPreview: boolean;
  notifyReactions: boolean;
  notifyMissedCalls: boolean;
  notifyGroupMessages: boolean;
  notifyMemberActivity: boolean;
  notifyMentionsOnly: boolean;
}

/** Matches the Prisma defaults on UserSettings — used when a user has no row yet. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  notifyMessages: true,
  notifyPreview: true,
  notifyReactions: true,
  notifyMissedCalls: true,
  notifyGroupMessages: true,
  notifyMemberActivity: true,
  notifyMentionsOnly: false,
};

export type PushDecision =
  | { send: false }
  | { send: true; hidePreview: boolean };

/** Body substituted for message content when "Show preview" is off. */
export const REDACTED_BODY = 'New message';

/** True for payloads whose body carries user-authored content. */
function carriesContent(payload: PushPayload): boolean {
  return payload.type === 'new_message'
    || payload.type === 'room_message'
    || payload.type === 'room_mention';
}

/**
 * Decide whether `payload` may be delivered to a recipient with `prefs`, and
 * whether its body must be redacted.
 *
 * Group rules mirror the settings screen, where "Member joined / left" and
 * "Mentions only" are sub-toggles of "Group message notifications":
 *   - mentionsOnly on  → plain room messages are suppressed, mentions still land
 *   - groupMessages off → nothing from rooms is delivered at all
 */
export function decidePush(payload: PushPayload, prefs: NotificationPrefs): PushDecision {
  const allow = (): PushDecision => ({
    send: true,
    hidePreview: carriesContent(payload) && !prefs.notifyPreview,
  });

  switch (payload.type) {
    case 'new_message':
      return prefs.notifyMessages ? allow() : { send: false };

    case 'reaction':
      return prefs.notifyReactions ? allow() : { send: false };

    case 'missed_call':
      return prefs.notifyMissedCalls ? allow() : { send: false };

    case 'room_message':
      if (!prefs.notifyGroupMessages) return { send: false };
      // "Mentions only" silences everything except messages that name you.
      if (prefs.notifyMentionsOnly) return { send: false };
      return allow();

    case 'room_mention':
      return prefs.notifyGroupMessages ? allow() : { send: false };

    case 'room_member_join':
    case 'room_member_left':
      if (!prefs.notifyGroupMessages) return { send: false };
      return prefs.notifyMemberActivity ? allow() : { send: false };
  }
}
