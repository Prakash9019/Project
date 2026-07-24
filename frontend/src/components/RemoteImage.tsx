import { useMemo } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { useTheme } from '../theme';

/**
 * Remote-image wrapper that gives expo-image a STABLE cache key.
 *
 * expo-image keys its memory/disk cache on the source object's `cacheKey`,
 * which defaults to the full source URI *including the query string*. Our media
 * arrives as R2/GCS signed URLs whose signature query params rotate on every
 * backend response — so the identical photo is treated as a brand-new image and
 * re-downloaded on every grid refetch, tab focus, or profile open
 * (see PERCEIVED_PERFORMANCE_AUDIT.md · F35).
 *
 * Deriving `cacheKey` from the PERMANENT object identity fixes this:
 *   1. `stableId` (a userId / photoId / roomId) when the caller can supply one, or
 *   2. the URL with its query string stripped — i.e. the stable object path —
 *      when it can't. (The signature lives entirely in the query, never the path.)
 *
 * Local sources — `require()`/number, `file://`, `data:`, and expo-image-picker
 * URIs — are passed straight through untouched: they are already local and must
 * never be re-keyed.
 */
type RemoteImageProps = ImageProps & { stableId?: string | null };

type ObjectSource = { uri?: string; cacheKey?: string } & Record<string, unknown>;

function withStableCacheKey(source: ImageProps['source'], stableId?: string | null): ImageProps['source'] {
  // require()/number assets and empty sources are local — leave them alone.
  if (source == null || typeof source === 'number' || Array.isArray(source)) return source;

  const uri = typeof source === 'string' ? source : (source as ObjectSource).uri;
  // Only remote http(s) URLs carry rotating signatures; local file://, data: and
  // asset URIs are already stable, so they pass through with no cacheKey.
  if (!uri || !/^https?:\/\//i.test(uri)) return source;

  // Respect an explicit cacheKey if the caller already set one.
  const existingKey = typeof source === 'object' ? (source as ObjectSource).cacheKey : undefined;
  const cacheKey = existingKey ?? stableId ?? uri.split('?')[0];

  return typeof source === 'string' ? { uri, cacheKey } : { ...(source as ObjectSource), cacheKey };
}

export function RemoteImage({
  stableId,
  source,
  cachePolicy,
  transition,
  recyclingKey,
  style,
  ...rest
}: RemoteImageProps) {
  const { theme } = useTheme();
  const finalSource = useMemo(() => withStableCacheKey(source, stableId), [source, stableId]);
  return (
    <Image
      source={finalSource}
      cachePolicy={cachePolicy ?? 'memory-disk'}
      // Fade in over the placeholder when the bytes arrive (F36/F38) — expo-image's
      // native crossfade, no manual animation. Callers may still override.
      transition={transition ?? 300}
      // Reset a recycled cell to its placeholder (never flash the previous row's
      // photo) when the underlying item changes (F37). Defaults to the stable id.
      recyclingKey={recyclingKey ?? stableId ?? undefined}
      // Neutral placeholder BEHIND the image, sized by the caller's own style, so
      // there's never a blank white box and no layout shift (F36). A caller that
      // sets its own backgroundColor still wins (it comes after in the array).
      style={[{ backgroundColor: theme.surfaceElevated }, style]}
      {...rest}
    />
  );
}
