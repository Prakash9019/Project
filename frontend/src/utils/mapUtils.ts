/**
 * Privacy-safe map placement helpers.
 *
 * NearMe never sends another user's exact lat/lng to the client — the API only
 * returns `distanceLabel` (a fuzzy string) and `hasLocation` (boolean). To draw
 * a meaningful Snapchat-style map we derive an APPROXIMATE marker position from
 * distance + a deterministic per-user bearing, so markers never jump between
 * refreshes but also never reveal a real location.
 */

const EARTH_RADIUS_M = 6_371_000;

/** Cheap, fast, deterministic 32-bit string hash (FNV-1a). */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Parses a server distanceLabel ("0.8 km away", "< 1 km away", "Near you") into meters, or null if unusable. */
export function parseDistanceLabelToMeters(distanceLabel: string | null | undefined): number | null {
  if (!distanceLabel) return null;
  const match = distanceLabel.match(/([\d.]+)\s*km/i);
  if (match) return parseFloat(match[1]) * 1000;
  if (/near you/i.test(distanceLabel)) return 250; // Gold+ hidden-distance placeholder — keep close but fuzzy
  if (/< ?1 ?km/i.test(distanceLabel)) return 500;
  return null;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Places a marker at an approximate position derived from distance + a
 * deterministic bearing seeded by userId (same user always gets the same
 * direction, so markers don't jump on refresh) plus a small stable jitter.
 * This NEVER uses or requires the user's real coordinates.
 */
export function approximateMarkerPosition(
  viewerLat: number,
  viewerLng: number,
  distanceM: number,
  userId: string,
): LatLng {
  const seed = hashString(userId);
  // Bearing: 0-360°, deterministic per user.
  const bearingDeg = seed % 360;
  // Small deterministic jitter (±8%) so markers at the same distance/bearing
  // bucket don't perfectly overlap, without adding real randomness.
  const jitterSeed = hashString(`${userId}:jitter`);
  const jitterFactor = 0.92 + (jitterSeed % 1000) / 1000 / 6.25; // 0.92–1.08

  const distance = Math.max(distanceM, 50) * jitterFactor;
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const latRad = (viewerLat * Math.PI) / 180;
  const lngRad = (viewerLng * Math.PI) / 180;
  const angularDistance = distance / EARTH_RADIUS_M;

  const destLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad),
  );
  const destLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destLatRad),
    );

  return {
    lat: (destLatRad * 180) / Math.PI,
    lng: (((destLngRad * 180) / Math.PI + 540) % 360) - 180, // normalize to [-180, 180]
  };
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Great-circle distance between two points, in meters. */
export function distanceBetween(a: LatLng, b: LatLng): number {
  const latRad1 = (a.lat * Math.PI) / 180;
  const latRad2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(latRad1) * Math.cos(latRad2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True if a point lies within a region expanded by a fractional buffer (e.g. 0.2 = 20% padding). */
export function isPositionInRegion(pos: LatLng, region: MapRegion, buffer = 0.2): boolean {
  const latPad = region.latitudeDelta * (0.5 + buffer);
  const lngPad = region.longitudeDelta * (0.5 + buffer);
  return (
    Math.abs(pos.lat - region.latitude) <= latPad &&
    Math.abs(pos.lng - region.longitude) <= lngPad
  );
}

/**
 * Manual clustering fallback (used only if react-native-map-clustering is
 * unavailable). Groups points within `cellDegrees` of each other into a grid
 * cell and returns one cluster per non-empty cell.
 */
export interface ClusterPoint<T> {
  position: LatLng;
  item: T;
}
export interface Cluster<T> {
  position: LatLng;
  points: ClusterPoint<T>[];
}

export function clusterPoints<T>(points: ClusterPoint<T>[], region: MapRegion): Cluster<T>[] {
  // Cell size scales with current zoom so clusters merge/split as the user
  // pans/zooms — roughly 50 screen-px worth of degrees at this region's zoom.
  const cellDegrees = Math.max(region.latitudeDelta, region.longitudeDelta) / 8;
  const buckets = new Map<string, ClusterPoint<T>[]>();

  for (const p of points) {
    const key = `${Math.round(p.position.lat / cellDegrees)}:${Math.round(p.position.lng / cellDegrees)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p);
    else buckets.set(key, [p]);
  }

  return Array.from(buckets.values()).map((groupPoints) => {
    const lat = groupPoints.reduce((sum, p) => sum + p.position.lat, 0) / groupPoints.length;
    const lng = groupPoints.reduce((sum, p) => sum + p.position.lng, 0) / groupPoints.length;
    return { position: { lat, lng }, points: groupPoints };
  });
}

/** Cluster marker size/font tier by member count. */
export function clusterSizeTier(count: number): 'small' | 'medium' | 'large' {
  if (count < 10) return 'small';
  if (count < 100) return 'medium';
  return 'large';
}
