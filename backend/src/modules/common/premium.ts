import { Request, Response, NextFunction } from 'express';

/**
 * Registry of premium-gated features. Per the product decision, these are EXPOSED but NOT yet
 * ENFORCED — every feature works in development regardless of tier. The middleware annotates the
 * request and (in future) is where tier enforcement will live.
 *
 * TODO (enforcement): when ready, check req.user.tier against the feature's required tier and
 * throw Errors.paymentRequired() for free users. See modules/monetization/tiers.ts.
 */
export const PREMIUM_FEATURES = {
  unsend: 'Unsend message',
  read_receipts: 'Read receipts',
  typing_status: 'Typing status',
  chat_translate: 'Chat translate',
  saved_phrases: 'Saved chat phrases',
  incognito: 'Incognito mode',
  explore: 'Explore (worldwide search)',
  boost: 'Boost (grid priority)',
  viewed_me: 'Viewed me',
  for_you: 'For You curated profiles',
} as const;

export type PremiumFeature = keyof typeof PREMIUM_FEATURES;

/** Passthrough middleware that tags the request with the premium feature being used. */
export function premiumFeature(feature: PremiumFeature) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).premiumFeature = feature;
    // NOTE: enforcement intentionally disabled (expose-don't-enforce). Add tier check here later.
    next();
  };
}
