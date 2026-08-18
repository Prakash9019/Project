import * as VideoThumbnails from 'expo-video-thumbnails';
import { uploadToR2 } from './uploadToR2';

/**
 * Generate a poster frame for a local video and upload it to R2, returning the
 * stored key (or null if either step fails).
 *
 * Thumbnails are generated CLIENT-side because the backend never decodes media —
 * it stores whatever `thumbnailUrl` it is given (see 20260726_video_and_duration).
 *
 * Failure is deliberately non-fatal: a video with no poster still sends and
 * plays, it just falls back to a neutral placeholder tile. Blocking the send on
 * a thumbnail we could not decode would be a worse trade.
 */
export async function generateAndUploadVideoThumbnail(videoUri: string): Promise<string | null> {
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      // `time` is in MILLISECONDS. 0 would land on a frame that is often black
      // (fade-ins, camera warm-up), so sample a beat into the clip instead.
      time: 500,
      quality: 0.7,
    });
    // Poster frames are ordinary JPEGs — reuse the image upload type.
    return await uploadToR2(uri, 'room_image', 'image/jpeg');
  } catch {
    return null;
  }
}
