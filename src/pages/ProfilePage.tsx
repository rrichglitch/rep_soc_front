import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../App';
import { useAuth } from 'react-oidc-context';
import ProfileHeader from '../components/ProfileHeader';
import { getProfileByIdentity, checkIsFollowing, createStoryPost, getStoriesForProfile, connectToSpacetimeDB, getProfileByEmail } from '../utils/spacetime';
import { CHAR_LIMITS, MAX_MEDIA_SIZE_BYTES, ALLOWED_MEDIA_TYPES } from '../config';
import { fileToBase64, isFileSizeValid, isFileTypeValid } from '../utils/sanitize';

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

function ProfilePage() {
  const { identity: profileIdentity } = useParams<{ identity: string }>();
  const { identity: currentIdentity, email } = useApp();
  const auth = useAuth();
  const navigate = useNavigate();

  const isAuthenticated = auth.isAuthenticated;
  const [profilePicture, setProfilePicture] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserIdentity, setCurrentUserIdentity] = useState<string | null>(null);

  const handleSignIn = () => {
    auth.signinRedirect();
  };

  // Background: try to connect and check for profile
  useEffect(() => {
    const initAuth = async () => {
      // Try anonymous connection first
      if (!isAuthenticated) {
        try {
          await connectToSpacetimeDB('', undefined);
        } catch (e) {
          console.log('Anonymous connect failed:', e);
        }
        return;
      }

      // If authenticated, try to connect with token
      const token = auth.user?.access_token;
      if (!token) return;

      try {
        await connectToSpacetimeDB('', token);

        // Get email from token
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
          // Poll for profile
          for (let i = 0; i < 10; i++) {
            const profile = await getProfileByEmail(userEmail);
            if (profile) {
              setProfilePicture(profile.profilePicture);
              setCurrentUserIdentity(profile.identity.toHexString());
              setIsLoggedIn(true);
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } catch (e) {
        console.error('Auth connect failed:', e);
      }
    };

    initAuth();
  }, [isAuthenticated, auth.user, email]);
  
  const [profile, setProfile] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [stories, setStories] = useState<StoryPost[]>([]);
  
  const [storyContent, setStoryContent] = useState('');
  const [storyMedia, setStoryMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [showPictureModal, setShowPictureModal] = useState(false);

  const currentIdentityHex = currentUserIdentity || currentIdentity?.toHexString();
  const isOwnProfile = currentIdentityHex === profileIdentity;
  const canPost = isLoggedIn && !isOwnProfile && currentIdentityHex !== profileIdentity;

  // Separate effect for redirect - runs when identity is available
  useEffect(() => {
    if (currentIdentity && profileIdentity && currentIdentityHex === profileIdentity) {
      navigate('/me', { replace: true });
    }
  }, [currentIdentity, currentIdentityHex, profileIdentity, navigate]);

  useEffect(() => {
    const loadProfile = async () => {
      // Skip if looking at own profile (redirect will handle it)
      if (currentIdentityHex === profileIdentity) {
        setIsLoading(false);
        return;
      }

      if (!profileIdentity) {
        setIsLoading(false);
        return;
      }

      try {
        const profileData = await getProfileByIdentity(profileIdentity);
        setProfile(profileData);

        if (profileData && currentIdentityHex) {
          const following = await checkIsFollowing(profileIdentity, currentIdentityHex);
          setIsFollowing(following);

          const profileStories = await getStoriesForProfile(profileIdentity);
          setStories(profileStories);
        }
      } catch (e) {
        console.error('Error loading profile:', e);
      }
      setIsLoading(false);
    };

    loadProfile();
  }, [profileIdentity, currentIdentityHex, isLoggedIn]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPictureModal(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleFollowChange = (following: boolean) => {
    setIsFollowing(following);
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isFileTypeValid(file, [...ALLOWED_MEDIA_TYPES])) {
        setPostError('Invalid file type');
        return;
      }
      if (!isFileSizeValid(file, MAX_MEDIA_SIZE_BYTES)) {
        setPostError('File is too large (max 5MB)');
        return;
      }
      setStoryMedia(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setPostError(null);
    }
  };

  const handleSubmitStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storyContent.trim() || !profileIdentity || isOwnProfile) return;

    setIsPosting(true);
    setPostError(null);

    try {
      let mediaData: string | undefined;
      let mediaTypes: string[] | undefined;

      if (storyMedia) {
        mediaData = await fileToBase64(storyMedia);
        mediaTypes = [storyMedia.type];
      }

      await createStoryPost(profileIdentity, storyContent.trim(), mediaData, mediaTypes);
      
      setStoryContent('');
      setStoryMedia(null);
      setMediaPreview(null);
      
      // Refresh stories
      const updatedStories = await getStoriesForProfile(profileIdentity);
      setStories(updatedStories);
    } catch (error) {
      console.error('Failed to post story:', error);
      setPostError(error instanceof Error ? error.message : 'Failed to post');
    }

    setIsPosting(false);
  };

  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-page">
        <header className="header">
          <button onClick={() => navigate(-1)} className="back-button">← Back</button>
          <Link to="/" className="logo">Reputable Social</Link>
          <div className="header-spacer"></div>
        </header>
        <main className="main-content">
          <div className="not-found">
            <p>Profile not found</p>
            <Link to="/" className="home-link">Go Home</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <header className="header">
        <button onClick={() => navigate(-1)} className="back-button">← Back</button>
        <Link to="/" className="logo">Reputable Social</Link>
        <div className="header-right">
          {isAuthenticated ? (
            <Link to={isLoggedIn ? "/home" : "/me"} className="profile-link">
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

      <main className="main-content">
        <ProfileHeader
          profile={{
            identity: profileIdentity!,
            full_name: profile.fullName,
            profile_picture: profile.profilePicture,
            city: profile.city,
            description: profile.description,
            created_at: profile.createdAt,
          }}
          isOwnProfile={isOwnProfile}
          isFollowing={isFollowing}
          onFollowChange={handleFollowChange}
          onPictureClick={() => setShowPictureModal(true)}
        />

        {canPost && (
          <form onSubmit={handleSubmitStory} className="story-form">
            <textarea
              value={storyContent}
              onChange={(e) => setStoryContent(e.target.value)}
              placeholder={`Tell a true story about ${profile.fullName}...`}
              maxLength={CHAR_LIMITS.storyContent}
              className="story-input"
            />
            {mediaPreview && (
              <div className="media-preview">
                <img src={mediaPreview} alt="Preview" />
                <button type="button" onClick={() => { setStoryMedia(null); setMediaPreview(null); }} className="remove-media">×</button>
              </div>
            )}
            <div className="story-form-actions">
              <label className="media-label">
                <input type="file" accept="image/*" onChange={handleMediaChange} hidden />
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </label>
              <span className="char-count">{storyContent.length}/{CHAR_LIMITS.storyContent}</span>
              <button type="submit" disabled={isPosting || !storyContent.trim()} className="post-button">
                {isPosting ? 'Posting...' : 'Post'}
              </button>
            </div>
            {postError && <p className="error-message">{postError}</p>}
          </form>
        )}

        <div className="story-section">
          <h2>Story</h2>
          {stories.length === 0 ? (
            <div className="empty-story">
              <p>No stories yet. Be the first to share a story!</p>
            </div>
            ) : (
            <div className="stories-list">
              {stories.map((story) => (
                <div key={story.id.toString()} className="story-card">
                  <div className="story-header">
                    <Link to={`/profile/${story.posterIdentity}`} className="story-header-link">
                      {story.posterPicture ? (
                        <img src={story.posterPicture} alt={story.posterName} className="story-avatar" />
                      ) : (
                        <div className="story-avatar-placeholder" />
                      )}
                      <span className="story-author">{story.posterName}</span>
                    </Link>
                    <span className="story-date">{new Date(story.createdAt).toLocaleDateString()}</span>
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

      {showPictureModal && profile && (
        <div className="picture-modal" onClick={() => setShowPictureModal(false)}>
          <div className="picture-content" onClick={(e) => e.stopPropagation()}>
            {profile.profilePicture ? (
              <img src={profile.profilePicture} alt={profile.fullName} className="large-picture" />
            ) : (
              <div className="large-picture-placeholder" />
            )}
            <button onClick={() => setShowPictureModal(false)} className="close-button">
              Close
            </button>
          </div>
        </div>
      )}

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

        .back-button {
          color: #667eea;
          background: none;
          border: none;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }

        .logo {
          margin: 0;
          font-size: 20px;
          font-weight: bold;
          color: #667eea;
          text-decoration: none;
        }

        .logo:hover {
          color: #5a6fd6;
        }

        .header-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-width: 80px;
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

        .header-spacer {
          width: 60px;
        }

        .main-content {
          max-width: 600px;
          margin: 0 auto;
          padding: 24px;
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

        .not-found {
          text-align: center;
          padding: 48px;
          background: white;
          border-radius: 12px;
        }

        .home-link {
          display: inline-block;
          margin-top: 16px;
          padding: 10px 20px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 8px;
        }

        .story-form {
          background: white;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .story-input {
          width: 100%;
          min-height: 100px;
          padding: 12px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 16px;
          font-family: inherit;
          resize: vertical;
          outline: none;
          box-sizing: border-box;
        }

        .story-input:focus {
          border-color: #667eea;
        }

        .media-preview {
          position: relative;
          margin-top: 12px;
          display: inline-block;
        }

        .media-preview img {
          max-width: 200px;
          max-height: 200px;
          border-radius: 8px;
        }

        .remove-media {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #dc2626;
          color: white;
          border: none;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
        }

        .story-form-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 12px;
        }

        .media-label {
          cursor: pointer;
          color: #666;
          padding: 8px;
          border-radius: 8px;
        }

        .media-label:hover {
          background: #f5f5f5;
          color: #667eea;
        }

        .char-count {
          flex: 1;
          text-align: right;
          font-size: 12px;
          color: #999;
        }

        .post-button {
          padding: 10px 20px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }

        .post-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .error-message {
          color: #dc2626;
          font-size: 14px;
          margin-top: 8px;
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

        .profile-page .picture-modal {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
        }

        .profile-page .picture-content {
          text-align: center;
        }

        .profile-page .large-picture {
          max-width: 80vw;
          max-height: 70vh;
          border-radius: 8px;
          object-fit: contain;
        }

        .profile-page .large-picture-placeholder {
          width: 200px;
          height: 200px;
          border-radius: 50%;
          background: #e0e0e0;
          margin: 0 auto;
        }

        .profile-page .picture-modal .close-button {
          display: block;
          margin: 16px auto 0;
          padding: 10px 24px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }

        .profile-page .picture-modal .close-button:hover {
          background: #5a6fd6;
        }
      `}</style>
    </div>
  );
}

export default ProfilePage;
