/**
 * NearMe centralized theme — two complete palettes.
 * Default app theme is DARK. Use `useTheme().theme.*` for all colors in components.
 * `AppTheme` is the shared shape both palettes satisfy.
 */

export const LightTheme = {
  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F5F5F5',
  backgroundTertiary: '#EBEBEB',
  surface: '#FFFFFF',
  surfaceElevated: '#F9F9F9',

  // Text
  textPrimary: '#0D0D0D',
  textSecondary: '#5A5A5A',
  textTertiary: '#9A9A9A',
  textInverse: '#FFFFFF',

  // Brand
  brand: '#FF4458', // NearMe primary red-pink
  brandSecondary: '#FF6B35', // warm orange accent

  // Plan colors
  planPremium: '#6C63FF', // purple
  planGold: '#FFB800', // gold
  planPlatinum: '#00C9FF', // platinum blue

  // Functional
  online: '#27E36B',
  error: '#FF3B30',
  warning: '#FF9500',
  success: '#34C759',
  info: '#007AFF',

  // UI
  border: '#E0E0E0',
  borderLight: '#F0F0F0',
  tabBar: '#FFFFFF',
  tabBarActive: '#FF4458',
  tabBarInactive: '#9A9A9A',
  overlay: 'rgba(0,0,0,0.5)',
  card: '#FFFFFF',
  inputBackground: '#F5F5F5',

  // Call
  callAudio: '#27E36B',
  callVideo: '#007AFF',
  callDisabled: '#C0C0C0',
};

export const DarkTheme = {
  // Backgrounds
  background: '#000000',
  backgroundSecondary: '#1A1A1A',
  backgroundTertiary: '#262626',
  surface: '#1A1A1A',
  surfaceElevated: '#2C2C2C',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textTertiary: '#606060',
  textInverse: '#000000',

  // Brand
  brand: '#FF4458',
  brandSecondary: '#FF6B35',

  // Plan colors
  planPremium: '#8B7FFF',
  planGold: '#FFD700',
  planPlatinum: '#40D9FF',

  // Functional
  online: '#27E36B',
  error: '#FF453A',
  warning: '#FF9F0A',
  success: '#32D74B',
  info: '#0A84FF',

  // UI
  border: '#2C2C2C',
  borderLight: '#1A1A1A',
  tabBar: '#0D0D0D',
  tabBarActive: '#FF4458',
  tabBarInactive: '#606060',
  overlay: 'rgba(0,0,0,0.7)',
  card: '#1A1A1A',
  inputBackground: '#262626',

  // Call
  callAudio: '#27E36B',
  callVideo: '#0A84FF',
  callDisabled: '#404040',
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
