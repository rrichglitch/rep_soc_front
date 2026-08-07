// Geo helpers: distance, geocoding, geolocation

// Haversine distance in miles between two coordinates
export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatMiles(miles: number): string {
  if (miles < 1) return `${Math.max(1, Math.round(miles * 5280))} ft`;
  if (miles < 100) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

// Jitter coordinates by up to maxMiles in a random direction (frontend-side approximation).
// Perfect circular jitter: uniform disk sampling (sqrt radius) — not an X/Y box.
export function jitterLocation(lat: number, lng: number, maxMiles: number): { lat: number; lng: number } {
  const maxDeg = maxMiles / 69;
  const theta = Math.random() * 2 * Math.PI;
  const r = maxDeg * Math.sqrt(Math.random());
  const dLat = Math.cos(theta) * r;
  const dLng = (Math.sin(theta) * r) / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

// Browser geolocation as a promise
// NOTE: default accuracy (not high) + short timeout + long cache — high-accuracy GPS
// acquisition pegs the device radio and makes the whole app sluggish on mobile.
export function getBrowserLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not supported on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}

// Geocode a city name to coordinates via OpenStreetMap Nominatim (no API key)
export async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  if (!city.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}
