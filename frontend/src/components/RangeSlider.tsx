import { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../theme';

const THUMB = 24;

/**
 * Lightweight single- or dual-thumb slider. Pan responders are memoized so dragging
 * one slider does not recreate handlers or re-render sibling sliders.
 */
export function RangeSlider({
  min,
  max,
  step = 1,
  values,
  onChange,
  onSlidingComplete,
}: {
  min: number;
  max: number;
  step?: number;
  values: number[];
  onChange: (next: number[]) => void;
  onSlidingComplete?: (final: number[]) => void;
}) {
  const { theme } = useTheme();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const valuesRef = useRef(values);
  const onChangeRef = useRef(onChange);
  const onCompleteRef = useRef(onSlidingComplete);
  const startRef = useRef(0);
  const latestRef = useRef(values);

  valuesRef.current = values;
  latestRef.current = values;
  onChangeRef.current = onChange;
  onCompleteRef.current = onSlidingComplete;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  const dual = values.length === 2;

  const responders = useMemo(
    () =>
      [0, 1].slice(0, values.length).map((index) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: () => {
            const w = widthRef.current;
            const usable = Math.max(1, w - THUMB);
            const toX = (v: number) => ((v - min) / (max - min)) * usable;
            startRef.current = toX(valuesRef.current[index]);
          },
          onPanResponderMove: (_e, g) => {
            const w = widthRef.current;
            const usable = Math.max(1, w - THUMB);
            const fromX = (x: number) => {
              const raw = (Math.max(0, Math.min(usable, x)) / usable) * (max - min) + min;
              return Math.round(raw / step) * step;
            };
            let v = fromX(startRef.current + g.dx);
            const next = [...latestRef.current];
            if (next.length === 2) {
              if (index === 0) v = Math.min(v, next[1]);
              else v = Math.max(v, next[0]);
            }
            v = Math.max(min, Math.min(max, v));
            if (v !== next[index]) {
              next[index] = v;
              latestRef.current = next;
              onChangeRef.current(next);
            }
          },
          onPanResponderRelease: () => onCompleteRef.current?.(latestRef.current),
          onPanResponderTerminate: () => onCompleteRef.current?.(latestRef.current),
        })
      ),
    [min, max, step, dual, values.length]
  );

  const w = width;
  const usable = Math.max(1, w - THUMB);
  const toX = (v: number) => ((v - min) / (max - min)) * usable;
  const leftX = dual ? toX(values[0]) : 0;
  const rightX = dual ? toX(values[1]) : toX(values[0]);

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={[styles.track, { backgroundColor: theme.backgroundTertiary }]} />
      {w > 0 && (
        <View
          style={[
            styles.fill,
            { backgroundColor: theme.brand, left: leftX + THUMB / 2, width: Math.max(0, rightX - leftX) },
          ]}
        />
      )}
      {values.map((_, i) => (
        <View
          key={i}
          {...responders[i].panHandlers}
          style={[
            styles.thumb,
            {
              left: i === 0 && dual ? leftX : rightX,
              backgroundColor: theme.brand,
              borderColor: theme.background,
            },
          ]}
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
