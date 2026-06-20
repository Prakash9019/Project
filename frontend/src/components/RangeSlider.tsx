import { useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../theme';

const THUMB = 24;

/**
 * Lightweight single- or dual-thumb slider built on core PanResponder (no extra
 * native deps). Pass one value for a single slider, two for a range. Movement is
 * tracked via gesture dx from the value at touch-start, so no page-coords needed.
 */
export function RangeSlider({
  min,
  max,
  step = 1,
  values,
  onChange,
}: {
  min: number;
  max: number;
  step?: number;
  values: number[]; // [v] single, or [low, high] dual
  onChange: (next: number[]) => void;
}) {
  const { theme } = useTheme();
  const [width, setWidth] = useState(0);
  const startRef = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const usable = Math.max(1, width - THUMB);
  const toX = (v: number) => ((v - min) / (max - min)) * usable;
  const fromX = (x: number) => {
    const raw = (Math.max(0, Math.min(usable, x)) / usable) * (max - min) + min;
    return Math.round(raw / step) * step;
  };

  const makeResponder = (index: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = toX(values[index]);
      },
      onPanResponderMove: (_e, g) => {
        let v = fromX(startRef.current + g.dx);
        const next = [...values];
        if (next.length === 2) {
          if (index === 0) v = Math.min(v, next[1]);
          else v = Math.max(v, next[0]);
        }
        v = Math.max(min, Math.min(max, v));
        if (v !== next[index]) {
          next[index] = v;
          onChange(next);
        }
      },
    });

  const dual = values.length === 2;
  const leftX = dual ? toX(values[0]) : 0;
  const rightX = dual ? toX(values[1]) : toX(values[0]);

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={[styles.track, { backgroundColor: theme.backgroundTertiary }]} />
      <View
        style={[
          styles.fill,
          { backgroundColor: theme.brand, left: leftX + THUMB / 2, width: Math.max(0, rightX - leftX) },
        ]}
      />
      {values.map((_, i) => (
        <View
          key={i}
          {...makeResponder(i).panHandlers}
          style={[styles.thumb, { left: (i === 0 && dual ? leftX : rightX), backgroundColor: theme.brand, borderColor: theme.background }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: THUMB, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2 },
  fill: { position: 'absolute', height: 4, borderRadius: 2 },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3 },
});
