import { env } from '../../config/env';

export type Tier = 'free' | 'basic' | 'advanced' | 'vip';

export interface TierConfig {
  /** outgoing intro requests allowed per rolling 24h; null = unlimited */
  dailyRequestCap: number | null;
  /** can use the "verified only" filter is open to all; these are upsells */
  feedBoostDiscount: number; // 0..1 fraction off a la carte boost price
}

export const TIERS: Record<Tier, TierConfig> = {
  free: { dailyRequestCap: env.freeTierDailyRequests, feedBoostDiscount: 0 },
  basic: { dailyRequestCap: 25, feedBoostDiscount: 0.1 },
  advanced: { dailyRequestCap: 100, feedBoostDiscount: 0.25 },
  vip: { dailyRequestCap: null, feedBoostDiscount: 0.5 },
};

export function tierConfig(tier: string): TierConfig {
  return TIERS[(tier as Tier)] ?? TIERS.free;
}
