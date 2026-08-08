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
// Always a deliberate one-shot user action (registration / city set / precise toggle),
// so request a fresh, accurate fix: no stale cache, GPS-assisted when available.
export function getBrowserLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not supported on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// Reverse geocode coordinates to a city name via OpenStreetMap Nominatim (no API key)
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.county || a.state_district || a.state || null;
    if (!city) return null;
    // Use the state code (ISO3166-2-lvl4 like "US-NY") instead of the full state name
    let stateCode = '';
    if (a.state && a.state !== city) {
      const iso = a['ISO3166-2-lvl4'];
      stateCode = iso ? `, ${iso.split('-').pop()}` : `, ${a.state}`;
    }
    return `${city}${stateCode}`;
  } catch {
    return null;
  }
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
