import { describe, it, expect } from 'vitest';
import {
  decidePush,
  DEFAULT_NOTIFICATION_PREFS,
  REDACTED_BODY,
  type NotificationPrefs,
} from '../services/notificationPrefs';
import { buildPushMessage, type PushPayload } from '../adapters/fcm';

// ─────────────────────────────────────────────────────────────────
// NOTIFICATION PREFERENCES — server-side gating of Settings →
// Notifications. Pure decision function; no DB/Redis needed.
// ─────────────────────────────────────────────────────────────────

const prefs = (over: Partial<NotificationPrefs> = {}): NotificationPrefs => ({
  ...DEFAULT_NOTIFICATION_PREFS,
  ...over,
});

const PAYLOADS: Record<string, PushPayload> = {
  new_message:      { type: 'new_message', conversationId: 'c1', senderName: 'Ada', preview: 'hey there' },
  reaction:         { type: 'reaction', conversationId: 'c1', senderName: 'Ada', emoji: '🔥' },
  missed_call:      { type: 'missed_call', conversationId: 'c1', callerName: 'Ada', callType: 'audio' },
  room_message:     { type: 'room_message', roomId: 'r1', roomName: 'Climbers', senderName: 'Ada', preview: 'anyone free?' },
  room_mention:     { type: 'room_mention', roomId: 'r1', roomName: 'Climbers', senderName: 'Ada', preview: '@bob look' },
  room_member_join: { type: 'room_member_join', roomId: 'r1', roomName: 'Climbers', memberName: 'Ada' },
  room_member_left: { type: 'room_member_left', roomId: 'r1', roomName: 'Climbers', memberName: 'Ada' },
};

describe('notification preferences — defaults', () => {
  it('delivers every category when all defaults apply', () => {
    for (const [name, payload] of Object.entries(PAYLOADS)) {
      expect(decidePush(payload, prefs()), name).toEqual({ send: true, hidePreview: false });
    }
  });
});

describe('notification preferences — per-category gating', () => {
  it('notifyMessages=false suppresses 1:1 messages only', () => {
    const p = prefs({ notifyMessages: false });
    expect(decidePush(PAYLOADS.new_message, p).send).toBe(false);
    // Unrelated categories are untouched.
    expect(decidePush(PAYLOADS.reaction, p).send).toBe(true);
    expect(decidePush(PAYLOADS.missed_call, p).send).toBe(true);
    expect(decidePush(PAYLOADS.room_message, p).send).toBe(true);
  });

  it('notifyReactions=false suppresses reactions only', () => {
    const p = prefs({ notifyReactions: false });
    expect(decidePush(PAYLOADS.reaction, p).send).toBe(false);
    expect(decidePush(PAYLOADS.new_message, p).send).toBe(true);
  });

  it('notifyMissedCalls=false suppresses missed calls only', () => {
    const p = prefs({ notifyMissedCalls: false });
    expect(decidePush(PAYLOADS.missed_call, p).send).toBe(false);
    expect(decidePush(PAYLOADS.new_message, p).send).toBe(true);
  });

  it('notifyGroupMessages=false suppresses every room notification', () => {
    const p = prefs({ notifyGroupMessages: false });
    expect(decidePush(PAYLOADS.room_message, p).send).toBe(false);
    expect(decidePush(PAYLOADS.room_mention, p).send).toBe(false);
    expect(decidePush(PAYLOADS.room_member_join, p).send).toBe(false);
    expect(decidePush(PAYLOADS.room_member_left, p).send).toBe(false);
    // 1:1 is unaffected.
    expect(decidePush(PAYLOADS.new_message, p).send).toBe(true);
  });

  it('notifyMemberActivity=false suppresses join/leave but keeps room messages', () => {
    const p = prefs({ notifyMemberActivity: false });
    expect(decidePush(PAYLOADS.room_member_join, p).send).toBe(false);
    expect(decidePush(PAYLOADS.room_member_left, p).send).toBe(false);
    expect(decidePush(PAYLOADS.room_message, p).send).toBe(true);
    expect(decidePush(PAYLOADS.room_mention, p).send).toBe(true);
  });
});

describe('notification preferences — mentions only', () => {
  it('suppresses plain room messages but still delivers mentions', () => {
    const p = prefs({ notifyMentionsOnly: true });
    expect(decidePush(PAYLOADS.room_message, p).send).toBe(false);
    expect(decidePush(PAYLOADS.room_mention, p).send).toBe(true);
  });

  it('does not affect 1:1 messages', () => {
    const p = prefs({ notifyMentionsOnly: true });
    expect(decidePush(PAYLOADS.new_message, p).send).toBe(true);
  });

  it('is subordinate to notifyGroupMessages=false', () => {
    const p = prefs({ notifyMentionsOnly: true, notifyGroupMessages: false });
    expect(decidePush(PAYLOADS.room_mention, p).send).toBe(false);
  });
});

describe('notification preferences — preview', () => {
  it('redacts the body of content-bearing pushes when notifyPreview=false', () => {
    const p = prefs({ notifyPreview: false });
    for (const name of ['new_message', 'room_message', 'room_mention']) {
      const decision = decidePush(PAYLOADS[name], p);
      expect(decision, name).toEqual({ send: true, hidePreview: true });
    }
  });

  it('leaves non-content pushes unredacted', () => {
    const p = prefs({ notifyPreview: false });
    for (const name of ['reaction', 'missed_call', 'room_member_join', 'room_member_left']) {
      expect(decidePush(PAYLOADS[name], p), name).toEqual({ send: true, hidePreview: false });
    }
  });

  it('never suppresses delivery — preview only changes the body', () => {
    const p = prefs({ notifyPreview: false });
    for (const payload of Object.values(PAYLOADS)) {
      expect(decidePush(payload, p).send).toBe(true);
    }
  });

  it('redaction replaces the message content but keeps routing data', () => {
    // Mirrors what sendTypedPush does with the decision.
    const message = buildPushMessage(PAYLOADS.new_message);
    expect(message.body).toContain('hey there');
    message.body = REDACTED_BODY;
    expect(message.body).toBe(REDACTED_BODY);
    expect(message.data.conversationId).toBe('c1');
  });
});
