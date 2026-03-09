import FollowButton from './FollowButton';

interface UserProfile {
  identity: string;
  full_name: string;
  profile_picture: string;
  city: string;
  description: string;
  created_at: Date;
}

interface ProfileHeaderProps {
  profile: UserProfile;
  isOwnProfile: boolean;
  isFollowing: boolean;
  onFollowChange: (following: boolean) => void;
  onEditClick?: () => void;
  onPictureClick?: () => void;
}

function ProfileHeader({
  profile,
  isOwnProfile,
  isFollowing,
  onFollowChange,
  onEditClick,
  onPictureClick,
}: ProfileHeaderProps) {
  return (
    <div className="profile-header">
      <div className="profile-picture-container">
        {profile.profile_picture ? (
          <img
            src={profile.profile_picture}
            alt={profile.full_name}
            className={`profile-picture ${onPictureClick ? 'clickable' : ''}`}
            onClick={onPictureClick}
          />
        ) : (
          <div className={`profile-picture-placeholder ${onPictureClick ? 'clickable' : ''}`} onClick={onPictureClick} />
        )}
      </div>

      <div className="profile-info">
        <h2 className="profile-name">{profile.full_name}</h2>
        {profile.city && <p className="profile-city">{profile.city}</p>}
        {profile.description && (
          <p className="profile-description">{profile.description}</p>
        )}
      </div>

      <div className="profile-actions">
        {isOwnProfile ? (
          onEditClick && (
            <button onClick={onEditClick} className="edit-button">
              Edit Profile
            </button>
          )
        ) : (
          <FollowButton
            targetIdentity={profile.identity}
            isFollowing={isFollowing}
            onFollowChange={onFollowChange}
          />
        )}
      </div>

      <style>{`
        .profile-header {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .profile-picture-container {
          margin-bottom: 16px;
        }

        .profile-picture {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          object-fit: cover;
          border: 4px solid white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .profile-picture-placeholder {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: #e0e0e0;
          border: 4px solid white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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

        .profile-info {
          margin-bottom: 16px;
        }

        .profile-name {
          margin: 0 0 4px;
          font-size: 24px;
          color: #333;
        }

        .profile-city {
          margin: 0 0 8px;
          color: #666;
          font-size: 14px;
        }

        .profile-description {
          margin: 0;
          color: #444;
          font-size: 14px;
          line-height: 1.5;
          max-width: 400px;
        }

        .profile-actions {
          display: flex;
          gap: 12px;
        }

        .edit-button {
          padding: 10px 24px;
          background: white;
          color: #667eea;
          border: 2px solid #667eea;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .edit-button:hover {
          background: #667eea;
          color: white;
        }

        .follow-button {
          padding: 10px 24px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .follow-button:hover {
          background: #5568d3;
        }

        .follow-button.following {
          background: white;
          color: #667eea;
          border: 2px solid #667eea;
        }

        .follow-button.following:hover {
          background: #fee2e2;
          color: #dc2626;
          border-color: #dc2626;
        }
      `}</style>
    </div>
  );
}

export default ProfileHeader;
