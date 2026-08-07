import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapResult {
  type: 'person' | 'org';
  identity: string;
  orgId?: bigint;
  fullName: string;
  profilePicture: string;
  description: string;
  city: string;
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
  const markersByKeyRef = useRef<Map<string, L.Marker>>(new Map());
  const onResultClickRef = useRef(onResultClick);
  onResultClickRef.current = onResultClick;
  const [activeCard, setActiveCard] = useState<{ result: MapResult; x: number; y: number } | null>(null);
  const activeCardRef = useRef(activeCard);
  activeCardRef.current = activeCard;
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressUntilRef = useRef(0);
  const hiddenKeysRef = useRef<Set<string>>(new Set());

  const keyOf = (r: MapResult) => (r.type === 'org' ? `org-${r.orgId}` : r.identity);

  // Restore every hidden marker except the one belonging to the currently open card
  const restoreAllHidden = () => {
    const activeKey = activeCardRef.current ? keyOf(activeCardRef.current.result) : null;
    for (const key of hiddenKeysRef.current) {
      if (key === activeKey) continue;
      const mk = markersByKeyRef.current.get(key);
      if (mk) mk.setOpacity(1);
    }
    hiddenKeysRef.current.clear();
    if (activeKey) hiddenKeysRef.current.add(activeKey);
  };

  const hideMarker = (key: string) => {
    const mk = markersByKeyRef.current.get(key);
    if (mk) mk.setOpacity(0);
    hiddenKeysRef.current.add(key);
  };

  const closeCard = () => {
    const card = activeCardRef.current;
    if (!card) return;
    // Restore hidden markers a beat later: restoring while the cursor is still over
    // the marker spot would immediately re-fire mouseover and reopen the card.
    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = setTimeout(() => {
      restoreAllHidden();
      restoreTimerRef.current = null;
    }, 500);
    setActiveCard(null);
  };

  const openCard = (r: MapResult, map: L.Map, lat: number, lng: number) => {
    // Ignore hover-open while the user is panning the map (drag) — cursor crossing
    // markers during a drag would otherwise leave a card stuck open.
    if (Date.now() < suppressUntilRef.current) return;

    // Opening a new card: restore everything else, then hide this marker
    restoreAllHidden();
    if (restoreTimerRef.current) {
      clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }
    hideMarker(keyOf(r));

    // Position: centered exactly on the icon; clamp so it never clips the screen
    const wrap = containerRef.current;
    if (!wrap) return;
    const pt = map.latLngToContainerPoint([lat, lng]);
    const CARD_W = 264;
    const CARD_H = 120;
    const pad = 8;
    let x = pt.x - CARD_W / 2;
    let y = pt.y - CARD_H / 2;
    x = Math.max(pad, Math.min(x, wrap.clientWidth - CARD_W - pad));
    y = Math.max(pad, Math.min(y, wrap.clientHeight - CARD_H - pad));
    setActiveCard({ result: r, x, y });
  };

  // Tap anywhere on the map closes the card (mobile)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMapClick = () => closeCard();
    map.on('click', onMapClick);
    return () => { map.off('click', onMapClick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initCenter: [number, number] = center ? [center.lat, center.lng] : [39.5, -98.35]; // US default
    const map = L.map(containerRef.current, {
      center: initCenter,
      zoom: center ? 9 : 4,
      zoomControl: false,
    });
    // CARTO Voyager: colorful basemap (green parks, blue water) with city labels,
    // less POI clutter than raw OSM. This map is for discovery, not navigation.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Panning the map: close any open card and suppress hover-open briefly
    const onDragStart = () => {
      suppressUntilRef.current = Date.now() + 600;
      closeCard();
    };
    map.on('dragstart', onDragStart);
    map.on('movestart', onDragStart);

    return () => {
      map.off('dragstart', onDragStart);
      map.off('movestart', onDragStart);
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      markersByKeyRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers on results / zoom change
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    markersByKeyRef.current.clear();
    hiddenKeysRef.current.clear();
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
        const mk = L.marker([lat, lng], { icon })
          .on('mouseover', () => openCard(r, map, lat, lng))
          .on('click', () => openCard(r, map, lat, lng))
          .addTo(layer);
        markersByKeyRef.current.set(r.type === 'org' ? `org-${r.orgId}` : r.identity, mk);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, center]);

  return (
    <div className="map-view-wrap">
      <div ref={containerRef} className="map-view" />
      {activeCard && (
        <div
          className="map-profile-card"
          style={{ left: activeCard.x, top: activeCard.y }}
          onMouseLeave={closeCard}
          onClick={() => onResultClickRef.current(activeCard.result)}
        >
          {activeCard.result.profilePicture ? (
            <img src={activeCard.result.profilePicture} alt={activeCard.result.fullName} className="mpc-pic" />
          ) : (
            <div className="mpc-pic mpc-pic-placeholder" />
          )}
          <div className="mpc-info">
            <h4 className="mpc-name">
              {activeCard.result.fullName}
              {activeCard.result.type === 'org' && <span className="mpc-org-badge">Organization</span>}
            </h4>
            {activeCard.result.description && <p className="mpc-desc">{activeCard.result.description}</p>}
          </div>
        </div>
      )}
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
        .map-profile-card {
          position: absolute;
          width: 264px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.25);
          z-index: 500;
          cursor: pointer;
          border: 1px solid #e5e7eb;
          box-sizing: border-box;
        }
        .mpc-pic { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .mpc-pic-placeholder { background: #e0e0e0; }
        .mpc-info { flex: 1; min-width: 0; }
        .mpc-name { margin: 0 0 4px; font-size: 16px; font-weight: 700; color: #333; }
        .mpc-org-badge { margin-left: 6px; padding: 1px 7px; background: #eef2ff; color: #3730a3; border-radius: 10px; font-size: 10px; font-weight: 600; vertical-align: middle; }
        .mpc-desc {
          margin: 0; font-size: 12px; color: #666; line-height: 1.35;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
      `}</style>
    </div>
  );
}

export default MapView;
