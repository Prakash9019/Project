import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

export type TickStatus = 'sending' | 'sent' | 'delivered' | 'read';

/**
 * WhatsApp-style message status indicator for the sender's own bubbles.
 *  - sending   → clock icon (optimistic, no server id yet)
 *  - sent      → single grey tick (server received / created)
 *  - delivered → double grey tick (recipient's device received it)
 *  - read      → double blue tick (readAt set) — only when the sender has
 *                read receipts (Premium+); otherwise falls back to delivered.
 *
 * In group chats `read` is never used (WhatsApp shows no blue in groups).
 */
export function MessageTick({
  status,
  isPremium,
  mutedColor,
}: {
  status: TickStatus;
  isPremium: boolean;
  /** Overrides the grey tick color when the tick sits on a colored bubble. */
  mutedColor?: string;
}) {
  const { theme } = useTheme();
  const grey = mutedColor ?? theme.textTertiary;
  if (status === 'sending') {
    return <Ionicons name="time-outline" size={13} color={grey} style={{ marginLeft: 3 }} />;
  }
  const showRead = status === 'read' && isPremium;
  const name = status === 'sent' ? 'checkmark' : 'checkmark-done';
  const color = showRead ? theme.info : grey;
  return <Ionicons name={name} size={14} color={color} style={{ marginLeft: 3 }} />;
}
