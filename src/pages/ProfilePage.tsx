import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApp } from '../App';
import ProfileHeader from '../components/ProfileHeader';

interface UserProfile {
  identity: string;
  full_name: string;
  profile_picture: string;
  city: string;
  description: string;
  created_at: Date;
}

function ProfilePage() {
  const { identity: profileIdentity } = useParams<{ identity: string }>();
  const { identity: currentIdentity } = useApp();
  const [profile] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = async () => {
    setIsLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile();
  }, [profileIdentity, currentIdentity]);

  const handleFollowChange = (following: boolean) => {
    setIsFollowing(following);
  };

  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  const isOwnProfile = currentIdentity?.toHexString() === profileIdentity;

  const placeholderProfile: UserProfile = {
    identity: profileIdentity || '',
    full_name: 'Loading...',
    profile_picture: '',
    city: '',
    description: '',
    created_at: new Date(),
  };

  return (
    <div className="profile-page">
      <header className="header">
        <Link to="/" className="back-link">
          ← Back
        </Link>
        <h1 className="logo">Reputable Social</h1>
        <div className="header-spacer"></div>
      </header>

      <main className="main-content">
        <ProfileHeader
          profile={profile || placeholderProfile}
          isOwnProfile={isOwnProfile}
          isFollowing={isFollowing}
          onFollowChange={handleFollowChange}
        />

        {!isOwnProfile && (
          <div className="story-prompt">
            <p>Tell a true story about {(profile || placeholderProfile).full_name}...</p>
          </div>
        )}

        <div className="story-section">
          <h2>Story</h2>
          <div className="empty-story">
            <p>No stories yet.</p>
          </div>
        </div>
      </main>

      <style>{`
        .profile-page {
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
        }

        .back-link {
          color: #667eea;
          text-decoration: none;
          font-weight: 600;
        }

        .logo {
          margin: 0;
          font-size: 20px;
          color: #667eea;
        }

        .header-spacer {
          width: 60px;
        }

        .main-content {
          max-width: 600px;
          margin: 0 auto;
          padding: 24px;
        }

        .story-prompt {
          background: white;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
          text-align: center;
          border-left: 4px solid #667eea;
        }

        .story-prompt p {
          margin: 0;
          font-size: 16px;
          color: #333;
          font-weight: 500;
        }

        .story-section h2 {
          margin: 0 0 16px;
          font-size: 18px;
          color: #333;
        }

        .empty-story {
          text-align: center;
          padding: 32px;
          background: white;
          border-radius: 12px;
          color: #666;
        }

        .loading-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
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

export default ProfilePage;
