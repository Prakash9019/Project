import type { View } from 'react-native';
import type { ThumbnailLayout } from '../components/MediaViewer';

/**
 * Measure a media thumbnail's on-screen rect, then run `open` with it.
 *
 * Powers the MediaViewer's zoom-from-the-bubble transition: the viewer needs the
 * tapped thumbnail's PAGE coordinates, which are only knowable at tap time.
 *
 * `measure()` is asynchronous and can fail (unmounted node, a view Android has
 * collapsed away, a zero-size layout mid-animation). In every one of those cases
 * `open` is still called — with `undefined` — so a failed measurement degrades to
 * the plain fade-in rather than swallowing the tap.
 */
export function measureThumbnail(
  ref: React.RefObject<View | null>,
  open: (layout?: ThumbnailLayout) => void,
): void {
  const node = ref.current;
  if (!node) {
    open(undefined);
    return;
  }
  try {
    node.measure((_x, _y, width, height, pageX, pageY) => {
      if (!width || !height) {
        open(undefined);
        return;
      }
      open({ x: pageX, y: pageY, width, height });
    });
  } catch {
    open(undefined);
  }
}
