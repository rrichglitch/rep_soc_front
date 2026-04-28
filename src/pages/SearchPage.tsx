import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../App';
import { getDbConnection, connectToSpacetimeDB } from '../utils/spacetime';
import TopBar from '../components/TopBar';
import SearchBar from '../components/SearchBar';
import AuthActions from '../components/AuthActions';

interface SearchResult {
  identity: string;
  email: string;
  fullName: string;
  profilePicture: string;
  city: string;
  description: string;
}

function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const navigate = useNavigate();
  const { email } = useApp();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inputValue, setInputValue] = useState(query);
  const [isConnected, setIsConnected] = useState(false);

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
            foundProfiles.push({
              identity: profile.identity?.toHexString() || '',
              email: profile.email,
              fullName: profile.fullName,
              profilePicture: profile.profilePicture || '',
              city: profile.city,
              description: profile.description,
            });
          }
        }

        setResults(foundProfiles);
      } catch (e) {
        console.error('Search error:', e);
      }
      setIsLoading(false);
    };

    searchQuery();
  }, [query, isConnected]);

  return (
    <div className="search-page">
      <TopBar
        left={<Link to="/" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>}
        center={<h1 className="page-title">Find People</h1>}
        right={<AuthActions />}
      />

      <div className="search-sticky">
        <SearchBar
          onSearch={(q) => {
            if (q.trim()) {
              navigate(`/search?q=${encodeURIComponent(q)}`);
            }
          }}
          value={inputValue}
          onChange={setInputValue}
          autoFocus
        />
      </div>

      <main className="search-content">

        {isLoading ? (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        ) : results.length === 0 ? (
          query ? (
            <div className="no-results">
              <p>No people found matching "{query}"</p>
            </div>
          ) : (
            <div className="no-results">
              <p>Enter a name, city, or email to search</p>
            </div>
          )
        ) : (
          <div className="results">
            <p className="results-count">{results.length} result{results.length !== 1 ? 's' : ''}</p>
            {results.map((result) => {
              const isOwn = result.email === email;
              return (
                <Link to={`/profile/${result.identity}`} key={result.identity} className="result-card">
                  {result.profilePicture ? (
                    <img src={result.profilePicture} alt={result.fullName} className="result-avatar" />
                  ) : (
                    <div className="result-avatar-placeholder" />
                  )}
                  <div className="result-info">
                    <h3 className="result-name">{result.fullName}{isOwn && ' (You)'}</h3>
                    {result.city && <p className="result-city">{result.city}</p>}
                    {result.email !== email && (
                      <p className="result-email">{result.email}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <style>{`
        .search-page {
          min-height: 100vh;
          background: #f5f5f5;
        }

        .page-title {
          margin: 0;
          font-size: 20px;
          color: #667eea;
          width: 100%;
          text-align: center;
        }

        .search-sticky {
          position: sticky;
          top: 60px;
          background: #f5f5f5;
          padding: 16px 24px;
          z-index: 50;
        }

        .search-sticky .search-bar {
          max-width: 500px;
          margin: 0 auto;
          background: white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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
