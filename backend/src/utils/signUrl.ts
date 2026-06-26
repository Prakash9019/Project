import { gcs } from '../adapters/gcs';

const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15 min

/**
 * Signs a storage object path for client-safe delivery.
 * Returns null if the path is falsy (no photo uploaded yet).
 */
export async function signUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  // Already a fully-qualified external URL (legacy data or external CDN) — return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // Local device URI stored by a broken upload fallback — treat as absent rather
  // than trying to sign it as an R2 key (which would produce a 404 URL).
  if (path.startsWith('file://') || path.startsWith('content://')) return null;
  return gcs.getSignedUrl(path, SIGNED_URL_TTL_MS);
}

/** Sign an array of storage paths in parallel, preserving order. */
export async function signUrls(paths: (string | null | undefined)[]): Promise<(string | null)[]> {
  return Promise.all(paths.map(signUrl));
}
