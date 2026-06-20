import type { AppTheme } from '../theme';
import type { Plan } from '../types/api';

/** "non_binary_people" → "Non Binary People". */
export const labelize = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Brand color for a plan badge. Returns null for free (no badge). */
export function planBadgeColor(theme: AppTheme, plan?: Plan | null): string | null {
  switch (plan) {
    case 'premium':
      return theme.planPremium;
    case 'gold':
      return theme.planGold;
    case 'platinum':
      return theme.planPlatinum;
    default:
      return null;
  }
}

export const planLabel = (plan?: Plan | null) =>
  plan && plan !== 'free' ? labelize(plan) : null;

const PLAN_ORDER: Plan[] = ['free', 'premium', 'gold', 'platinum'];
/** Numeric rank for plan gating comparisons (free=0 … platinum=3). */
export const planRank = (plan?: Plan | null): number =>
  Math.max(0, PLAN_ORDER.indexOf(plan ?? 'free'));
/** True if `plan` meets or exceeds the required tier. */
export const planAtLeast = (plan: Plan | null | undefined, required: Plan): boolean =>
  planRank(plan) >= planRank(required);

/** Short relative time from an iso8601 string, e.g. "now", "5m", "2h", "3d". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

/** Clock time for a message bubble, e.g. "14:05". */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type LastMessageLike =
  | string
  | null
  | undefined
  | { content?: string | null; type?: string; isUnsent?: boolean };

/** One-line preview for inbox conversation rows. */
export function formatLastMessagePreview(last: LastMessageLike, fallback = 'Say hello 👋'): string {
  if (!last) return fallback;
  if (typeof last === 'string') return last;
  if (last.isUnsent) return 'Message unsent';
  if (last.content) return last.content;
  switch (last.type) {
    case 'photo':
      return '📷 Photo';
    case 'video':
      return '🎬 Video';
    case 'voice':
    case 'voice_note':
      return '🎤 Voice message';
    case 'expiring_photo':
      return '📷 Expiring photo';
    default:
      return 'New message';
  }
}
