import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { FontFamily, FontSize } from '../theme';

export type MediaViewerImage = {
  uri: string;
  senderId: string;
  senderName: string;
  createdAt: string;
};

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 3;
const SWIPE_NAV_THRESHOLD = 50;
const SWIPE_CLOSE_THRESHOLD = 120;

function headerTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Full-screen, gesture-driven media viewer for chat images.
 * - Pinch to zoom (1x–5x), double-tap toggles 1x/3x, pan while zoomed.
 * - Horizontal swipe (when not zoomed) navigates between images.
 * - Vertical swipe-down (when not zoomed) closes.
 * Pure black background is required for a media viewer — the only hardcoded
 * color allowed here per project rules.
 */
export function MediaViewer({
  visible,
  images,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  images: MediaViewerImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetTransform = () => {
    'worklet';
    scale.value = withTiming(1, { duration: 150 });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: 150 });
    savedTranslateX.value = 0;
    translateY.value = withTiming(0, { duration: 150 });
    savedTranslateY.value = 0;
  };

  // Sync the visible index when (re)opening.
  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  // Reset zoom/pan whenever the shown image changes.
  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    savedTranslateX.value = 0;
    translateY.value = 0;
    savedTranslateY.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, visible]);

  const goTo = (next: number) => {
    if (next < 0 || next >= images.length) return;
    setIndex(next);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, 1), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) resetTransform();
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        // Pan the zoomed image, clamped to its scaled bounds.
        const maxX = (width * (scale.value - 1)) / 2;
        const maxY = (height * (scale.value - 1)) / 2;
        translateX.value = Math.min(
          Math.max(savedTranslateX.value + e.translationX, -maxX),
          maxX,
        );
        translateY.value = Math.min(
          Math.max(savedTranslateY.value + e.translationY, -maxY),
          maxY,
        );
      } else {
        // Not zoomed: horizontal drag previews navigation, vertical drag previews close.
        if (Math.abs(e.translationX) > Math.abs(e.translationY)) {
          translateX.value = e.translationX;
        } else if (e.translationY > 0) {
          translateY.value = e.translationY;
        }
      }
    })
    .onEnd((e) => {
      if (scale.value > 1) {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        return;
      }
      // Swipe down to close.
      if (e.translationY > SWIPE_CLOSE_THRESHOLD && Math.abs(e.translationY) > Math.abs(e.translationX)) {
        runOnJS(onClose)();
        return;
      }
      // Horizontal swipe to navigate.
      if (e.translationX <= -SWIPE_NAV_THRESHOLD && index < images.length - 1) {
        translateX.value = withTiming(-width, { duration: 150 }, () => {
          runOnJS(goTo)(index + 1);
        });
        return;
      }
      if (e.translationX >= SWIPE_NAV_THRESHOLD && index > 0) {
        translateX.value = withTiming(width, { duration: 150 }, () => {
          runOnJS(goTo)(index - 1);
        });
        return;
      }
      // No threshold met — spring back.
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        resetTransform();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: 150 });
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const composed = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!visible) return null;
  const current = images[index];
  if (!current) return null;

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <GestureDetector gesture={composed}>
          <Animated.View style={styles.imageWrap}>
            <Animated.View style={imageStyle}>
              <Image
                source={{ uri: current.uri }}
                style={{ width, height }}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={120}
              />
            </Animated.View>
          </Animated.View>
        </GestureDetector>

        {/* Header */}
        <LinearGradient
          colors={['rgba(0,0,0,0.75)', 'transparent']}
          style={styles.header}
          pointerEvents="box-none"
        >
          <Pressable onPress={onClose} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.senderName} numberOfLines={1}>
              {current.senderName}
            </Text>
            <Text style={styles.timestamp}>{headerTime(current.createdAt)}</Text>
          </View>
        </LinearGradient>

        {/* Footer counter */}
        {images.length > 1 ? (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.75)']}
            style={styles.footer}
            pointerEvents="none"
          >
            <Text style={styles.counter}>
              {index + 1} of {images.length}
            </Text>
          </LinearGradient>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 1000,
    elevation: 1000,
  },
  safe: { flex: 1 },
  imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 20,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  senderName: { color: '#fff', fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  timestamp: { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 1 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 40,
  },
  counter: { color: '#fff', fontSize: FontSize.md, fontFamily: FontFamily.medium },
});
