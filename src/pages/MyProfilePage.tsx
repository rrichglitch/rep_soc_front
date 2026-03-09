import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import type { Timestamp } from 'spacetimedb';
import { useApp } from '../App';
import { getProfileByEmail, getMyStoryPosts } from '../utils/spacetime';
import ProfileHeader from '../components/ProfileHeader';
import EditProfileModal from '../components/EditProfileModal';

interface UserProfile {
  identity: string;
  full_name: string;
  profile_picture: string;
  city: string;
  description: string;
  created_at: Date;
}

interface StoryPost {
  id: bigint;
  content: string;
  mediaData: string;
  mediaTypes: string;
  createdAt: Date;
  posterIdentity: string;
  posterName: string;
  posterPicture: string;
}

function MyProfilePage() {
  const { identity, email } = useApp();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [stories, setStories] = useState<StoryPost[]>([]);

  useEffect(() => {
    if (email) {
      loadProfile();
    }
  }, [email]);

  const loadProfile = async () => {
    if (!email) return;
    
    try {
      const profileData = await getProfileByEmail(email);
      if (profileData) {
        const createdAt = profileData.createdAt as unknown as Timestamp;
        const date = new Date(Number(createdAt.microsSinceUnixEpoch) / 1000);
        const identityHex = profileData.identity.toHexString();
        
        setProfile({
          identity: identityHex,
          full_name: profileData.fullName,
          profile_picture: profileData.profilePicture,
          city: profileData.city,
          description: profileData.description,
          created_at: date,
        });

        const profileStories = await getMyStoryPosts(identityHex);
        setStories(profileStories);
      }
    } catch (e) {
      console.error('Error loading profile:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileUpdate = (updatedProfile: UserProfile) => {
    setProfile(updatedProfile);
    setShowEditModal(false);
  };

  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  const placeholderProfile: UserProfile = {
    identity: identity?.toHexString() || '',
    full_name: 'Loading...',
    profile_picture: '',
    city: '',
    description: '',
    created_at: new Date(),
  };

  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const followUrl = `${window.location.origin}${basePath}/follow/${identity?.toHexString()}`;

  return (
    <div className="my-profile-page">
      <header className="header">
        <Link to="/" className="back-link">
          ← Back
        </Link>
        <h1 className="logo">Reputable Social</h1>
        <button onClick={() => setShowQR(true)} className="qr-button">
          Share
        </button>
      </header>

      <main className="main-content">
        <ProfileHeader
          profile={profile || placeholderProfile}
          isOwnProfile={true}
          isFollowing={false}
          onFollowChange={() => {}}
          onEditClick={() => setShowEditModal(true)}
        />

        <div className="story-section">
          <h2>Your Story</h2>
          <div className="no-post-own-story">
            <p>You cannot post on your own story. Others can share stories about you.</p>
          </div>
          
          {stories.length === 0 ? (
            <div className="empty-story">
              <p>No stories about you yet.</p>
            </div>
          ) : (
            <div className="stories-list">
              {stories.map((story) => (
                <div key={story.id.toString()} className="story-card">
                  <div className="story-header">
                    {story.posterPicture ? (
                      <img src={story.posterPicture} alt={story.posterName} className="story-avatar" />
                    ) : (
                      <div className="story-avatar-placeholder" />
                    )}
                    <div className="story-meta">
                      <span className="story-author">{story.posterName}</span>
                      <span className="story-date">{new Date(story.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <p className="story-content">{story.content}</p>
                  {story.mediaData && story.mediaData.length > 0 && (
                    <img src={story.mediaData} alt="Story media" className="story-media" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showEditModal && profile && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEditModal(false)}
          onSave={handleProfileUpdate}
        />
      )}

      {showQR && (
        <div className="qr-modal" onClick={() => setShowQR(false)}>
          <div className="qr-content" onClick={(e) => e.stopPropagation()}>
            <h3>Scan to Follow Me</h3>
            <div className="qr-code">
              <QRCodeSVG value={followUrl} size={200} />
            </div>
            <p className="qr-instruction">
              When someone scans this code and is logged in, they will follow you.
            </p>
            <p className="qr-instruction">
              If they're not logged in, they'll be taken to sign up and will automatically follow you after creating an account.
            </p>
            <button onClick={() => setShowQR(false)} className="close-button">
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        .my-profile-page {
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

        .qr-button {
          padding: 8px 16px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
        }

        .main-content {
          max-width: 600px;
          margin: 0 auto;
          padding: 24px;
        }

        .story-section h2 {
          margin: 0 0 16px;
          font-size: 18px;
          color: #333;
        }

        .no-post-own-story {
          background: white;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
          text-align: center;
          border-left: 4px solid #f59e0b;
        }

        .no-post-own-story p {
          margin: 0;
          color: #666;
        }

        .empty-story {
          text-align: center;
          padding: 32px;
          background: white;
          border-radius: 12px;
          color: #666;
        }

        .stories-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .story-card {
          background: white;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .story-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .story-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
        }

        .story-avatar-placeholder {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #e0e0e0;
        }

        .story-meta {
          display: flex;
          flex-direction: column;
        }

        .story-author {
          font-weight: 600;
          color: #333;
        }

        .story-date {
          font-size: 12px;
          color: #999;
        }

        .story-content {
          margin: 0;
          color: #333;
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .story-media {
          margin-top: 12px;
          max-width: 100%;
          border-radius: 8px;
        }

        .qr-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .qr-content {
          background: white;
          border-radius: 16px;
          padding: 32px;
          text-align: center;
          max-width: 320px;
        }

        .qr-content h3 {
          margin: 0 0 20px;
          color: #333;
        }

        .qr-code {
          padding: 16px;
          background: white;
          border-radius: 12px;
          display: inline-block;
          margin-bottom: 16px;
        }

        .qr-instruction {
          color: #666;
          font-size: 14px;
          margin: 0 0 8px;
        }

        .close-button {
          margin-top: 16px;
          padding: 10px 24px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
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

export default MyProfilePage;
