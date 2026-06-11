import { env } from '../config/env';

/**
 * Fuzzy location logic (privacy requirement): precise GPS coordinates are NEVER
 * returned to clients — only a coarse, rounded relative distance.
 */
export function fuzzDistanceKm(meters: number): number {
  const km = meters / 1000;
  const fuzz = env.grid.distanceFuzzKm;
  return Math.max(fuzz, Math.round(km / fuzz) * fuzz);
}

/** Human-friendly label, e.g. "0.4 km away". */
export function distanceLabel(meters: number): string {
  const km = fuzzDistanceKm(meters);
  return `${km.toFixed(1)} km away`;
}

/** "Active now" / "Active 10 mins ago" style status from a lastActive timestamp. */
export function activityStatus(lastActiveAt: Date): { online: boolean; label: string } {
  const diffSec = Math.floor((Date.now() - lastActiveAt.getTime()) / 1000);
  if (diffSec <= env.grid.onlineWindowSeconds) return { online: true, label: 'Active Now' };
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return { online: false, label: `Active ${mins} min${mins === 1 ? '' : 's'} ago` };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { online: false, label: `Active ${hours} hr${hours === 1 ? '' : 's'} ago` };
  const days = Math.floor(hours / 24);
  return { online: false, label: `Active ${days} day${days === 1 ? '' : 's'} ago` };
}

/** Coarse geohash-ish bucket (4 decimals ≈ 11m) used to scope feed boosts to a geofence. */
export function coarseGeohash(lat: number, lng: number): string {
  return `${lat.toFixed(3)}:${lng.toFixed(3)}`;
}

export function isValidLat(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLng(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/**
 * Round coordinates to the nearest ~500m grid to prevent precise location tracking
 * in the Redis geo-index. 0.005 degrees ≈ 555m at equator, ~350m at 50°N.
 * Exact coordinates are never stored — only this fuzzy bucket.
 */
export function fuzzyCoordinates(lat: number, lng: number): { lat: number; lng: number } {
  const GRID = 0.005;
  return {
    lat: Math.round(lat / GRID) * GRID,
    lng: Math.round(lng / GRID) * GRID,
  };
}
