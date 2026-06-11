/**
 * Static catalogs the client renders for profile customization.
 */

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

export const TRIBES = [
  'fitness', 'foodie', 'traveler', 'creative', 'gamer', 'outdoorsy',
  'nightlife', 'homebody', 'professional', 'student', 'spiritual', 'music_lover',
];

// Change 5: updated BodyType canonical values
export const BODY_TYPES = ['slim', 'athletic', 'average', 'curvy', 'heavyset', 'prefer_not_to_say'];

export const SKIN_TONES = ['very_fair', 'fair', 'medium', 'olive', 'brown', 'dark', 'prefer_not_to_say'];

export const RELATIONSHIP_STATUSES = ['single', 'committed', 'open_relationship', 'prefer_not_to_say'];

// Change 5: typed lookingFor values
export const LOOKING_FOR_OPTIONS = ['fwb', 'one_night', 'long_term', 'short_term', 'casual', 'friendship'];

export const WHERE_WE_CAN_MEET = ['my_place', 'your_place', 'restaurant', 'cafe', 'hotel', 'outdoors', 'virtual'];

// Change 5: fantasy tags — initial curated set + free-form allowed
export const FANTASY_TAGS_CURATED = [
  'safer_sex', 'kissing', 'kink', 'roleplay', 'romantic',
  'daddy', 'mummy', 'sugar_mom', 'sugar_dad', 'beard',
];

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
  'single', 'dating', 'open_relationship', 'married', 'complicated', 'prefer_not_to_say',
];

export const MAX_TRIBES = 3;
export const MAX_TAGS = 10;
export const MAX_DATING_INTENTIONS = 2;

// Change 3.2 & 4: no minimum photos required for discovery
export const MIN_PHOTOS_FOR_DISCOVERY = 0;
