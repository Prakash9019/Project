// Pure decision logic for chat auto-scroll. Kept free of React/Native so the
// rules can be reasoned about and tested in isolation (see the runnable check
// in scratchpad / any node runner).
//
// NOTE: since the 1:1 chat list was inverted (FlashList, newest at offset 0),
// "at the bottom" is simply `contentOffset.y < 200` and the screen no longer
// needs `distanceFromBottom` / `isNearBottom`. `classifyMessagesChange` and
// `shouldAutoScrollOnAppend` are still wired up there; the offset helpers below
// are retained for any non-inverted list that needs the same rule.

/** How close (px) to the bottom still counts as "at the bottom". */
export const NEAR_BOTTOM_THRESHOLD_PX = 120;

/** Distance in px from the very bottom of the scroll content. */
export function distanceFromBottom(
  contentOffsetY: number,
  contentHeight: number,
  layoutHeight: number,
): number {
  return contentHeight - (contentOffsetY + layoutHeight);
}

export function isNearBottom(
  contentOffsetY: number,
  contentHeight: number,
  layoutHeight: number,
  threshold: number = NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  return distanceFromBottom(contentOffsetY, contentHeight, layoutHeight) <= threshold;
}

export type MessagesChange = 'initial' | 'appended' | 'prepended' | 'none';

/**
 * Classify what happened to the message list between two renders, purely from
 * the length and the id of the last (newest) message.
 *
 * - `initial`   — first time we have messages (nothing to compare against).
 * - `appended`  — a newer message arrived at the bottom (last id changed, longer).
 * - `prepended` — an older page was loaded at the top (longer, but last id same).
 * - `none`      — edit / reaction / unsend / highlight etc. (length unchanged, or
 *                 a delete). These must NOT trigger an auto-scroll.
 */
export function classifyMessagesChange(
  prevLastId: string | null,
  prevLength: number,
  nextLastId: string | null,
  nextLength: number,
): MessagesChange {
  if (nextLength === 0) return 'none';
  if (prevLastId === null || prevLength === 0) return 'initial';
  if (nextLength > prevLength && nextLastId !== prevLastId) return 'appended';
  if (nextLength > prevLength && nextLastId === prevLastId) return 'prepended';
  return 'none';
}

/**
 * The ONLY conditions under which the chat may auto-scroll to the bottom when a
 * new message is appended:
 *   - the message is mine (I just sent it), or
 *   - I was already parked at the bottom when it arrived.
 * A layout change (highlight border, reaction pill, image load, pin banner) is
 * never an append, so it can never reach here.
 */
export function shouldAutoScrollOnAppend(isOwnMessage: boolean, nearBottom: boolean): boolean {
  return isOwnMessage || nearBottom;
}
