import { env } from '../config/env';
import { withTimeout } from '../utils/withTimeout';

export interface GeocodingResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

async function geocodeCityRaw(city: string, country: string): Promise<GeocodingResult | null> {
  const apiKey = env.googleMaps.serverApiKey;

  if (!apiKey) {
    // Dev stub: return deterministic fake coords based on city name hash
    const hash = [...city].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return {
      lat: 12.9716 + (hash % 100) * 0.01,
      lng: 77.5946 + (hash % 100) * 0.01,
      formattedAddress: `${city}, ${country}`,
    };
  }

  const query = encodeURIComponent(`${city}, ${country}`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`;

  const resp = await fetch(url);
  if (!resp.ok) return null;

  const data = await resp.json() as {
    status: string;
    results: Array<{
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
    }>;
  };

  if (data.status !== 'OK' || !data.results.length) return null;

  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng, formattedAddress: data.results[0].formatted_address };
}

export async function geocodeCity(city: string, country: string): Promise<GeocodingResult | null> {
  return withTimeout(geocodeCityRaw(city, country), 5000, null);
}
