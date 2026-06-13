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
