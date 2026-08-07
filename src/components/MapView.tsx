import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapResult {
  type: 'person' | 'org';
  identity: string;
  orgId?: bigint;
  fullName: string;
  profilePicture: string;
  locationLat: number;
  locationLng: number;
}

interface MapViewProps {
  results: MapResult[];
  center?: { lat: number; lng: number };
  onResultClick: (r: MapResult) => void;
}

// Grid-cell clustering: max one marker per CELL_PX x CELL_PX pixels (hard cap per pixel area)
const CELL_PX = 44;

function MapView({ results, center, onResultClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const onResultClickRef = useRef(onResultClick);
  onResultClickRef.current = onResultClick;

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initCenter: [number, number] = center ? [center.lat, center.lng] : [39.5, -98.35]; // US default
    const map = L.map(containerRef.current, {
      center: initCenter,
      zoom: center ? 9 : 4,
      zoomControl: false,
    });
    // CARTO Positron: minimal basemap — keeps city labels, drops POI clutter.
    // This map is for discovery, not navigation; zoom via scroll/pinch.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers on results / zoom change
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const withCoords = results.filter(r => r.locationLat !== undefined && r.locationLng !== undefined);
    if (withCoords.length === 0) return;

    // Always start at the active search location (user's saved location by default);
    // only fit the results when there is no location to center on.
    if (center) {
      map.setView([center.lat, center.lng], 10);
    } else {
      const bounds = L.latLngBounds(withCoords.map(r => [r.locationLat, r.locationLng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
    const zoom = map.getZoom();

    // Cluster by world-pixel grid at the current zoom
    const cells = new Map<string, MapResult[]>();
    for (const r of withCoords) {
      const pt = map.project([r.locationLat, r.locationLng], zoom);
      const key = `${Math.floor(pt.x / CELL_PX)}:${Math.floor(pt.y / CELL_PX)}`;
      const arr = cells.get(key);
      if (arr) arr.push(r);
      else cells.set(key, [r]);
    }

    for (const group of cells.values()) {
      const lat = group.reduce((s, r) => s + r.locationLat, 0) / group.length;
      const lng = group.reduce((s, r) => s + r.locationLng, 0) / group.length;
      if (group.length === 1) {
        const r = group[0];
        const icon = L.divIcon({
          className: '',
          html: `<div class="map-marker ${r.type === 'org' ? 'map-marker-org' : ''}" ${
            r.profilePicture ? `style="background-image:url('${r.profilePicture}')"` : ''
          }></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        L.marker([lat, lng], { icon })
          .bindTooltip(r.fullName, { direction: 'top' })
          .on('click', () => onResultClickRef.current(r))
          .addTo(layer);
      } else {
        const icon = L.divIcon({
          className: '',
          html: `<div class="map-cluster">${group.length}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        L.marker([lat, lng], { icon })
          .bindTooltip(`${group.length} results`, { direction: 'top' })
          .on('click', () => map.setView([lat, lng], Math.min(zoom + 2, 18)))
          .addTo(layer);
      }
    }
  }, [results, center]);

  return (
    <div className="map-view-wrap">
      <div ref={containerRef} className="map-view" />
      <style>{`
        .map-view-wrap { position: relative; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .map-view { height: 60vh; width: 100%; z-index: 1; }
        .map-view .leaflet-container { height: 100%; width: 100%; }
        .map-marker {
          width: 30px; height: 30px; border-radius: 50%;
          background: #667eea no-repeat center / cover;
          border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          box-sizing: border-box;
        }
        .map-marker-org { background-color: #22c55e; }
        .map-cluster {
          width: 30px; height: 30px; border-radius: 50%;
          background: #3730a3; color: white; font-weight: 700; font-size: 13px;
          display: flex; align-items: center; justify-content: center;
          border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}

export default MapView;
