import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Share,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
// SDK 56 moved the classic download/cache API under the /legacy subpath (the new
// top-level API is File/Directory classes). downloadAsync + cacheDirectory live here.
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { showSuccess, showError } from '../lib/toast';
import { FontFamily, FontSize } from '../theme';

const CONTROLS_AUTO_HIDE_MS = 3000;

export type MediaViewerImage = {
  uri: string;
  senderId: string;
  senderName: string;
  createdAt: string;
};

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 3;
const MAX_DOTS = 10;

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
 * A single, independently-zoomable page. Each page owns its own zoom/pan state,
 * so navigating never carries zoom from one image to the next. When a page
 * leaves the viewport (`active` goes false) it resets to 1x.
 */
function ImagePage({
  image,
  width,
  height,
  active,
  onZoomChange,
  onSingleTap,
}: {
  image: MediaViewerImage;
  width: number;
  height: number;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onSingleTap: () => void;
}) {
  const [loading, setLoading] = useState(true);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  const setZoom = (z: boolean) => {
    setZoomed(z);
    onZoomChange(z);
  };

  const resetZoom = () => {
    scale.value = withTiming(1, { duration: 150 });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: 150 });
    savedTranslateX.value = 0;
    translateY.value = withTiming(0, { duration: 150 });
    savedTranslateY.value = 0;
    setZoom(false);
  };

  // Reset zoom when this page scrolls out of view.
  useEffect(() => {
    if (!active) resetZoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        runOnJS(resetZoom)();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: 150 });
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(setZoom)(true);
      }
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) runOnJS(resetZoom)();
      else runOnJS(setZoom)(true);
    });

  // Pan is only enabled while zoomed, so an un-zoomed horizontal drag stays with
  // the FlatList (page swipe) instead of being captured here.
  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      const maxX = (width * (scale.value - 1)) / 2;
      const maxY = (height * (scale.value - 1)) / 2;
      translateX.value = Math.min(Math.max(savedTranslateX.value + e.translationX, -maxX), maxX);
      translateY.value = Math.min(Math.max(savedTranslateY.value + e.translationY, -maxY), maxY);
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Single tap toggles the toolbar — only fires once a double-tap has been ruled
  // out (Exclusive), so zooming never also toggles the controls.
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      runOnJS(onSingleTap)();
    });

  const composed = Gesture.Race(
    Gesture.Exclusive(doubleTap, singleTap),
    Gesture.Simultaneous(pinch, pan),
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <GestureDetector gesture={composed}>
        <Animated.View style={imageStyle}>
          <Image
            source={{ uri: image.uri }}
            style={{ width, height }}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={200}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
          />
        </Animated.View>
      </GestureDetector>
      {loading ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Full-screen, swipeable media viewer for chat images.
 * - Horizontal paging via FlatList (smooth, hardware-paged transitions).
 * - Each page pinch/double-tap zooms independently; zoom resets on page change.
 * - Pure black background is required for a media viewer — the only hardcoded
 *   color allowed here per project rules.
 */
export function MediaViewer({
  visible,
  images,
  initialIndex,
  onClose,
  currentUserId,
  onDelete,
}: {
  visible: boolean;
  images: MediaViewerImage[];
  initialIndex: number;
  onClose: () => void;
  /** Enables the Delete action for images the current user sent (opt-in). */
  currentUserId?: string;
  /** Invoked when the user deletes the current image — caller runs its own
   *  unsend/delete flow. Only wired if provided; existing callers are unaffected. */
  onDelete?: (image: MediaViewerImage) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<MediaViewerImage>>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Toolbar visibility — auto-hides after 3s of no interaction, toggles on tap.
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useSharedValue(1);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const showControls = useCallback(() => {
    clearHideTimer();
    setControlsVisible(true);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_AUTO_HIDE_MS);
  }, [clearHideTimer]);

  const toggleControls = useCallback(() => {
    setControlsVisible((prev) => {
      const next = !prev;
      clearHideTimer();
      if (next) hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_AUTO_HIDE_MS);
      return next;
    });
  }, [clearHideTimer]);

  // Fade the toolbar in/out (200ms) whenever visibility flips.
  useEffect(() => {
    controlsOpacity.value = withTiming(controlsVisible ? 1 : 0, { duration: 200 });
  }, [controlsVisible, controlsOpacity]);

  // Keep the header/dots in sync when (re)opening at a different image, and
  // start visible with a fresh auto-hide timer.
  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      setZoomed(false);
      showControls();
    }
    return clearHideTimer;
  }, [visible, initialIndex, showControls, clearHideTimer]);

  const toolbarStyle = useAnimatedStyle(() => ({ opacity: controlsOpacity.value }));

  const current = images[currentIndex] ?? images[0];

  const handleSave = useCallback(async () => {
    if (!current || saving) return;
    setSaving(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        showError('Allow photo access to save');
        return;
      }
      // Remote signed URL → download to cache → save the local file to the gallery.
      const name = `nearme-${Date.now()}.jpg`;
      const localUri = FileSystem.cacheDirectory + name;
      const dl = await FileSystem.downloadAsync(current.uri, localUri);
      await MediaLibrary.saveToLibraryAsync(dl.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showSuccess('Saved to gallery');
    } catch {
      showError('Could not save image');
    } finally {
      setSaving(false);
    }
  }, [current, saving]);

  const handleShare = useCallback(async () => {
    if (!current) return;
    try {
      await Share.share({ url: current.uri, message: current.uri });
    } catch {
      /* user dismissed the share sheet — no-op */
    }
  }, [current]);

  const handleDelete = useCallback(() => {
    if (!current || !onDelete) return;
    onDelete(current);
    onClose();
  }, [current, onDelete, onClose]);

  if (!visible) return null;
  if (!current) return null;

  const useDots = images.length > 1 && images.length <= MAX_DOTS;
  const canDelete = !!onDelete && !!currentUserId && current.senderId === currentUserId;

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          extraData={currentIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          keyExtractor={(item, i) => `${item.uri}-${i}`}
          windowSize={3}
          maxToRenderPerBatch={3}
          initialNumToRender={1}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / width);
            if (next !== currentIndex) setCurrentIndex(next);
            setZoomed(false);
          }}
          renderItem={({ item, index }) => (
            <ImagePage
              image={item}
              width={width}
              height={height}
              active={index === currentIndex}
              onZoomChange={setZoomed}
              onSingleTap={toggleControls}
            />
          )}
        />

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

        {/* Footer — dot indicators for ≤10 images, "n of N" text otherwise */}
        {images.length > 1 ? (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.75)']}
            style={styles.footer}
            pointerEvents="none"
          >
            {useDots ? (
              <View style={styles.dots}>
                {images.map((img, i) => (
                  <View
                    key={`${img.uri}-${i}`}
                    style={[i === currentIndex ? styles.dotActive : styles.dotInactive]}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.counter}>
                {currentIndex + 1} of {images.length}
              </Text>
            )}
          </LinearGradient>
        ) : null}

        {/* Bottom action toolbar — Save / Share / (Delete). Auto-hides after 3s;
            tap the image to toggle. */}
        <Animated.View
          style={[styles.toolbar, { bottom: insets.bottom + 16 }, toolbarStyle]}
          pointerEvents={controlsVisible ? 'auto' : 'none'}
        >
          <Pressable style={styles.toolBtn} onPress={handleSave} disabled={saving} hitSlop={8}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="download-outline" size={22} color="#fff" />
            )}
            <Text style={styles.toolLabel}>Save</Text>
          </Pressable>
          <Pressable style={styles.toolBtn} onPress={handleShare} hitSlop={8}>
            <Ionicons name="share-outline" size={22} color="#fff" />
            <Text style={styles.toolLabel}>Share</Text>
          </Pressable>
          {canDelete ? (
            <Pressable style={styles.toolBtn} onPress={handleDelete} hitSlop={8}>
              <Ionicons name="trash-outline" size={22} color="#fff" />
              <Text style={styles.toolLabel}>Delete</Text>
            </Pressable>
          ) : null}
        </Animated.View>
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
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  toolbar: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toolBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, gap: 4, minWidth: 64 },
  toolLabel: { color: '#fff', fontSize: FontSize.xs, fontFamily: FontFamily.medium },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dotActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  dotInactive: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
});
