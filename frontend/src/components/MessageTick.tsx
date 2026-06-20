import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

export type TickStatus = 'sent' | 'delivered' | 'read';

/**
 * Message delivery indicator for the sender's own bubbles.
 *  - sent      → single grey tick (created, not yet acked)
 *  - delivered → double grey tick (reached server)
 *  - read      → double blue tick (readAt set) — only when the sender has
 *                read receipts (Premium+); otherwise falls back to delivered.
 */
export function MessageTick({ status, isPremium }: { status: TickStatus; isPremium: boolean }) {
  const { theme } = useTheme();
  const showRead = status === 'read' && isPremium;
  const name = status === 'sent' ? 'checkmark' : 'checkmark-done';
  const color = showRead ? theme.info : theme.textTertiary;
  return <Ionicons name={name} size={14} color={color} style={{ marginLeft: 3 }} />;
}
