import { colors } from './colors';

export { colors };
export { LightTheme, DarkTheme } from './colors';
export type { AppTheme } from './colors';
export { ThemeProvider, useTheme } from './ThemeContext';
export { FontFamily, DisplayFont, FontSize, LineHeight } from './typography';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const font = {
  // System sans is the default face. Swap in a custom font via expo-font and
  // update src/theme/typography.ts FontFamily strings if an exact face is needed.
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    title: 28,
    hero: 34,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
  },
} as const;

export const layout = {
  tabBarHeight: 58,
  headerHeight: 52,
  gridGap: 2,
} as const;
