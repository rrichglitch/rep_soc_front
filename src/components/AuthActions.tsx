import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuthProfile } from '../hooks/useAuthProfile';
import { getUnreadNotificationCount } from '../utils/spacetime';
import { useOrg } from '../contexts/OrgContext';
import { useAuth } from 'react-oidc-context';

// Sign-in entry point: Google / Facebook via the OAuth relay, or the legacy
// SpacetimeCloud-OIDC flow. Shown in the top bar when logged out.
function SignInButtons() {
  return (
    <div className="signin-buttons">
      <button onClick={() => startOAuth('google')} className="topbar-signin oauth-google">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.1 3.57-5.17 3.57-8.81z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78l4.01-3.1z" />
          <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44A12 12 0 0 0 1.27 6.6l4.01 3.1c.94-2.84 3.59-4.93 6.72-4.93z" />
        </svg>
        Google
      </button>
      <button onClick={() => startOAuth('facebook')} className="topbar-signin oauth-facebook">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#ffffff" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.93-1.95 1.87V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12z" />
        </svg>
        Facebook
      </button>
    </div>
  );
}

function startOAuth(provider: 'google' | 'facebook') {
  const app = window.location.origin;
  window.location.href = `https://auth.veri.social/auth/${provider}?app=${encodeURIComponent(app)}`;
}

export default function AuthActions({ profileReplacement, hideChat }: { profileReplacement?: ReactNode; hideChat?: boolean }) {
  const { isLoggedIn, profilePicture } = useAuthProfile();
  const { activeOrg } = useOrg();
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // Legacy OIDC session (react-oidc-context) — only relevant for accounts that
  // haven't migrated to the OAuth relay yet.
  let auth: ReturnType<typeof useAuth> | null = null;
  try {
    auth = useAuth();
  } catch {
    auth = null; // rendered outside AuthProvider (shouldn't happen)
  }

  useEffect(() => {
    if (!isLoggedIn) return;
    const notifIdentity = activeOrg ? activeOrg.identity : (auth?.user?.profile?.sub || '');
    const update = () => {
      setUnreadNotifs(getUnreadNotificationCount(notifIdentity));
    };
    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, [isLoggedIn, auth?.user, activeOrg]);

  if (!isLoggedIn) {
    return (
      <>
        <SignInButtons />
        {auth && (
          <button onClick={() => auth!.signinRedirect()} className="topbar-signin legacy-signin">Sign In</button>
        )}
        <style>{`
          .signin-buttons { display: flex; align-items: center; gap: 8px; }
          .topbar-signin { padding: 6px 14px; background: #667eea; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
          .topbar-signin:hover { background: #5a6fd6; }
          .oauth-google { background: white; color: #333; border: 1px solid #dadce0; }
          .oauth-google:hover { background: #f7f8fa; }
          .oauth-facebook { background: #1877F2; color: white; border: none; }
          .oauth-facebook:hover { background: #166fe5; }
          .legacy-signin { background: #667eea; }
        `}</style>
      </>
    );
  }

  return (
    <div className="auth-actions">
      {!hideChat && (
        <Link to="/friends" className="nav-icon-link" style={{position:'relative'}}>
          {activeOrg ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M20 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          )}
        </Link>
      )}
      <Link to="/notifications" className="nav-icon-link" style={{position:'relative'}}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {unreadNotifs > 0 && <span className="ticker">{unreadNotifs > 99 ? '99+' : unreadNotifs}</span>}
      </Link>
      {profileReplacement ? profileReplacement : (
        <Link to="/me" className="nav-icon-link">
          {activeOrg ? (
            activeOrg.picture ? (
              <img src={activeOrg.picture} alt="Profile" style={{width:36,height:36,borderRadius:'50%',objectFit:'cover'}} />
            ) : (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M7 19c1-3 3-4 5-4s4 1 5 4"/></svg>
            )
          ) : profilePicture ? (
            <img src={profilePicture} alt="Profile" style={{width:36,height:36,borderRadius:'50%',objectFit:'cover'}} />
          ) : (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M20 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>
          )}
        </Link>
      )}
      <style>{`
        .auth-actions { display: flex; align-items: center; gap: 16px; }
        .nav-icon-link { color: #555; transition: color 0.2s; display: flex; }
        .nav-icon-link:hover { color: #333; }
        .ticker { position: absolute; top: -6px; right: -10px; background: #ef4444; color: white; font-size: 10px; padding: 2px 5px; border-radius: 10px; min-width: 16px; text-align: center; line-height: 1; }
      `}</style>
    </div>
  );
}