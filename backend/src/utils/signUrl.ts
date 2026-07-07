import { mediaStorage } from '../adapters/r2';
import { env } from '../config/env';

const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15 min

/**
 * If `url` points at our own private R2 storage (the S3 API host
 * `*.r2.cloudflarestorage.com`, which is NEVER publicly readable), return the
 * object key so the caller can presign it. Returns null for genuinely public
 * URLs (custom CDN domains, r2.dev, external hosts) which are served as-is.
 *
 * This is needed because MEDIA_BASE_URL is (mis)configured to the private R2
 * endpoint, so upload-url persists absolute private URLs onto messages/photos.
 * Without re-signing, the client fetches an unsigned private object → 403.
 */
function ownR2Key(url: string): string | null {
  let host: string;
  let pathname: string;
  try {
    const u = new URL(url);
    host = u.hostname;
    pathname = decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
  if (!host.endsWith('.r2.cloudflarestorage.com')) return null;
  let key = pathname.replace(/^\/+/, '');
  // Path-style URLs put the bucket first (`endpoint/<bucket>/<key>`); strip it so
  // we presign against env.r2.bucket with just the object key.
  const bucket = env.r2.bucket;
  if (bucket && key.startsWith(`${bucket}/`)) key = key.slice(bucket.length + 1);
  return key || null;
}

/**
 * Signs a storage object path for client-safe delivery.
 * Returns null if the path is falsy (no photo uploaded yet).
 */
export async function signUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  // Local device URI stored by a broken upload fallback — treat as absent rather
  // than trying to sign it as an R2 key (which would produce a 404 URL).
  if (path.startsWith('file://') || path.startsWith('content://')) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    // Our own private R2 URLs must be re-signed; genuine external/CDN URLs pass through.
    const key = ownR2Key(path);
    if (key) return mediaStorage.getSignedUrl(key, SIGNED_URL_TTL_MS);
    return path;
  }
  return mediaStorage.getSignedUrl(path, SIGNED_URL_TTL_MS);
}

/** Sign an array of storage paths in parallel, preserving order. */
export async function signUrls(paths: (string | null | undefined)[]): Promise<(string | null)[]> {
  return Promise.all(paths.map(signUrl));
}
