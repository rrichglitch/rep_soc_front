import { useState } from 'react';
import { followUser, unfollowUser } from '../utils/spacetime';

interface FollowButtonProps {
  targetIdentity: string;
  isFollowing: boolean;
  onFollowChange: (following: boolean) => void;
}

function FollowButton({ targetIdentity, isFollowing, onFollowChange }: FollowButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser(targetIdentity);
      } else {
        await followUser(targetIdentity);
      }
      onFollowChange(!isFollowing);
    } catch (error) {
      console.error('Failed to update follow:', error);
      alert(error instanceof Error ? error.message : 'Failed to update follow');
    }
    setIsLoading(false);
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`follow-button ${isFollowing ? 'following' : ''}`}
    >
      {isLoading ? 'Loading...' : isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}

export default FollowButton;
