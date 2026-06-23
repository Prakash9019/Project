/**
 * NearMe centralized typography — "Golden Hour".
 *
 * Display:  Outfit            (rounded, warm geometric — headings, names, CTAs)
 * Body:     Plus Jakarta Sans (clean, friendly — paragraphs, labels, inputs)
 *
 * Font keys below MUST match the names registered via expo-font in
 * app/_layout.tsx. Use `FontFamily.*` for body text and `DisplayFont.*` for
 * headings/titles/CTAs. Never hardcode a font string in a component.
 */

// Body — Plus Jakarta Sans
export const FontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  heavy: 'PlusJakartaSans_800ExtraBold',
};

// Display — Outfit
export const DisplayFont = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
  heavy: 'Outfit_800ExtraBold',
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  hero: 42,
};

export const LineHeight = {
  tight: 1.2,
  normal: 1.4,
  loose: 1.6,
};
