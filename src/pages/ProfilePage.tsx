import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../App';
import ProfileHeader from '../components/ProfileHeader';
import { getProfileByIdentity, checkIsFollowing, createStoryPost, getStoriesForProfile } from '../utils/spacetime';
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
  const { identity: currentIdentity } = useApp();
  const navigate = useNavigate();
  
  const [profile, setProfile] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [stories, setStories] = useState<StoryPost[]>([]);
  
  const [storyContent, setStoryContent] = useState('');
  const [storyMedia, setStoryMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const currentIdentityHex = currentIdentity?.toHexString();
  const isOwnProfile = currentIdentityHex === profileIdentity;

  useEffect(() => {
    const loadProfile = async () => {
      // Wait for identity to be available
      if (!currentIdentity) {
        return;
      }

      if (!profileIdentity) {
        setIsLoading(false);
        return;
      }

      // Redirect to own profile if viewing own profile
      if (profileIdentity === currentIdentityHex) {
        navigate('/me', { replace: true });
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
  }, [profileIdentity, currentIdentity, currentIdentityHex, navigate]);

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
          <Link to="/" className="back-link">← Back</Link>
          <h1 className="logo">Reputable Social</h1>
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
        <Link to="/" className="back-link">← Back</Link>
        <h1 className="logo">Reputable Social</h1>
        <div className="header-spacer"></div>
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
        />

        {!isOwnProfile && (
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
      `}</style>
    </div>
  );
}

export default ProfilePage;
