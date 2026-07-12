/** Static v3 pricing catalog — no DB query needed. */

export const PLAN_PRICES = {
  premium:  { monthly: 399,  three_month: 999,  six_month: 1799, annual: 2999  },
  gold:     { monthly: 799,  three_month: 1999, six_month: 3499, annual: 5999  },
  platinum: { monthly: 1499, three_month: 3799, six_month: 6799, annual: 11499 },
} as const;

export const PERIOD_DAYS: Record<string, number> = {
  monthly: 30,
  three_month: 90,
  six_month: 180,
  annual: 365,
};

export const ADDON_PRICES: Record<string, number> = {
  boost_local:      49,
  boost_extended:   99,
  boost_city_wide:  199,
  mega_boost:       499,
  spotlight:        199,
  chat_pack_s:      79,
  chat_pack_m:      149,
  chat_pack_l:      249,
  travel_pass:      99,
  travel_pass_week: 299,
  verified_badge:   199,
  audio_call_topup: 49,
  video_call_topup: 79,
};

const ADDON_CATALOG = [
  { id: 'boost_local',      name: 'Local Boost (30 min)',         priceInr: 49,  description: 'Pin your card to the top of nearby grids for 30 minutes.' },
  { id: 'boost_extended',   name: 'Extended Boost (30 min)',      priceInr: 99,  description: 'Wider-radius boost for 30 minutes.' },
  { id: 'boost_city_wide',  name: 'City-Wide Boost (30 min)',     priceInr: 199, description: 'Boost across the entire city grid for 30 minutes.' },
  { id: 'mega_boost',       name: 'Mega Boost (60 min)',          priceInr: 499, description: 'Maximum-reach boost for 60 minutes.' },
  { id: 'spotlight',        name: 'Spotlight (24 hr)',            priceInr: 199, description: 'Featured profile placement for 24 hours.' },
  { id: 'chat_pack_s',      name: 'Chat Pack S (5 slots)',        priceInr: 79,  description: 'Legacy — 5 additional introductions.', chatSlotsAdded: 5 },
  { id: 'chat_pack_m',      name: 'Chat Pack M (15 slots)',       priceInr: 149, description: 'Legacy — 15 additional introductions.', chatSlotsAdded: 15 },
  { id: 'chat_pack_l',      name: 'Chat Pack L (35 slots)',       priceInr: 249, description: 'Legacy — 35 additional introductions.', chatSlotsAdded: 35 },
  { id: 'travel_pass',      name: 'Travel Pass (24 hr)',          priceInr: 99,  description: 'Set a travel location active for 24 hours.' },
  { id: 'travel_pass_week', name: 'Travel Pass Week (7 days)',    priceInr: 299, description: 'Set a travel location active for 7 days.' },
  { id: 'verified_badge',   name: 'Verified Badge (permanent)',   priceInr: 199, description: 'Government-verified identity badge.' },
  { id: 'audio_call_topup', name: 'Audio Call Top-up (+30 min)',  priceInr: 49,  description: 'Add 30 daily audio minutes (free tier only).', audioMinutesAdded: 30 },
  { id: 'video_call_topup', name: 'Video Call Top-up (+30 min)',  priceInr: 79,  description: 'Add 30 daily video minutes (free tier only).', videoMinutesAdded: 30 },
];

const PLAN_FEATURES = {
  free:     { bioChars: 150, gridProfiles: 100, interactionCap: 20, pinChats: 0, messageTemplates: 0, exploreAccess: false, callHistoryAccess: false, whoViewedMe: false, incognitoMode: false, aiFeatures: false },
  premium:  { bioChars: 400, gridProfiles: 600, interactionCap: null, pinChats: 0, messageTemplates: 5, exploreAccess: true, callHistoryAccess: false, whoViewedMe: false, incognitoMode: false, aiFeatures: false },
  gold:     { bioChars: 600, gridProfiles: null, interactionCap: null, pinChats: 5, messageTemplates: 5, exploreAccess: true, callHistoryAccess: true, whoViewedMe: true, incognitoMode: true, aiFeatures: false },
  platinum: { bioChars: 600, gridProfiles: null, interactionCap: null, pinChats: 10, messageTemplates: 10, exploreAccess: true, callHistoryAccess: true, whoViewedMe: true, incognitoMode: true, aiFeatures: true },
};

export const BILLING_CATALOG = {
  plans: {
    free:     { priceInr: { monthly: 0, three_month: 0, six_month: 0, annual: 0 }, features: PLAN_FEATURES.free },
    premium:  { priceInr: PLAN_PRICES.premium,  features: PLAN_FEATURES.premium  },
    gold:     { priceInr: PLAN_PRICES.gold,     features: PLAN_FEATURES.gold     },
    platinum: { priceInr: PLAN_PRICES.platinum, features: PLAN_FEATURES.platinum },
  },
  addOns: ADDON_CATALOG,
  currency: 'INR',
};
