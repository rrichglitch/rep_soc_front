import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../App';
import { useAuth } from 'react-oidc-context';
import { getDbConnection, connectToSpacetimeDB, getProfileByEmail } from '../utils/spacetime';

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
  const auth = useAuth();
  const { email } = useApp();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inputValue, setInputValue] = useState(query);
  const [isConnected, setIsConnected] = useState(false);

  const isAuthenticated = auth.isAuthenticated;
  const [profilePicture, setProfilePicture] = useState<string>('');

  const handleSignIn = () => {
    auth.signinRedirect();
  };

  useEffect(() => {
    const loadProfile = async () => {
      let userEmail = email;
      
      if (!userEmail && auth.user?.id_token) {
        try {
          const payload = JSON.parse(atob(auth.user.id_token.split('.')[1]));
          userEmail = payload.email;
        } catch (e) {
          console.error('Failed to parse token:', e);
        }
      }
      
      if (userEmail) {
        const profile = await getProfileByEmail(userEmail);
        if (profile) {
          setProfilePicture(profile.profilePicture);
        }
      }
    };
    loadProfile();
  }, [email, auth.user]);

  useEffect(() => {
    const tryAutoConnect = async () => {
      const db = getDbConnection();
      if (db) {
        console.log('DB already connected');
        setIsConnected(true);
        return;
      }
      
      const token = auth.user?.access_token;
      
      try {
        console.log(token ? 'Connecting with token...' : 'Connecting anonymously...');
        await connectToSpacetimeDB('', token);
        console.log('Connected to SpacetimeDB!');
        setIsConnected(true);
      } catch (e) {
        console.error('Auto-connect failed:', e);
      }
    };
    
    const timer = setTimeout(tryAutoConnect, 500);
    return () => clearTimeout(timer);
  }, [isAuthenticated, auth.user]);

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      navigate(`/search?q=${encodeURIComponent(inputValue)}`);
    }
  };

  return (
    <div className="search-page">
      <header className="header">
        <div className="header-left">
          <Link to="/" className="back-button">← Back</Link>
        </div>
        <div className="header-center">
          <h1 className="page-title">Find People</h1>
        </div>
        <div className="header-right">
          {isAuthenticated ? (
            <Link to="/me" className="profile-link">
              {profilePicture ? (
                <img src={profilePicture} alt="My Profile" className="profile-image" />
              ) : (
                <div className="profile-placeholder" />
              )}
            </Link>
          ) : (
            <button onClick={handleSignIn} className="signin-button">
              Sign In
            </button>
          )}
        </div>
      </header>

      <main className="search-content">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search people..."
            className="search-input"
            autoFocus
          />
          <button type="submit" className="search-button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
        </form>

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

        .header {
          position: sticky;
          top: 0;
          background: white;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          z-index: 100;
        }

        .header-left {
          display: flex;
          align-items: center;
          width: 60px;
        }

        .header-center {
          flex: 1;
          text-align: center;
        }

        .header-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-width: 80px;
        }

        .back-button {
          color: #667eea;
          background: none;
          border: none;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          text-decoration: none;
        }

        .signin-button {
          padding: 8px 16px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .signin-button:hover {
          background: #5a6fd6;
        }

        .profile-link {
          display: block;
        }

        .profile-image {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
        }

        .profile-placeholder {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #e0e0e0;
        }

        .page-title {
          margin: 0;
          font-size: 20px;
          color: #667eea;
        }

        .search-content {
          max-width: 600px;
          margin: 0 auto;
          padding: 24px;
        }

        .search-form {
          display: flex;
          align-items: center;
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 24px;
        }

        .search-input {
          flex: 1;
          padding: 14px 16px;
          border: none;
          font-size: 16px;
          outline: none;
        }

        .search-button {
          padding: 14px 16px;
          background: transparent;
          border: none;
          color: #666;
          cursor: pointer;
        }

        .search-button:hover {
          color: #667eea;
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
