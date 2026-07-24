import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuthProfile } from '../hooks/useAuthProfile';
import { getUnreadNotificationCount, getProfileByEmail } from '../utils/spacetime';
import { useAuth } from 'react-oidc-context';

function AuthActions({ profileReplacement }: { profileReplacement?: ReactNode }) {
  const { isLoggedIn, profilePicture, handleSignIn } = useAuthProfile();
  const auth = useAuth();
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.user?.id_token) return;
    let identity: string | null = null;
    try {
      const payload = JSON.parse(atob(auth.user.id_token.split('.')[1]));
      const email = payload.email;
      if (email) {
        getProfileByEmail(email).then(p => {
          if (p) {
            identity = p.identity.toHexString();
            const interval = setInterval(() => {
              setNotifCount(getUnreadNotificationCount(identity!));
            }, 3000);
            return () => clearInterval(interval);
          }
        });
      }
    } catch {}
    const interval = setInterval(() => {
      if (identity) setNotifCount(getUnreadNotificationCount(identity));
    }, 3000);
    return () => clearInterval(interval);
  }, [auth.isAuthenticated]);

  if (isLoggedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link to="/messages" style={{ position: 'relative', color: '#666', textDecoration: 'none' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </Link>
        <Link to="/notifications" style={{ position: 'relative', color: '#666', textDecoration: 'none' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {notifCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -6,
              background: '#dc2626', color: 'white', borderRadius: '50%',
              width: 18, height: 18, fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{notifCount > 9 ? '9+' : notifCount}</span>
          )}
        </Link>
        {profileReplacement ? profileReplacement : (
          <Link to="/me" className="topbar-profile-link">
            {profilePicture ? (
              <img src={profilePicture} alt="My Profile" className="topbar-profile-image" />
            ) : (
              <div className="topbar-profile-placeholder" />
            )}
          </Link>
        )}
      </div>
    );
  }

  return (
    <button onClick={handleSignIn} className="topbar-signin">
      Sign In
    </button>
  );
}

export default AuthActions;
