import React from 'react';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { colors } from '../theme';

type IconProps = { size?: number; color?: string };

/**
 * NearMe brand logo — a location pin with a proximity radar ring.
 * `color` drives the pin; ring uses the same color at lower opacity.
 */
export function NearMeLogo({ size = 26, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Circle cx={32} cy={26} r={26} fill={color} opacity={0.12} />
      <Path
        d="M32 8c-8 0-14 6-14 14 0 10 14 26 14 26s14-16 14-26c0-8-6-14-14-14Z"
        fill={color}
      />
      <Circle cx={32} cy={22} r={6} fill={colors.black} />
    </Svg>
  );
}

/** Right Now — three teardrops in a triangle (Gaymoji style). */
export function Droplets({ size = 24, color = colors.text }: IconProps) {
  const drop = (cx: number, cy: number) =>
    `M${cx} ${cy - 6}c2.2 2.6 4 4.7 4 7a4 4 0 0 1-8 0c0-2.3 1.8-4.4 4-7Z`;
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path d={drop(16, 11)} fill={color} />
      <Path d={drop(11, 22)} fill={color} />
      <Path d={drop(21, 22)} fill={color} />
    </Svg>
  );
}

/**
 * Right Now brand mark — the "sweat drops" glyph used in the bottom tab bar.
 * Shared so the tab icon and the Right Now empty state render identically.
 * `solid` fills the shape (active tab); otherwise it draws as an outline.
 */
export function RightNowIcon({ size = 25, color = colors.text, solid = true }: IconProps & { solid?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Path
        d="M22.855.758 7.875 7.024l12.537 9.733c2.633 2.224 6.377 2.937 9.77 1.518 4.826-2.018 7.096-7.576 5.072-12.413C33.232 1.024 27.68-1.261 22.855.758m-9.962 17.924L2.05 10.284.137 23.529a7.99 7.99 0 0 0 2.958 7.803 8.001 8.001 0 0 0 9.798-12.65m15.339 7.015-8.156-4.69-.033 9.223c-.088 2 .904 3.98 2.75 5.041a5.46 5.46 0 0 0 7.479-2.051c1.499-2.644.589-6.013-2.04-7.523"
        fill={solid ? color : 'none'}
        stroke={solid ? 'none' : color}
        strokeWidth={solid ? 0 : 1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Boost lightning bolt. */
export function Bolt({ size = 22, color = colors.green }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill={color} />
    </Svg>
  );
}

/** Filled flame for the Interest tab. */
export function Flame({ size = 24, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2c1 3-1 5-3 7s-3 4-3 6a6 6 0 0 0 12 0c0-2-1-3-2-4 0 1-.5 2-1.5 2 .5-3-1-6-2.5-7 0 2-1 3-2 3 1-2 2-4-1-5 1 0 3-1 3-2Z"
        fill={color}
      />
    </Svg>
  );
}

export { Svg, Path, Circle, G };
