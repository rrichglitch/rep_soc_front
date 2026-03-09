import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../App';
import { getProfileByEmail, getMyStoryPosts, getFollowedStoriesWithOptions, getFeedPosition, setFeedPosition } from '../utils/spacetime';
import SearchBar from '../components/SearchBar';

function MainFeedPage() {
  const navigate = useNavigate();
  const { email } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [profilePicture, setProfilePicture] = useState<string>('');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [myStories, setMyStories] = useState<any[]>([]);
  const [followedStories, setFollowedStories] = useState<any[]>([]);
  const [orderOldToNew, setOrderOldToNew] = useState(true);
  
  const lastSaveTimeRef = useRef<number>(0);
  const currentIdentityHexRef = useRef<string>('');
  const feedContainerRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (!email) {
      setIsLoading(false);
      return;
    }
    
    try {
      const profile = await getProfileByEmail(email);
      if (profile) {
        const identityHex = profile.identity.toHexString();
        currentIdentityHexRef.current = identityHex;
        setProfilePicture(profile.profilePicture);

        const [myFeed, feedPosition] = await Promise.all([
          getMyStoryPosts(identityHex),
          getFeedPosition(identityHex),
        ]);
        
        setMyStories(myFeed);

        const followedFeed = await getFollowedStoriesWithOptions(
          identityHex,
          orderOldToNew,
          feedPosition || undefined
        );
        setFollowedStories(followedFeed);
      }
    } catch (e) {
      console.error('Error loading profile:', e);
    }
    setIsLoading(false);
  }, [email, orderOldToNew]);

  useEffect(() => {
    if (email) {
      loadData();
    }
  }, [email, loadData]);

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const handleMobileSearchToggle = () => {
    setShowMobileSearch(!showMobileSearch);
  };

  const handleToggleOrder = async () => {
    const newOrder = !orderOldToNew;
    setOrderOldToNew(newOrder);
  };

  const handleScroll = useCallback(async () => {
    const identity = currentIdentityHexRef.current;
    if (!identity) return;

    const container = feedContainerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 100;
    const isAtTop = scrollTop <= 100;

    let timestampToSave: Date | null = null;

    if (orderOldToNew) {
      if (isAtBottom && followedStories.length > 0) {
        const oldestStory = followedStories[followedStories.length - 1];
        timestampToSave = new Date(oldestStory.createdAt);
      }
    } else {
      if (isAtTop && followedStories.length > 0) {
        const newestStory = followedStories[0];
        timestampToSave = new Date(newestStory.createdAt);
      }
    }

    if (timestampToSave) {
      const now = Date.now();
      if (now - lastSaveTimeRef.current > 30000) {
        try {
          await setFeedPosition(identity, timestampToSave);
          lastSaveTimeRef.current = now;
          console.log('Feed position saved:', timestampToSave);
        } catch (e) {
          console.error('Error saving feed position:', e);
        }
      }
    }
  }, [orderOldToNew, followedStories]);

  useEffect(() => {
    const container = feedContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const hasContent = myStories.length > 0 || followedStories.length > 0;

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
          <Link to="/about" className="logo">Reputable Social</Link>
        </div>
        <div className="header-center">
          <SearchBar onSearch={handleSearch} />
        </div>
        <div className="header-right">
          <button className="search-toggle" onClick={handleMobileSearchToggle} aria-label="Search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
          <Link to="/me" className="profile-link">
            {profilePicture ? (
              <img src={profilePicture} alt="My Profile" className="profile-image" />
            ) : (
              <div className="profile-placeholder" />
            )}
          </Link>
        </div>
      </header>

      {showMobileSearch && (
        <div className="mobile-search-row">
          <SearchBar onSearch={(query) => {
            handleSearch(query);
            setShowMobileSearch(false);
          }} />
        </div>
      )}

      <main className="main-content" ref={feedContainerRef}>
        {!hasContent ? (
          <div className="empty-feed">
            <p>No posts yet. Follow some people to see their stories!</p>
            <Link to="/search" className="find-people-link">
              Find People
            </Link>
          </div>
        ) : (
          <div className="feed">
            <div className="feed-controls">
              <button 
                className={`order-toggle ${orderOldToNew ? 'active' : ''}`}
                onClick={handleToggleOrder}
              >
                {orderOldToNew ? '↓ Oldest First' : '↑ Newest First'}
              </button>
            </div>

            {myStories.length > 0 && (
              <div className="feed-section">
                <h2 className="feed-section-title">Your Story</h2>
                <div className="stories-list">
                  {myStories.map((story) => (
                    <div key={story.id.toString()} className="story-card">
                      <Link to={`/profile/${story.posterIdentity}`} className="story-header-link">
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
                      </Link>
                      <p className="story-content">{story.content}</p>
                      {story.mediaData && story.mediaData.length > 0 && (
                        <img src={story.mediaData} alt="Story media" className="story-media" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {followedStories.length > 0 && (
              <div className="feed-section">
                <h2 className="feed-section-title">Following</h2>
                <div className="stories-list">
                  {followedStories.map((story) => (
                    <div key={story.id.toString()} className="story-card">
                      <div className="story-people-row">
                        <Link to={`/profile/${story.posterIdentity}`} className="story-person-col">
                          {story.posterPicture ? (
                            <img src={story.posterPicture} alt={story.posterName} className="person-avatar-lg" />
                          ) : (
                            <div className="person-avatar-placeholder-lg" />
                          )}
                          <span className="person-name-lg">{story.posterName}</span>
                        </Link>
                        <div className="story-middle-col">
                          <span className="small-arrow">→</span>
                          <span className="small-date">{new Date(story.createdAt).toLocaleDateString()}</span>
                        </div>
                        <Link to={`/profile/${story.profileOwnerIdentity}`} className="story-person-col">
                          {story.profileOwnerPicture ? (
                            <img src={story.profileOwnerPicture} alt={story.profileOwnerName} className="person-avatar-lg" />
                          ) : (
                            <div className="person-avatar-placeholder-lg" />
                          )}
                          <span className="person-name-lg">{story.profileOwnerName}</span>
                        </Link>
                      </div>
                      <p className="story-content">{story.content}</p>
                      {story.mediaData && story.mediaData.length > 0 && (
                        <img src={story.mediaData} alt="Story media" className="story-media" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          z-index: 100;
        }

        .header-left {
          display: flex;
          align-items: center;
          justify-content: flex-start;
        }

        .header-center {
          display: flex;
          justify-content: center;
          width: 100%;
          max-width: 600px;
        }

        .header-center .search-bar {
          width: 100%;
          max-width: 500px;
        }

        .header-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 16px;
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

        .search-section {
          display: none;
        }

        .search-toggle {
          display: none;
          padding: 8px;
          background: transparent;
          border: none;
          color: #666;
          cursor: pointer;
          border-radius: 8px;
        }

        .search-toggle:hover {
          background: #f5f5f5;
          color: #667eea;
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

        .mobile-search-row {
          display: none;
          padding: 12px 24px;
          background: white;
          border-bottom: 1px solid #e0e0e0;
        }

        .main-content {
          max-width: 600px;
          margin: 0 auto;
          padding: 24px;
          height: calc(100vh - 60px);
          overflow-y: auto;
        }

        .feed-controls {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 16px;
        }

        .order-toggle {
          padding: 8px 16px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 20px;
          font-size: 14px;
          cursor: pointer;
          color: #666;
          transition: all 0.2s;
        }

        .order-toggle:hover {
          background: #f5f5f5;
        }

        .order-toggle.active {
          background: #667eea;
          color: white;
          border-color: #667eea;
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

        .feed-section {
          margin-bottom: 32px;
        }

        .feed-section-title {
          font-size: 16px;
          color: #666;
          margin: 0 0 16px;
          font-weight: 600;
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

        .story-context {
          margin: 0 0 8px;
          font-size: 14px;
          color: #666;
        }

        .profile-link-text {
          color: #667eea;
          text-decoration: none;
          font-weight: 600;
        }

        .profile-link-text:hover {
          text-decoration: underline;
        }

        .story-header-link {
          text-decoration: none;
          display: block;
          margin-bottom: 12px;
        }

        .story-header-link:hover .story-author {
          color: #667eea;
        }

        .story-people-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #eee;
        }

        .story-person-col {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          min-width: 120px;
        }

        .story-person-col:hover .person-name-lg {
          color: #667eea;
        }

        .person-avatar-lg {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .person-avatar-placeholder-lg {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #e0e0e0;
          flex-shrink: 0;
        }

        .person-name-lg {
          font-weight: 600;
          color: #333;
          font-size: 15px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .story-middle-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
        }

        .small-arrow {
          color: #999;
          font-size: 16px;
        }

        .small-date {
          font-size: 11px;
          color: #999;
        }

        .story-context-header .profile-link-text {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .context-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          object-fit: cover;
        }

        .context-avatar-placeholder {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #e0e0e0;
        }

        .context-name {
          font-weight: 600;
          color: #667eea;
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

        @media (min-width: 641px) {
          .header-center {
            display: flex;
          }
        }

        @media (max-width: 640px) {
          .header {
            padding: 10px 16px;
          }

          .header-left {
            flex-shrink: 0;
          }

          .header-center {
            display: none;
          }

          .header-right {
            flex-shrink: 0;
            margin-left: auto;
            gap: 12px;
          }

          .search-toggle {
            display: block;
          }

          .mobile-search-row {
            display: block;
          }

          .logo {
            font-size: 16px;
            white-space: nowrap;
          }
        }
      `}</style>
    </div>
  );
}

export default MainFeedPage;
