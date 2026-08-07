/**
 * NearMe centralized theme — "Golden Hour" palette (two complete modes).
 *
 * Mood: warm city night / golden-hour. Backgrounds are warm coffee-black,
 * never pure black. One passionate accent — sunset coral (`brand`) carried by a
 * signature coral→amber gradient (`gradientWarm`) used for CTAs and the Right
 * Now identity. Reads romantic, not sleazy. India-first, orientation-neutral.
 *
 * Default app theme is DARK. Use `useTheme().theme.*` for ALL colors in
 * components — zero hardcoded hex. `AppTheme` is the shape both palettes satisfy.
 */

// Signature gradient tuples (typed so they satisfy expo-linear-gradient's
// `readonly [string, string, ...]` colors prop without a cast at call sites).
type Gradient = readonly [string, string, ...string[]];

export const LightTheme = {
  // Backgrounds — warm cream
  background: '#FFF6EE',
  backgroundSecondary: '#FFEFE2',
  backgroundTertiary: '#FCE6D6',
  surface: '#FFFFFF',
  surfaceElevated: '#FFF9F3',

  // Chat bubbles — received bubbles need real contrast against `background`
  // (surfaceElevated is only ~1% off the cream background and reads invisible).
  receivedBubble: '#FFFFFF',
  receivedBubbleBorder: '#E8D5C4',

  // Text — warm espresso
  textPrimary: '#2A1C14',
  textSecondary: '#6B574A',
  textTertiary: '#A08C7C',
  textInverse: '#FFFFFF',

  // Brand — sunset coral + golden amber
  brand: '#F0613B', // sunset coral (passion accent)
  brandSecondary: '#E89A2E', // golden amber

  // Plan colors (warm spectrum)
  planPremium: '#F0613B', // coral
  planGold: '#E89A2E', // amber
  planPlatinum: '#B79B72', // warm platinum

  // Right Now identity — purple (matches reference "Right Now" feed accent)
  rightNow: '#7C3AED',
  rightNowSoft: '#EDE3FE',

  // Functional
  online: '#22C55E',
  error: '#E5484D',
  warning: '#E89A2E',
  success: '#22C55E',
  info: '#2E90FA',

  // UI
  border: '#EADDCF',
  borderLight: '#F3E9DD',
  tabBar: '#FFFFFF',
  tabBarActive: '#F0613B',
  tabBarInactive: '#A08C7C',
  overlay: 'rgba(42,28,20,0.45)',
  card: '#FFFFFF',
  inputBackground: '#FCEFE3',

  // Call
  callAudio: '#22C55E',
  callVideo: '#F0613B',
  callDisabled: '#D9C9B8',

  // Gradients
  gradientWarm: ['#F0613B', '#E89A2E'] as Gradient, // signature coral→amber
  gradientWarmSoft: ['#FF8A6B', '#F4B14E'] as Gradient, // lighter variant
  // Photo scrim — stays dark in both modes (sits over imagery)
  scrim: ['transparent', 'rgba(23,17,15,0.0)', 'rgba(23,17,15,0.85)'] as Gradient,
};

export const DarkTheme: typeof LightTheme = {
  // Backgrounds — warm coffee-black (never pure #000)
  background: '#17110F',
  backgroundSecondary: '#221915',
  backgroundTertiary: '#2E231D',
  surface: '#221915',
  surfaceElevated: '#2E231D',

  // Chat bubbles — dark mode already has enough contrast; no border needed.
  receivedBubble: '#2E231D',
  receivedBubbleBorder: 'transparent',

  // Text — warm off-white
  textPrimary: '#F7EFE9',
  textSecondary: '#B9A99D',
  textTertiary: '#7A6A5E',
  textInverse: '#2A1C14',

  // Brand — sunset coral + golden amber
  brand: '#FF7A59', // sunset coral (passion accent)
  brandSecondary: '#FFB14E', // golden amber

  // Plan colors (warm spectrum)
  planPremium: '#FF7A59', // coral
  planGold: '#FFB14E', // amber
  planPlatinum: '#E0C9A6', // warm platinum

  // Right Now identity — purple (matches reference "Right Now" feed accent)
  rightNow: '#9B4DEE',
  rightNowSoft: '#3A2A55',

  // Functional
  online: '#4ADE80',
  error: '#FF6B6B',
  warning: '#FFB14E',
  success: '#4ADE80',
  info: '#5AB0FF',

  // UI
  border: '#3A2C24',
  borderLight: '#2A1F19',
  tabBar: '#1A1310',
  tabBarActive: '#FF7A59',
  tabBarInactive: '#7A6A5E',
  overlay: 'rgba(20,12,8,0.7)',
  card: '#221915',
  inputBackground: '#2E231D',

  // Call
  callAudio: '#4ADE80',
  callVideo: '#FF7A59',
  callDisabled: '#4A3A30',

  // Gradients
  gradientWarm: ['#FF7A59', '#FFB14E'] as Gradient, // signature coral→amber
  gradientWarmSoft: ['#FF9472', '#FFC06B'] as Gradient,
  scrim: ['transparent', 'rgba(23,17,15,0.0)', 'rgba(23,17,15,0.9)'] as Gradient,
};

export type AppTheme = typeof DarkTheme;

/**
 * Legacy compatibility shim.
 * A few remaining legacy screens import `{ colors }` with keys like `yellow`,
 * `purple`, `surface`, etc. We map those onto the NearMe DARK palette so they
 * keep rendering on-brand. New code must NOT use this — use `useTheme().theme.*`.
 *
 * @deprecated use useTheme().theme instead
 */
export const colors = {
  black: DarkTheme.background,
  bg: DarkTheme.background,
  surface: DarkTheme.surface,
  surfaceElevated: DarkTheme.surfaceElevated,
  surfaceInput: DarkTheme.inputBackground,
  chip: DarkTheme.backgroundTertiary,
  chipActive: '#FFFFFF',
  divider: DarkTheme.border,
  placeholder: '#3A3A3C',

  // Brand (remapped to NearMe brand)
  yellow: DarkTheme.brand,
  yellowDeep: DarkTheme.brandSecondary,
  yellowText: DarkTheme.brand,

  purple: DarkTheme.planPremium,
  purpleBright: DarkTheme.planPremium,

  green: DarkTheme.online,
  greenBright: DarkTheme.success,

  red: DarkTheme.error,
  pink: DarkTheme.brand,
  onlineDot: DarkTheme.online,

  text: DarkTheme.textPrimary,
  textSecondary: DarkTheme.textSecondary,
  textMuted: DarkTheme.textTertiary,
  textFaint: DarkTheme.textTertiary,

  onYellow: DarkTheme.textInverse,
  onPurple: '#FFFFFF',

  white: '#FFFFFF',
  transparent: 'transparent',
} as const;

export type ColorKey = keyof typeof colors;
