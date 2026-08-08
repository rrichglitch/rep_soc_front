import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFriends } from '../utils/spacetime';
import HideToggle from './HideToggle';

interface FriendEntry {
  identity: string;
  name: string;
  picture: string;
  city: string;
}

interface FriendsListProps {
  identity: string;
  emptyText: string;
  // Own-profile only: a toggle to hide the list from other people
  hideToggle?: { label: string; checked: boolean; onChange: (v: boolean) => void; busy?: boolean };
}

// Shared friends/members list used by profile pages (individual + org members via getFriends? no — orgs use members)
function FriendsList({ identity, emptyText, hideToggle }: FriendsListProps) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);

  useEffect(() => {
    const refresh = () => setFriends(getFriends(identity));
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [identity]);

  return (
    <div className="friends-section">
      {friends.length === 0 ? (
        <div className="empty-story">
          <p>{emptyText}</p>
        </div>
      ) : (
        <div className="friends-list">
          {friends.map((f) => (
            <Link to={`/profile/${f.identity}`} key={f.identity} className="friend-row">
              {f.picture ? (
                <img src={f.picture} alt={f.name} className="friend-avatar" />
              ) : (
                <div className="friend-avatar-placeholder" />
              )}
              <div className="friend-info">
                <span className="friend-name">{f.name}</span>
                {f.city && <span className="friend-city">{f.city}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
      {hideToggle && (
        <HideToggle label={hideToggle.label} checked={hideToggle.checked} onChange={hideToggle.onChange} busy={hideToggle.busy} />
      )}
      <style>{`
        .friends-list { display: flex; flex-direction: column; }
        .friend-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-decoration: none; }
        .friend-row:last-child { border-bottom: none; }
        .friend-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .friend-avatar-placeholder { width: 44px; height: 44px; border-radius: 50%; background: #e0e0e0; flex-shrink: 0; }
        .friend-info { display: flex; flex-direction: column; min-width: 0; }
        .friend-name { font-size: 15px; font-weight: 600; color: #333; }
        .friend-city { font-size: 12px; color: #999; }
      `}</style>
    </div>
  );
}

export default FriendsList;
