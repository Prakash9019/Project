/**
 * Static catalogs the client renders for profile customization. Kept server-side so the options
 * stay consistent across platforms and can be A/B-tuned without a client release.
 */

// Hinge-style pre-written prompts ("Top Prompts").
export const TOP_PROMPTS = [
  'The way to win me over is',
  'My simple pleasures',
  'I go crazy for',
  'A shower thought I recently had',
  'The key to my heart is',
  "We'll get along if",
  'My most irrational fear',
  'Two truths and a lie',
  'Dating me is like',
  'I want someone who',
];

// Grindr-style subculture "tribes" adapted for a straight audience.
export const TRIBES = [
  'fitness',
  'foodie',
  'traveler',
  'creative',
  'gamer',
  'outdoorsy',
  'nightlife',
  'homebody',
  'professional',
  'student',
  'spiritual',
  'music_lover',
];

export const BODY_TYPES = ['slim', 'athletic', 'average', 'muscular', 'curvy', 'plus_size', 'other'];

export const DATING_INTENTIONS = [
  { key: 'casual_dates', label: 'Casual dates' },
  { key: 'intimacy_no_commitment', label: 'Intimacy without commitment' },
  { key: 'life_partner', label: 'Life partner' },
  { key: 'ethical_non_monogamy', label: 'Ethical non-monogamy' },
  { key: 'marriage', label: 'Marriage' },
  { key: 'friendship', label: 'Friendship' },
  { key: 'virtual_dating', label: 'Virtual dating' },
];

export const RELATIONSHIP_TYPES = [
  'single',
  'dating',
  'open_relationship',
  'married',
  'complicated',
  'prefer_not_to_say',
];

export const MAX_TRIBES = 3;
export const MAX_TAGS = 10;
export const MAX_DATING_INTENTIONS = 2;
export const MIN_PHOTOS_FOR_DISCOVERY = 3;
