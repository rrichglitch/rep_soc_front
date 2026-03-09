import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../App';
import { getProfileByEmail } from '../utils/spacetime';
import SearchBar from '../components/SearchBar';

function MainFeedPage() {
  const navigate = useNavigate();
  const { email } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [profilePicture, setProfilePicture] = useState<string>('');

  const loadData = async () => {
    if (!email) {
      setIsLoading(false);
      return;
    }
    
    try {
      const profile = await getProfileByEmail(email);
      if (profile) {
        setProfilePicture(profile.profilePicture);
      }
    } catch (e) {
      console.error('Error loading profile:', e);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (email) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
    }
  }, [email]);

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="main-feed-page">
      <header className="header">
        <div className="header-left">
          <h1 className="logo">Reputable Social</h1>
        </div>
        <div className="header-center">
          <SearchBar onSearch={handleSearch} />
        </div>
        <div className="header-right">
          <Link to="/me" className="profile-link">
            {profilePicture ? (
              <img src={profilePicture} alt="My Profile" className="profile-image" />
            ) : (
              <div className="profile-placeholder" />
            )}
          </Link>
        </div>
      </header>

      <main className="main-content">
        <div className="feed">
          <div className="empty-feed">
            <p>No posts yet. Follow some people to see their stories!</p>
            <Link to="/search" className="find-people-link">
              Find People
            </Link>
          </div>
        </div>
      </main>

      <style>{`
        .main-feed-page {
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
          justify-content: space-between;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          z-index: 100;
        }

        .header-left, .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .logo {
          margin: 0;
          font-size: 20px;
          color: #667eea;
        }

        .header-center {
          flex: 1;
          max-width: 400px;
          margin: 0 24px;
        }

        .profile-link {
          display: block;
        }

        .profile-placeholder {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #e0e0e0;
        }

        .profile-image {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
        }

        .main-content {
          max-width: 600px;
          margin: 0 auto;
          padding: 24px;
        }

        .feed h2 {
          margin: 0 0 20px;
          font-size: 18px;
          color: #333;
        }

        .empty-feed {
          text-align: center;
          padding: 48px 24px;
          background: white;
          border-radius: 12px;
        }

        .empty-feed p {
          color: #666;
          margin: 0 0 16px;
        }

        .find-people-link {
          display: inline-block;
          padding: 10px 20px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
        }

        .loading-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
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
      `}</style>
    </div>
  );
}

export default MainFeedPage;
