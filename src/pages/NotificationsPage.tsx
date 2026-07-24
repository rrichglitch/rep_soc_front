import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import TopBar from '../components/TopBar';
import { getNotifications, resolveNotification, getProfileByEmail } from '../utils/spacetime';
import AuthActions from '../components/AuthActions';

function NotificationsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [currentIdentity, setCurrentIdentity] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.user?.id_token) return;
    try {
      const payload = JSON.parse(atob(auth.user.id_token.split('.')[1]));
      const email = payload.email;
      if (email) {
        getProfileByEmail(email).then(p => {
          if (p) setCurrentIdentity(p.identity.toHexString());
        });
      }
    } catch {}
  }, [auth.isAuthenticated]);

  useEffect(() => {
    if (!currentIdentity) return;
    const interval = setInterval(() => {
      setNotifs(getNotifications(currentIdentity));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentIdentity]);

  const handleResolve = async (id: bigint) => {
    await resolveNotification(id);
    if (currentIdentity) setNotifs(getNotifications(currentIdentity));
  };

  const pendingNotifs = notifs.filter(n => !n.resolved);
  const resolvedNotifs = notifs.filter(n => n.resolved);

  return (
    <div className="notif-page">
      <TopBar left={<button onClick={() => navigate(-1)} className="topbar-back">← Back</button>} center={<Link to="/home" className="topbar-logo"><img src="/veri.png" alt="Veri Social" /></Link>} right={<AuthActions />} />
      <main className="main-content">
        {pendingNotifs.length > 0 && (
          <div className="notif-section">
            <h3>New</h3>
            {pendingNotifs.map(n => (
              <div key={n.id.toString()} className="notif-card pending">
                <div className="notif-body">
                  <span className="notif-type">{n.type.replace(/_/g, ' ')}</span>
                  <p className="notif-msg">{n.message}</p>
                  {n.fromName !== 'Someone' && <span className="notif-from">From: {n.fromName}</span>}
                </div>
                <button onClick={() => handleResolve(n.id)} className="resolve-btn">✓</button>
              </div>
            ))}
          </div>
        )}
        {resolvedNotifs.length > 0 && (
          <div className="notif-section">
            <h3>Resolved</h3>
            {resolvedNotifs.map(n => (
              <div key={n.id.toString()} className="notif-card resolved">
                <div className="notif-body">
                  <span className="notif-type">{n.type.replace(/_/g, ' ')}</span>
                  <p className="notif-msg">{n.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {notifs.length === 0 && <p className="empty">No notifications yet</p>}
      </main>

      <style>{`
        .notif-page { min-height: 100vh; background: #f5f5f5; }
        .main-content { max-width: 600px; margin: 0 auto; padding: 24px; }
        .notif-section { margin-bottom: 24px; }
        .notif-section h3 { margin: 0 0 12px; color: #333; font-size: 16px; }
        .notif-card { background: white; border-radius: 8px; padding: 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-start; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .notif-card.pending { border-left: 3px solid #667eea; }
        .notif-card.resolved { opacity: 0.6; }
        .notif-type { font-size: 11px; text-transform: uppercase; color: #667eea; font-weight: 600; }
        .notif-msg { margin: 4px 0; color: #333; font-size: 14px; }
        .notif-from { font-size: 12px; color: #999; }
        .resolve-btn { padding: 4px 12px; background: #22c55e; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        .empty { text-align: center; padding: 48px; color: #999; }
      `}</style>
    </div>
  );
}

export default NotificationsPage;
