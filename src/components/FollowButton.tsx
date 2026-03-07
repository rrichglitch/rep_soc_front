import { useState } from 'react';

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
        // Call unfollow reducer
        console.log('Unfollowing:', targetIdentity);
      } else {
        // Call follow reducer
        console.log('Following:', targetIdentity);
      }
      onFollowChange(!isFollowing);
    } catch (error) {
      console.error('Failed to update follow:', error);
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
