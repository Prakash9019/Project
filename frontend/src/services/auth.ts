import * as SecureStore from 'expo-secure-store';
import { BASE_URL, generateRequestId } from './config';

const ACCESS_KEY = 'nearme_access_token';
const REFRESH_KEY = 'nearme_refresh_token';

// In-memory cache so synchronous-ish reads are fast; SecureStore is the source of truth.
let accessTokenCache: string | null = null;
let refreshTokenCache: string | null = null;
let hydrated = false;

/** Called when refresh fails — app registers a redirect to /onboarding. */
let onAuthFailure: (() => void) | null = null;
export function setOnAuthFailure(handler: (() => void) | null) {
  onAuthFailure = handler;
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  accessTokenCache = await SecureStore.getItemAsync(ACCESS_KEY);
  refreshTokenCache = await SecureStore.getItemAsync(REFRESH_KEY);
  hydrated = true;
}

export async function getAccessToken(): Promise<string | null> {
  await hydrate();
  return accessTokenCache;
}

export async function getRefreshToken(): Promise<string | null> {
  await hydrate();
  return refreshTokenCache;
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  accessTokenCache = accessToken;
  refreshTokenCache = refreshToken;
  hydrated = true;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  accessTokenCache = null;
  refreshTokenCache = null;
  hydrated = true;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getAccessToken()) != null;
}

/**
 * Exchange the refresh token for a new access+refresh pair.
 * Uses a bare fetch (not the api request wrapper) to avoid recursion.
 * Returns the new access token, or null on failure (tokens cleared, redirect fired).
 */
let refreshInFlight: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) throw new Error('no refresh token');
      const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': generateRequestId(),
        },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      await setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      await clearTokens();
      onAuthFailure?.();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}
