import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import TopBar from '../components/TopBar';
import AuthActions from '../components/AuthActions';
import { getFriendChats, getMyOrganizations, getProfileByEmail } from '../utils/spacetime';

function MessagesPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.user?.id_token) return;
    try {
      const payload = JSON.parse(atob(auth.user.id_token.split('.')[1]));
      const email = payload.email;
      if (email) {
        getProfileByEmail(email).then(p => {
          if (p) {
            const id = p.identity.toHexString();
            setFriends(getFriendChats(id));
            setOrgs(getMyOrganizations(id));
          }
        });
      }
    } catch {}
  }, [auth.isAuthenticated]);

  return (
    <div className="messages-page">
      <TopBar left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>} center={<span style={{fontWeight:600,fontSize:18}}>Messages</span>} right={<AuthActions />} />
      <main className="main-content">
        {orgs.length > 0 && (
          <div className="chat-section">
            <h3>Organization Chats</h3>
            {orgs.map(org => (
              <button key={org.id.toString()} onClick={() => navigate(`/org-chat/${org.id}`)} className="chat-row">
                {org.picture ? <img src={org.picture} alt={org.name} className="chat-avatar" /> : <div className="chat-avatar-placeholder" />}
                <div className="chat-info">
                  <span className="chat-name">{org.name}</span>
                  <span className="chat-role">{org.role}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="chat-section">
          <h3>Friends</h3>
          {friends.length === 0 ? (
            <p className="empty">No friends yet. Add friends to start chatting!</p>
          ) : (
            friends.map(f => (
              <button key={f.identity} onClick={() => navigate(`/messages/${f.identity}`)} className="chat-row">
                {f.picture ? <img src={f.picture} alt={f.fullName} className="chat-avatar" /> : <div className="chat-avatar-placeholder" />}
                <span className="chat-name">{f.fullName}</span>
              </button>
            ))
          )}
        </div>
      </main>

      <style>{`
        .messages-page { min-height: 100vh; background: #f5f5f5; }
        .main-content { max-width: 600px; margin: 0 auto; padding: 24px; }
        .chat-section { margin-bottom: 24px; }
        .chat-section h3 { margin: 0 0 12px; color: #333; font-size: 16px; }
        .chat-row { display: flex; align-items: center; gap: 12px; padding: 12px; background: white; border: none; border-radius: 8px; width: 100%; cursor: pointer; margin-bottom: 4px; text-align: left; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .chat-row:hover { background: #f8f9ff; }
        .chat-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }
        .chat-avatar-placeholder { width: 44px; height: 44px; border-radius: 50%; background: #e0e0e0; }
        .chat-name { font-weight: 600; color: #333; }
        .chat-role { font-size: 12px; color: #999; }
        .chat-info { display: flex; flex-direction: column; }
        .empty { text-align: center; padding: 32px; color: #999; }
      `}</style>
    </div>
  );
}

export default MessagesPage;
