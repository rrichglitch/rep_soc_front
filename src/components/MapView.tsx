import { useCallback, useEffect, useRef, useState } from 'react';
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

// HTML-escape user content interpolated into popup/divIcon strings
const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function MapView({ results, center, onResultClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const onResultClickRef = useRef(onResultClick);
  onResultClickRef.current = onResultClick;
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const draggingRef = useRef(false);
  const [activeCard, setActiveCard] = useState<{ result: MapResult; x: number; y: number } | null>(null);

  // Simple model: card is open while hovered/tapped, marker present when not.
  // The card is centered exactly on its marker, so it covers the icon — no marker
  // opacity juggling needed. Closing is just clearing the card state.
  const closeCard = useCallback(() => setActiveCard(null), []);

  const openCard = useCallback((r: MapResult, map: L.Map, lat: number, lng: number) => {
    // Don't open cards mid-pan: cursor sweeps across markers while dragging
    if (draggingRef.current) return;

    // Position: centered exactly on the icon; clamp so it never clips the screen
    const wrap = containerRef.current;
    if (!wrap) return;
    const pt = map.latLngToContainerPoint([lat, lng]);
    const CARD_W = 340;
    const CARD_H = 160;
    const pad = 8;
    let x = pt.x - CARD_W / 2;
    let y = pt.y - CARD_H / 2;
    x = Math.max(pad, Math.min(x, wrap.clientWidth - CARD_W - pad));
    y = Math.max(pad, Math.min(y, wrap.clientHeight - CARD_H - pad));
    setActiveCard({ result: r, x, y });
  }, []);

  // Draw one badge per 44px grid cell at the CURRENT zoom (one marker per cell,
  // hard cap per pixel area). Clustering depends on the zoom level, so this must
  // re-run on every zoom change — a badge's job is to be clicked, zoom you in,
  // and then be redrawn split into the results it was hiding.
  const renderMarkers = useCallback(
    (map: L.Map, layer: L.LayerGroup) => {
      layer.clearLayers();
      map.closePopup();

      const zoom = map.getZoom();
      const withCoords = resultsRef.current.filter(
        r => r.locationLat !== undefined && r.locationLng !== undefined
      );
      if (withCoords.length === 0) return;

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
            .on('mouseover', () => openCard(r, map, lat, lng))
            .on('click', () => openCard(r, map, lat, lng))
            .addTo(layer);
        } else {
          // Zooming separates what the cell merged — as long as the members are
          // more than one cell apart at max zoom. If they sit on (nearly) the
          // same point no zoom level can split them, so clicking the badge then
          // opens a list of the grouped results instead of a no-op zoom.
          const MAX_ZOOM = 18;
          const canSplit = group.some((a, i) =>
            group.slice(i + 1).some(b => {
              const p = map.project([a.locationLat, a.locationLng], MAX_ZOOM);
              const q = map.project([b.locationLat, b.locationLng], MAX_ZOOM);
              return Math.abs(p.x - q.x) > CELL_PX || Math.abs(p.y - q.y) > CELL_PX;
            })
          );
          const icon = L.divIcon({
            className: '',
            html: `<div class="map-cluster">${group.length}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
          const marker = L.marker([lat, lng], { icon })
            .bindTooltip(`${group.length} results`, { direction: 'top' })
            .addTo(layer);
          if (canSplit) {
            // Zoom in on exactly this group: framing its bounds separates the
            // members (re-render happens on zoomend) in a single click.
            marker.on('click', () => {
              const bounds = L.latLngBounds(
                group.map(r => [r.locationLat, r.locationLng] as [number, number])
              );
              map.fitBounds(bounds, { padding: [40, 40], maxZoom: MAX_ZOOM });
            });
          } else {
            const popup = L.popup({
              className: 'map-cluster-popup',
              maxWidth: 300,
              closeButton: false,
            })
              .setLatLng([lat, lng])
              .setContent(
                `<div class="mcp-head">${group.length} results</div>` +
                  group
                    .map(
                      r =>
                        // Org results carry identity_hex '' from the backend, so a
                        // lookup by identity alone would resolve every org row to
                        // the FIRST org in the group. Key org rows by orgId instead.
                        `<div class="mcp-row" data-identity="${esc(r.identity)}" data-org="${
                          r.type === 'org' ? esc(`${r.orgId ?? ''}`) : ''
                        }">` +
                        (r.profilePicture
                          ? `<img class="mcp-row-pic" src="${esc(r.profilePicture)}" alt="" />`
                          : `<div class="mcp-row-pic mcp-row-pic-empty"></div>`) +
                        `<div class="mcp-row-name">${esc(r.fullName)}${r.type === 'org' ? '<span class="mcp-row-org">Organization</span>' : ''}</div>` +
                        `</div>`
                    )
                    .join('')
              );
            marker.on('click', () => {
              if (popup.isOpen()) {
                map.closePopup(popup);
                return;
              }
              map.openPopup(popup);
              const el = popup.getElement();
              if (!el) return;
              el.querySelectorAll<HTMLElement>('.mcp-row').forEach(row => {
                row.addEventListener('click', e => {
                  e.stopPropagation();
                  map.closePopup(popup);
                  const hit = group.find(r =>
                    r.type === 'org'
                      ? row.dataset.org === `${r.orgId ?? ''}`
                      : r.identity === row.dataset.identity
                  );
                  // Same navigation path as the profile card: straight to the profile page.
                  if (hit) onResultClickRef.current(hit);
                });
              });
            });
          }
        }
      }
    },
    [openCard]
  );

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initCenter: [number, number] = center ? [center.lat, center.lng] : [39.5, -98.35]; // US default
    const map = L.map(containerRef.current, {
      center: initCenter,
      zoom: center ? 9 : 4,
      zoomControl: false,
    });
    // Humanitarian (HOT) style: keyless, pastel + zero label clutter — closest
    // keyless match to the old CARTO Voyager look.
    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Panning/zooming: close any open card and ignore hover-opens while dragging
    const onDragStart = () => {
      draggingRef.current = true;
      closeCard();
    };
    const onDragEnd = () => {
      draggingRef.current = false;
    };
    // Clusters are a function of zoom: re-draw them on every zoom change, or a
    // clicked badge zooms the map while the same badge stays drawn on top and
    // the grouped results never separate.
    const onZoomEnd = () => {
      const mapNow = mapRef.current;
      const layer = markersRef.current;
      if (mapNow && layer) renderMarkers(mapNow, layer);
    };
    // Mobile: tapping anywhere on the map closes the card
    map.on('dragstart', onDragStart);
    map.on('dragend', onDragEnd);
    map.on('zoomstart', closeCard);
    map.on('zoomend', onZoomEnd);
    map.on('click', closeCard);

    return () => {
      map.off('dragstart', onDragStart);
      map.off('dragend', onDragEnd);
      map.off('zoomstart', closeCard);
      map.off('zoomend', onZoomEnd);
      map.off('click', closeCard);
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-draw markers on results / search-location change
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;

    const withCoords = results.filter(r => r.locationLat !== undefined && r.locationLng !== undefined);
    if (withCoords.length === 0) {
      layer.clearLayers();
      return;
    }

    // Always start at the active search location (user's saved location by default);
    // only fit the results when there is no location to center on.
    if (center) {
      map.setView([center.lat, center.lng], 10);
    } else {
      const bounds = L.latLngBounds(withCoords.map(r => [r.locationLat, r.locationLng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
    renderMarkers(map, layer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, center, renderMarkers]);

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
        .map-cluster-popup .leaflet-popup-content-wrapper {
          border-radius: 12px; padding: 6px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.25);
        }
        .map-cluster-popup .leaflet-popup-content {
          margin: 6px; min-width: 200px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .mcp-head {
          font-size: 13px; font-weight: 700; color: #3730a3; padding: 6px 8px 8px;
        }
        .mcp-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px; border-radius: 8px; cursor: pointer;
        }
        .mcp-row:hover { background: #f3f4f6; }
        .mcp-row-pic {
          width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
          flex-shrink: 0; border: 3px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2); box-sizing: border-box;
        }
        .mcp-row-pic-empty { background: #e0e0e0; }
        .mcp-row-name { font-size: 14px; font-weight: 600; color: #333; min-width: 0; }
        .mcp-row-org {
          margin-left: 6px; padding: 2px 8px; background: #eef2ff; color: #3730a3;
          border-radius: 10px; font-size: 11px; font-weight: 600;
          vertical-align: middle; white-space: nowrap;
        }
        .map-profile-card {
          position: absolute;
          width: 340px;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.25);
          z-index: 500;
          cursor: pointer;
          border: 1px solid #e5e7eb;
          box-sizing: border-box;
        }
        .mpc-pic { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .mpc-pic-placeholder { background: #e0e0e0; }
        .mpc-info { flex: 1; min-width: 0; }
        .mpc-name { margin: 0 0 6px; font-size: 20px; font-weight: 700; color: #333; }
        .mpc-org-badge { margin-left: 6px; padding: 2px 8px; background: #eef2ff; color: #3730a3; border-radius: 10px; font-size: 11px; font-weight: 600; vertical-align: middle; }
        .mpc-desc {
          margin: 0; font-size: 14px; color: #666; line-height: 1.4;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
        }
      `}</style>
    </div>
  );
}

export default MapView;
