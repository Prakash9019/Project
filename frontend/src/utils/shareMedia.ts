import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Share a chat media item (photo/video) to any other app.
 *
 * Why not `Share.share({ url })`: React Native's `Share` only forwards `message`
 * and `title` on Android — `url` is iOS-only and is silently dropped. Passing
 * `{ url, message: '' }` therefore handed Android apps an EMPTY text payload,
 * which is exactly what produced WhatsApp's "Cannot send empty message".
 *
 * Instead we download the media to the cache directory and hand the receiving
 * app the real FILE via `expo-sharing`, so the image itself is shared on both
 * platforms. If the platform has no share UI available we fall back to RN's
 * `Share` with the url as a NON-empty `message`, so the worst case is a link —
 * never an empty payload.
 */
export async function shareMediaUrl(url: string): Promise<void> {
  if (!url) return;

  const extension = guessExtension(url);
  const target = `${FileSystem.cacheDirectory}nearme-share-${Date.now()}.${extension}`;

  try {
    if (await Sharing.isAvailableAsync()) {
      const { uri } = await FileSystem.downloadAsync(url, target);
      await Sharing.shareAsync(uri, {
        mimeType: mimeTypeFor(extension),
        // Android's chooser title; iOS ignores it.
        dialogTitle: 'Share',
        UTI: extension === 'mp4' ? 'public.movie' : 'public.image',
      });
      return;
    }
  } catch {
    // Download or share failed (offline, expired signed url, no handler) — fall
    // through to the link share rather than leaving the user with nothing.
  }

  await Share.share({ message: url, url }).catch(() => {});
}

/**
 * Signed GCS urls carry a query string, so the extension has to be read from the
 * path only. Anything unrecognised is treated as a JPEG (chat media is images by
 * far the most often, and an image mime on a stray file is harmless).
 */
function guessExtension(url: string): string {
  const path = url.split('?')[0].toLowerCase();
  const match = /\.(jpe?g|png|gif|webp|heic|mp4|mov)$/.exec(path);
  if (!match) return 'jpg';
  return match[1] === 'jpeg' ? 'jpg' : match[1];
}

function mimeTypeFor(extension: string): string {
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    default:
      return 'image/jpeg';
  }
}
