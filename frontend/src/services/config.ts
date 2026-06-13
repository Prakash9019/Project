/** Shared service config. Kept separate to avoid circular imports. */

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

/** RFC4122-ish v4 id for the X-Request-ID header (no crypto dependency). */
export function generateRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
