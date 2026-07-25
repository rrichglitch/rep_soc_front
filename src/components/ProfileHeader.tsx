import { useState } from 'react';
import FollowButton from './FollowButton';
import { sendFriendRequest, cancelFriendRequest, unfriend, checkIsFriend, getFriendRequestStatus } from '../utils/spacetime';

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
  currentIdentityHex?: string;
  isOrgProfile?: boolean;
  onJoinRequest?: () => void;
  requestPending?: boolean;
}

function ProfileHeader({
  profile,
  isOwnProfile,
  isFollowing,
  onFollowChange,
  onEditClick,
  onPictureClick,
  currentIdentityHex,
  isOrgProfile,
  onJoinRequest,
  requestPending,
}: ProfileHeaderProps) {
  const [friendReqStatus, setFriendReqStatus] = useState<string | null>(
    currentIdentityHex ? getFriendRequestStatus(currentIdentityHex, profile.identity) : null
  );
  const [isFriend] = useState(
    currentIdentityHex ? checkIsFriend(currentIdentityHex, profile.identity) : false
  );

  const handleFriendRequest = async () => {
    try {
      await sendFriendRequest(profile.identity);
      setFriendReqStatus('pending');
    } catch (e: any) {
      alert(e.message || 'Failed to send request');
    }
  };

  const handleCancelRequest = async () => {
    try {
      await cancelFriendRequest(profile.identity);
      setFriendReqStatus(null);
    } catch (e: any) {
      alert(e.message || 'Failed to cancel request');
    }
  };

  const handleUnfriend = async () => {
    try {
      await unfriend(profile.identity);
      setFriendReqStatus(null);
      // force isFriend re-check via state
      setFriendReqStatus(null);
    } catch (e: any) {
      alert(e.message || 'Failed to unfriend');
    }
  };

  return (
    <div className="profile-header">
      <div className="profile-picture-container">
        {profile.profile_picture ? (
          <img src={profile.profile_picture} alt={profile.full_name} className={`profile-picture ${onPictureClick ? 'clickable' : ''}`} onClick={onPictureClick} />
        ) : (
          <div className={`profile-picture-placeholder ${onPictureClick ? 'clickable' : ''}`} onClick={onPictureClick} />
        )}
      </div>

      <div className="profile-info">
        <h2 className="profile-name">{profile.full_name}</h2>
        {profile.city && <p className="profile-city">{profile.city}</p>}
        {profile.description && <p className="profile-description">{profile.description}</p>}
      </div>

      <div className="profile-actions">
        {isOwnProfile ? (
          onEditClick && <button onClick={onEditClick} className="edit-button">Edit Profile</button>
        ) : isOrgProfile ? (
          <button onClick={onJoinRequest} disabled={requestPending} className="follow-button">
            {requestPending ? 'Request Pending' : 'Request to Join'}
          </button>
        ) : isFriend ? (
          <button onClick={handleUnfriend} className="unfriend-btn">Unfriend</button>
        ) : friendReqStatus === 'pending' ? (
          <>
            <FollowButton targetIdentity={profile.identity} isFollowing={isFollowing} onFollowChange={onFollowChange} />
            <button onClick={handleCancelRequest} className="cancel-request-btn">Cancel Request</button>
          </>
        ) : (
          <>
            <FollowButton targetIdentity={profile.identity} isFollowing={isFollowing} onFollowChange={onFollowChange} />
            <button onClick={handleFriendRequest} className="friend-request-btn">Add Friend</button>
          </>
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
        .profile-picture-container { margin-bottom: 16px; }
        .profile-picture {
          width: 120px; height: 120px; border-radius: 50%; object-fit: cover;
          border: 4px solid white; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .profile-picture-placeholder {
          width: 120px; height: 120px; border-radius: 50%; background: #e0e0e0;
          border: 4px solid white; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .profile-picture.clickable, .profile-picture-placeholder.clickable { cursor: pointer; transition: transform 0.2s; }
        .profile-picture.clickable:hover, .profile-picture-placeholder.clickable:hover { transform: scale(1.05); }
        .profile-info { margin-bottom: 16px; }
        .profile-name { margin: 0 0 4px; font-size: 24px; color: #333; }
        .profile-city { margin: 0 0 8px; color: #666; font-size: 14px; }
        .profile-description { margin: 0; color: #444; font-size: 14px; line-height: 1.5; max-width: 400px; }
        .profile-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
        .edit-button {
          padding: 10px 24px; background: white; color: #667eea; border: 2px solid #667eea;
          border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;
        }
        .edit-button:hover { background: #667eea; color: white; }
        .follow-button {
          padding: 10px 24px; background: #667eea; color: white; border: none;
          border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;
        }
        .follow-button:hover { background: #5568d3; }
        .follow-button.following { background: white; color: #667eea; border: 2px solid #667eea; }
        .follow-button.following:hover { background: #fee2e2; color: #dc2626; border-color: #dc2626; }
        .friend-request-btn {
          padding: 10px 24px; background: #22c55e; color: white; border: none;
          border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;
        }
        .friend-request-btn:hover { background: #16a34a; }
        .unfriend-btn {
          padding: 10px 24px; background: #dc2626; color: white; border: none;
          border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;
        }
        .unfriend-btn:hover { background: #b91c1c; }
        .cancel-request-btn {
          padding: 10px 24px; background: #f59e0b; color: white; border: none;
          border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;
        }
        .cancel-request-btn:hover { background: #d97706; }
      `}</style>
    </div>
  );
}

export default ProfileHeader;
