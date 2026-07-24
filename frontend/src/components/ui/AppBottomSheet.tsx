import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  useBottomSheetSpringConfigs,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useTheme } from '../../theme';

// Re-export the gorhom scroll primitives so migrated sheets can use the
// gesture-coordinated versions (a plain RN FlatList/ScrollView inside a sheet
// fights the pan-to-dismiss gesture; these hand the gesture off correctly).
export {
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';

export type AppBottomSheetProps = {
  /** Boolean-controlled like the old Modal sheets — no imperative ref needed. */
  visible: boolean;
  /** Fired whenever the sheet fully closes (pan-down, backdrop tap, or `visible=false`). */
  onClose: () => void;
  /**
   * Fixed snap points (e.g. `['75%']`). Omit to let the sheet size itself to its
   * content (dynamic sizing) — the right default for menus and option grids.
   */
  snapPoints?: (string | number)[];
  /** Initial snap index when presented (default 0 = first snap point). */
  initialIndex?: number;
  /**
   * Whether dragging the sheet body pans/closes the sheet (default true). Set
   * false when the body hosts a non-gorhom scrollable (e.g. FlashList) that would
   * otherwise fight the pan gesture — the handle still closes the sheet.
   */
  enableContentPanningGesture?: boolean;
  children: React.ReactNode;
};

/**
 * Shared NearMe bottom sheet built on `@gorhom/bottom-sheet` (F47). Replaces the
 * plain `<Modal animationType="slide">` sheets that had no pan-to-dismiss and a
 * hard-cut backdrop. NearMe defaults baked in:
 *   • dark tap-to-close backdrop (fades independently of the sheet)
 *   • 36×4 handle indicator in `theme.border`
 *   • `theme.surface` background
 *   • pan-down-to-close + spring physics (damping 80 / stiffness 500)
 *   • keyboard-aware (`interactive` / `restore`)
 *
 * Requires a `BottomSheetModalProvider` ancestor (added at the app root) and the
 * existing `GestureHandlerRootView`.
 */
export function AppBottomSheet({
  visible,
  onClose,
  snapPoints,
  initialIndex = 0,
  enableContentPanningGesture = true,
  children,
}: AppBottomSheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheetModal>(null);

  // Drive present/dismiss from the boolean prop so every existing call site keeps
  // working unchanged.
  useEffect(() => {
    if (visible) ref.current?.present();
    else ref.current?.dismiss();
  }, [visible]);

  const animationConfigs = useBottomSheetSpringConfigs({
    damping: 80,
    stiffness: 500,
    mass: 1,
    overshootClamping: false,
  });

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.5}
      />
    ),
    [],
  );

  const dynamic = !snapPoints;

  return (
    <BottomSheetModal
      ref={ref}
      index={initialIndex}
      snapPoints={snapPoints}
      enableDynamicSizing={dynamic}
      enablePanDownToClose
      enableContentPanningGesture={enableContentPanningGesture}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      animationConfigs={animationConfigs}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      handleIndicatorStyle={[styles.handle, { backgroundColor: theme.border }]}
      backgroundStyle={{ backgroundColor: theme.surface }}
    >
      {dynamic ? (
        <BottomSheetView style={[styles.dynamicContent, { paddingBottom: insets.bottom + 8 }]}>
          {children}
        </BottomSheetView>
      ) : (
        children
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  handle: { width: 36, height: 4, borderRadius: 2 },
  dynamicContent: {},
});
