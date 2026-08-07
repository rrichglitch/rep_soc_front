import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { useApp } from '../App';
import { getDbConnection, connectToSpacetimeDB, getProfileByEmail } from '../utils/spacetime';
import { haversineMiles, formatMiles, geocodeCity } from '../utils/geo';
import MapView from '../components/MapView';
import TopBar from '../components/TopBar';
import SearchBar from '../components/SearchBar';
import AuthActions from '../components/AuthActions';

interface SearchResult {
  type: 'person' | 'org';
  identity: string;
  orgId?: bigint;
  email: string;
  fullName: string;
  profilePicture: string;
  city: string;
  description: string;
  locationLat?: number;
  locationLng?: number;
  distance?: number;
}

function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const navigate = useNavigate();
  const auth = useAuth();
  const { email } = useApp();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inputValue, setInputValue] = useState(query);
  const [isConnected, setIsConnected] = useState(false);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyFirst, setNearbyFirst] = useState<boolean>(() => localStorage.getItem('veri_nearbyFirst') === '1');
  const [showMap, setShowMap] = useState<boolean>(() => localStorage.getItem('veri_showMap') === '1');
  const [searchLoc, setSearchLoc] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [showLocModal, setShowLocModal] = useState(false);
  const [locInput, setLocInput] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Persist map-view + nearby-first state across navigation and browser restarts
  useEffect(() => { localStorage.setItem('veri_showMap', showMap ? '1' : '0'); }, [showMap]);
  useEffect(() => { localStorage.setItem('veri_nearbyFirst', nearbyFirst ? '1' : '0'); }, [nearbyFirst]);

  // Background: try to connect
  useEffect(() => {
    const init = async () => {
      try {
        await connectToSpacetimeDB('', undefined);
        setIsConnected(true);
      } catch (e) {
        console.log('Connect failed:', e);
      }
    };
    init();
  }, []);

  // Load my stored location (only if not 'off')
  useEffect(() => {
    if (!email) return;
    getProfileByEmail(email).then(p => {
      if (p && p.locationPrecision !== 'off' && p.locationLat !== undefined && p.locationLng !== undefined) {
        setMyPos({ lat: p.locationLat, lng: p.locationLng });
      }
    }).catch(() => {});
  }, [email, isConnected]);

  // The active reference point: an explicitly set search location wins over the saved one
  const activePos = useMemo(
    () => (searchLoc ? { lat: searchLoc.lat, lng: searchLoc.lng } : myPos),
    [searchLoc, myPos]
  );

  useEffect(() => {
    const searchQuery = async () => {
      if (!query.trim()) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      const db = getDbConnection();
      if (!db) {
        setIsLoading(false);
        return;
      }

      try {
        const searchLower = query.toLowerCase();
        const foundProfiles: SearchResult[] = [];
        
        for (const profile of db.db.user_profile.iter()) {
          const fullName = profile.fullName?.toLowerCase() || '';
          const city = profile.city?.toLowerCase() || '';
          const profileEmail = profile.email?.toLowerCase() || '';

          if (
            fullName.includes(searchLower) ||
            city.includes(searchLower) ||
            profileEmail.includes(searchLower)
          ) {
            const lat = profile.locationLat !== undefined ? profile.locationLat : undefined;
            const lng = profile.locationLng !== undefined ? profile.locationLng : undefined;
            const hasLoc = profile.locationPrecision !== 'off' && lat !== undefined && lng !== undefined;
            foundProfiles.push({
              type: 'person',
              identity: profile.identity?.toHexString() || '',
              email: profile.email,
              fullName: profile.fullName,
              profilePicture: profile.profilePicture || '',
              city: profile.city,
              description: profile.description,
              locationLat: hasLoc ? lat : undefined,
              locationLng: hasLoc ? lng : undefined,
              distance: activePos && hasLoc ? haversineMiles(activePos.lat, activePos.lng, lat!, lng!) : undefined,
            });
          }
        }

        // Search organizations too
        for (const org of db.db.organization.iter()) {
          const orgName = org.name?.toLowerCase() || '';
          const orgCity = org.city?.toLowerCase() || '';
          if (orgName.includes(searchLower) || orgCity.includes(searchLower)) {
            const lat = org.locationLat !== undefined ? org.locationLat : undefined;
            const lng = org.locationLng !== undefined ? org.locationLng : undefined;
            foundProfiles.push({
              type: 'org',
              identity: '',
              orgId: org.id,
              email: '',
              fullName: org.name,
              profilePicture: org.picture || '',
              city: org.city,
              description: org.description,
              locationLat: lat,
              locationLng: lng,
              distance: activePos && lat !== undefined && lng !== undefined ? haversineMiles(activePos.lat, activePos.lng, lat, lng) : undefined,
            });
          }
        }

        // Nearby-first sorting
        if (nearbyFirst) {
          foundProfiles.sort((a, b) => {
            const da = a.distance ?? Infinity;
            const db = b.distance ?? Infinity;
            return da - db;
          });
        }

        setResults(foundProfiles);
      } catch (e) {
        console.error('Search error:', e);
      }
      setIsLoading(false);
    };

    searchQuery();
  }, [query, isConnected, activePos, nearbyFirst]);

  return (
    <div className="search-page">
      <TopBar
        left={<Link to={auth.isAuthenticated ? '/home' : '/'} className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        center={<div className="topbar-search-wrap"><SearchBar
          onSearch={(q) => {
            if (q.trim()) {
              navigate(`/search?q=${encodeURIComponent(q)}`);
            }
          }}
          value={inputValue}
          onChange={setInputValue}
          autoFocus
        /></div>}
        right={<AuthActions />}
        absoluteCenter
      />

      <main className="search-content">

        {isLoading ? (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        ) : results.length === 0 ? (
          query ? (
            <div className="no-results">
              <p>No results found matching "{query}"</p>
            </div>
          ) : (
            <div className="no-results">
              <p>Enter a name, city, or email to search</p>
            </div>
          )
        ) : (
          <>
          <div className="results">
            <div className="results-header">
              <p className="results-count">{results.length} result{results.length !== 1 ? 's' : ''}</p>
              <div className="results-tools">
                {activePos && (
                  <button
                    onClick={() => setNearbyFirst(!nearbyFirst)}
                    className={`nearby-toggle ${nearbyFirst ? 'active' : ''}`}
                  >
                    {nearbyFirst ? '✓ Nearby First' : 'Nearby First'}
                  </button>
                )}
                <button onClick={() => { setLocInput(''); setShowLocModal(true); }} className={`nearby-toggle ${searchLoc ? 'active' : ''}`}>
                  {searchLoc ? `📍 ${searchLoc.label}` : '📍 Set search location'}
                </button>
                <button
                  onClick={() => setShowMap(!showMap)}
                  className={`nearby-toggle ${showMap ? 'active' : ''}`}
                >
                  {showMap ? '✓ Map View' : 'Map View'}
                </button>
              </div>
            </div>
            {!showMap && results.map((result) => {
              const isOwn = result.email === email;
              const linkTo = result.type === 'org' ? `/org/${result.orgId}` : `/profile/${result.identity}`;
              return (
                <Link to={linkTo} key={result.type === 'org' ? `org-${result.orgId}` : result.identity} className="result-card">
                  {result.profilePicture ? (
                    <img src={result.profilePicture} alt={result.fullName} className="result-avatar" />
                  ) : (
                    <div className="result-avatar-placeholder" />
                  )}
                  <div className="result-info">
                    <h3 className="result-name">
                      {result.fullName}
                      {result.type === 'org' && <span className="result-type-badge">Organization</span>}
                      {isOwn && ' (You)'}
                    </h3>
                    {result.city && <p className="result-city">{result.city}</p>}
                    {result.email !== email && result.email && (
                      <p className="result-email">{result.email}</p>
                    )}
                    {result.distance !== undefined && (
                      <p className="result-distance">{formatMiles(result.distance)} away</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
          {showMap && (
            <div className="map-section">
              <MapView
                results={results.filter(r => r.locationLat !== undefined && r.locationLng !== undefined).map(r => ({
                  type: r.type,
                  identity: r.identity,
                  orgId: r.orgId,
                  fullName: r.fullName,
                  profilePicture: r.profilePicture,
                  locationLat: r.locationLat!,
                  locationLng: r.locationLng!,
                }))}
                center={activePos ?? undefined}
                onResultClick={(r) => navigate(r.type === 'org' ? `/org/${r.orgId}` : `/profile/${r.identity}`)}
              />
            </div>
          )}
          </>
        )}
      </main>

      {showLocModal && (
        <div className="loc-search-overlay" onClick={() => setShowLocModal(false)}>
          <div className="loc-search-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Search location</h3>
            <p>Search and map distances will be measured from this place. Leave empty to clear.</p>
            <input
              type="text"
              value={locInput}
              onChange={(e) => setLocInput(e.target.value)}
              placeholder="City or place (e.g. Tokyo)"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (document.getElementById('loc-search-set') as HTMLButtonElement)?.click();
                }
              }}
            />
            <div className="loc-search-actions">
              {searchLoc && (
                <button
                  className="loc-search-clear"
                  onClick={() => {
                    setSearchLoc(null);
                    setShowLocModal(false);
                  }}
                >
                  Clear
                </button>
              )}
              <button className="loc-search-cancel" onClick={() => setShowLocModal(false)}>Cancel</button>
              <button
                id="loc-search-set"
                className="loc-search-set"
                disabled={isGeocoding}
                onClick={async () => {
                  const q = locInput.trim();
                  if (!q) return;
                  setIsGeocoding(true);
                  try {
                    const geo = await geocodeCity(q);
                    if (!geo) {
                      alert('Could not find that place.');
                      return;
                    }
                    setSearchLoc({ label: q, lat: geo.lat, lng: geo.lng });
                    setShowLocModal(false);
                  } finally {
                    setIsGeocoding(false);
                  }
                }}
              >
                {isGeocoding ? 'Finding…' : 'Set location'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .search-page {
          min-height: 100vh;
          background: #f5f5f5;
        }

        .search-content {
          max-width: 600px;
          margin: 0 auto;
          padding: 24px;
        }

        .loading {
          display: flex;
          justify-content: center;
          padding: 48px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e0e0e0;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .no-results {
          text-align: center;
          padding: 48px 24px;
          background: white;
          border-radius: 12px;
        }

        .no-results p {
          color: #666;
          margin: 0;
        }

        .results-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; position: relative; z-index: 45; }
        .results-count { background: white; padding: 4px 12px; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.15); display: inline-block; }
        .results-tools { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .loc-search-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 300; padding: 24px; }
        .loc-search-modal { background: white; border-radius: 12px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        .loc-search-modal h3 { margin: 0 0 8px; color: #333; font-size: 16px; }
        .loc-search-modal p { margin: 0 0 12px; color: #666; font-size: 13px; line-height: 1.4; }
        .loc-search-modal input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; margin-bottom: 14px; }
        .loc-search-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .loc-search-clear { padding: 8px 14px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .loc-search-cancel { padding: 8px 14px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .loc-search-set { padding: 8px 14px; background: #667eea; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .loc-search-set:disabled { opacity: 0.6; }
        .map-section { position: fixed; top: 60px; left: 0; right: 0; bottom: 0; z-index: 40; }
        .map-section .map-view-wrap { height: 100%; border-radius: 0; box-shadow: none; }
        .map-section .map-view { height: 100%; }
        .map-section .leaflet-container { height: 100%; width: 100%; }
        .nearby-toggle { padding: 6px 14px; background: white; color: #667eea; border: 1px solid #667eea; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .nearby-toggle.active { background: #667eea; color: white; }
        .result-type-badge { margin-left: 8px; padding: 2px 8px; background: #eef2ff; color: #3730a3; border-radius: 10px; font-size: 11px; font-weight: 600; vertical-align: middle; }
        .result-distance { margin: 4px 0 0; color: #667eea; font-size: 13px; font-weight: 600; }
        .results-count {
          color: #666;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .result-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: white;
          border-radius: 12px;
          text-decoration: none;
          color: inherit;
          margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .result-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .result-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          object-fit: cover;
        }

        .result-avatar-placeholder {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #e0e0e0;
        }

        .result-info {
          flex: 1;
        }

        .result-name {
          margin: 0 0 4px;
          font-size: 16px;
          color: #333;
        }

        .result-city {
          margin: 0 0 2px;
          font-size: 14px;
          color: #666;
        }

        .result-email {
          margin: 0;
          font-size: 13px;
          color: #999;
        }
      `}</style>
    </div>
  );
}

export default SearchPage;
