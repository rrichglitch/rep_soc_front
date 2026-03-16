import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import type { Timestamp } from 'spacetimedb';
import { useApp } from '../App';
import { getProfileByEmail, getMyStoryPosts, updateProfile } from '../utils/spacetime';

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
  const [showQR, setShowQR] = useState(false);
  const [stories, setStories] = useState<StoryPost[]>([]);
  
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPictureModal, setShowPictureModal] = useState(false);
  const [showPictureSelect, setShowPictureSelect] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (email) {
      loadProfile();
    }
  }, [email]);

  useEffect(() => {
    if (showPictureSelect) {
      fileInputRef.current?.click();
      setShowPictureSelect(false);
    }
  }, [showPictureSelect]);

  useEffect(() => {
    if (editingField === 'city' || editingField === 'description') {
      setTimeout(() => editInputRef.current?.focus(), 0);
    }
  }, [editingField]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPictureModal(false);
        setShowQR(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

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

  const handleEditClick = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const handleSave = async () => {
    if (!editingField || !identity) return;
    
    setIsSaving(true);
    try {
      if (editingField === 'city') {
        await updateProfile(undefined, editValue, undefined);
      } else if (editingField === 'description') {
        await updateProfile(undefined, undefined, editValue);
      }
      await loadProfile();
    } catch (e) {
      console.error('Error updating profile:', e);
    } finally {
      setIsSaving(false);
      setEditingField(null);
      setEditValue('');
    }
  };

  const handleCancel = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handlePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setIsSaving(true);
      try {
        await updateProfile(base64, undefined, undefined);
        await loadProfile();
      } catch (e) {
        console.error('Error updating profile picture:', e);
      } finally {
        setIsSaving(false);
        setShowPictureSelect(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const followUrl = `${window.location.origin}${basePath}/follow/${identity?.toHexString()}`;

  return (
    <div className="my-profile-page">
      <header className="header">
        <Link to="/" className="back-link">
          ← Back
        </Link>
        <Link to="/home" className="logo">Reputable Social</Link>
        <button onClick={() => setShowQR(true)} className="qr-button">
          Share
        </button>
      </header>

      <main className="main-content">
        <div className="profile-section">
          <div className="profile-header">
            <div className="profile-picture-container">
              {profile?.profile_picture ? (
                <img 
                  src={profile.profile_picture} 
                  alt={profile.full_name} 
                  className="profile-picture clickable"
                  onClick={() => setShowPictureModal(true)}
                />
              ) : (
                <div 
                  className="profile-picture-placeholder clickable"
                  onClick={() => setShowPictureModal(true)}
                />
              )}
            </div>
            <div className="profile-info">
              <h2 className="profile-name">{profile?.full_name}</h2>
              <div className="profile-field">
                {editingField === 'city' ? (
                  <div className="edit-inline">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="edit-input"
                      placeholder="City"
                    />
                    <button onClick={handleSave} className="save-btn" disabled={isSaving}>
                      ✓
                    </button>
                    <button onClick={handleCancel} className="cancel-btn">
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="field-display">
                    <span className="field-value">{profile?.city || 'Add city'}</span>
                    <button 
                      className="edit-btn" 
                      onClick={() => handleEditClick('city', profile?.city || '')}
                      disabled={isSaving}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <div className="profile-field description-field">
                {editingField === 'description' ? (
                  <div className="edit-inline">
                    <textarea
                      ref={editInputRef as any}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="edit-textarea"
                      placeholder="Description"
                      rows={3}
                    />
                    <div className="edit-actions">
                      <button onClick={handleSave} className="save-btn" disabled={isSaving}>
                        ✓
                      </button>
                      <button onClick={handleCancel} className="cancel-btn">
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="field-display">
                    <span className="field-value">{profile?.description || 'Add description'}</span>
                    <button 
                      className="edit-btn" 
                      onClick={() => handleEditClick('description', profile?.description || '')}
                      disabled={isSaving}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <p className="join-date">
                Joined {profile?.created_at.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handlePictureChange}
          style={{ display: 'none' }}
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
          )}
        </div>
      </main>

      {showQR && (
        <div className="qr-modal" onClick={() => setShowQR(false)}>
          <div className="qr-content" onClick={(e) => e.stopPropagation()}>
            <h3>Scan to Follow Me</h3>
            <div className="qr-code">
              <QRCodeSVG value={followUrl} size={200} />
            </div>
            <p className="qr-instruction">
              Anyone can scan this code to quickly follow your story.
            </p>
            <button onClick={() => setShowQR(false)} className="close-button">
              Close
            </button>
          </div>
        </div>
      )}

      {showPictureModal && (
        <div className="picture-modal" onClick={() => setShowPictureModal(false)}>
          <div className="picture-content" onClick={(e) => e.stopPropagation()}>
            {profile?.profile_picture ? (
              <img src={profile.profile_picture} alt={profile.full_name} className="large-picture" />
            ) : (
              <div className="large-picture-placeholder" />
            )}
            <div className="picture-modal-actions">
              <button onClick={() => { setShowPictureModal(false); setShowPictureSelect(true); }} className="change-photo-btn">
                Change Photo
              </button>
              <button onClick={() => setShowPictureModal(false)} className="close-button">
                Close
              </button>
            </div>
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
          z-index: 100;
        }

        .back-link {
          color: #667eea;
          text-decoration: none;
          font-weight: 600;
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

        .profile-section {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .profile-header {
          display: flex;
          gap: 20px;
        }

        .profile-picture-container {
          position: relative;
          flex-shrink: 0;
        }

        .profile-picture {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          object-fit: cover;
        }

        .profile-picture.clickable,
        .profile-picture-placeholder.clickable {
          cursor: pointer;
          transition: transform 0.2s;
        }

        .profile-picture.clickable:hover,
        .profile-picture-placeholder.clickable:hover {
          transform: scale(1.05);
        }

        .profile-picture-placeholder {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: #e0e0e0;
        }

        .edit-picture-btn {
          display: none;
        }

        .profile-info {
          flex: 1;
        }

        .profile-name {
          margin: 0 0 12px;
          font-size: 22px;
          color: #333;
        }

        .profile-field {
          margin-bottom: 8px;
        }

        .field-display {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .field-value {
          color: #666;
          font-size: 14px;
        }

        .edit-btn {
          background: none;
          border: none;
          color: #999;
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .profile-field:hover .edit-btn {
          opacity: 1;
        }

        .edit-btn:hover {
          color: #667eea;
        }

        .edit-inline {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .edit-input {
          flex: 1;
          padding: 6px 10px;
          border: 1px solid #667eea;
          border-radius: 4px;
          font-size: 14px;
          outline: none;
        }

        .edit-textarea {
          flex: 1;
          padding: 8px 10px;
          border: 1px solid #667eea;
          border-radius: 4px;
          font-size: 14px;
          font-family: inherit;
          resize: vertical;
          outline: none;
        }

        .save-btn {
          padding: 4px 8px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }

        .save-btn:hover {
          background: #5a6fd6;
        }

        .save-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .cancel-btn {
          padding: 4px 8px;
          background: #999;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }

        .cancel-btn:hover {
          background: #777;
        }

        .edit-actions {
          display: flex;
          gap: 4px;
        }

        .description-field .field-value {
          display: block;
          white-space: pre-wrap;
        }

        .join-date {
          margin: 12px 0 0;
          font-size: 13px;
          color: #999;
        }

        .story-section h2 {
          font-size: 16px;
          color: #666;
          margin: 0 0 16px;
        }

        .no-post-own-story {
          background: white;
          border-radius: 12px;
          padding: 16px;
          text-align: center;
          margin-bottom: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .no-post-own-story p {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .stories-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow: hidden;
        }

        .story-card {
          background: white;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .story-header-link {
          text-decoration: none;
          display: block;
          margin-bottom: 12px;
        }

        .story-header-link:hover .story-author {
          color: #667eea;
        }

        .story-header {
          display: flex;
          align-items: center;
          gap: 12px;
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

        .empty-story {
          background: white;
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .empty-story p {
          margin: 0;
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
          z-index: 200;
        }

        .qr-content {
          background: white;
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          max-width: 90%;
        }

        .qr-content h3 {
          margin: 0 0 16px;
          color: #333;
        }

        .qr-code {
          margin-bottom: 16px;
        }

        .qr-instruction {
          margin: 0 0 8px;
          font-size: 14px;
          color: #666;
        }

        .picture-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
        }

        .picture-content {
          text-align: center;
        }

        .large-picture {
          max-width: 80vw;
          max-height: 70vh;
          border-radius: 8px;
          object-fit: contain;
        }

        .large-picture-placeholder {
          width: 200px;
          height: 200px;
          border-radius: 50%;
          background: #e0e0e0;
          margin: 0 auto;
        }

        .picture-modal-actions {
          margin-top: 16px;
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .change-photo-btn {
          padding: 10px 24px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }

        .change-photo-btn:hover {
          background: #5a6fd6;
        }

        .close-button {
          margin: 0;
          padding: 10px 24px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }

        @media (max-width: 640px) {
          .header {
            padding: 10px 16px;
          }

          .main-content {
            padding: 16px;
          }

          .profile-header {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .profile-field {
            justify-content: center;
          }

          .field-display {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

export default MyProfilePage;
