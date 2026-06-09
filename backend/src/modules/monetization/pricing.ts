/**
 * Localized geographic pricing matrix (from the product blueprint).
 * Region is resolved client-side / via billing geo and passed through to the payment provider;
 * the backend exposes the catalog so the client can render the right prices.
 */
export const PRICING = {
  regions: ['emerging', 'gcc', 'western'] as const,
  feedBoost: {
    label: 'Hyperlocal Feed Boost (30 min)',
    emerging: { currency: 'INR', min: 49, max: 199 },
    gcc: { currency: 'USD', min: 4.99, max: 9.99 },
    western: { currency: 'USD', min: 6.99, max: 14.99 },
  },
  introCredits: {
    label: 'A la Carte Intro Credits',
    emerging: { currency: 'INR', price: 99 },
    gcc: { currency: 'USD', price: 5.99 },
    western: { currency: 'USD', price: 9.99 },
  },
  subscriptions: {
    basic: {
      label: 'Basic Premium',
      emerging: { currency: 'INR', price: 249, period: 'month' },
      gcc: { currency: 'USD', price: 9.99, period: 'month' },
      western: { currency: 'USD', price: 14.99, period: 'month' },
    },
    advanced: {
      label: 'Advanced Premium',
      emerging: { currency: 'INR', price: 499, period: 'month' },
      gcc: { currency: 'USD', price: 19.99, period: 'month' },
      western: { currency: 'USD', price: 29.99, period: 'month' },
    },
    vip: {
      label: 'VIP Elite Tier',
      emerging: { currency: 'INR', price: 999, period: 'month' },
      gcc: { currency: 'USD', price: 49.99, period: 'month' },
      western: { currency: 'USD', price: 59.99, period: 'month' },
    },
  },
};
