import type { ReactNode } from 'react';
import { useEffect, useState, createContext, useContext } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AuthProvider, useAuth } from 'react-oidc-context';
import type { Identity } from 'spacetimedb';
import { AUTH_CONFIG } from './config';
import { connectToSpacetimeDB, checkProfileExistsByEmail, claimProfile, disconnectFromSpacetimeDB, getProfileByEmail, updateLocation } from './utils/spacetime';
import { getBrowserLocation, jitterLocation } from './utils/geo';
import { OrgProvider } from './contexts/OrgContext';

import RegisterPage from './pages/RegisterPage';
import MainFeedPage from './pages/MainFeedPage';
import ProfilePage from './pages/ProfilePage';
import MyProfilePage from './pages/MyProfilePage';
import FollowPage from './pages/FollowPage';
import CallbackPage from './pages/CallbackPage';
import SearchPage from './pages/SearchPage';
import AboutPage from './pages/AboutPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import OrgProfilePage from './pages/OrgProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import FriendsPage from './pages/FriendsPage';
import DMChatPage from './pages/DMChatPage';
import OrgChatPage from './pages/OrgChatPage';

interface AppContextType {
  identity: Identity | null;
  email: string | null;
  isLoading: boolean;
  hasProfile: boolean;
  setHasProfile: (has: boolean) => void;
}

const AppContext = createContext<AppContextType>({
  identity: null,
  email: null,
  isLoading: true,
  hasProfile: false,
  setHasProfile: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext);

interface AuthCallbackProps {
  children: (isAuthenticated: boolean) => ReactNode;
}

function AuthCallback({ children }: AuthCallbackProps) {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [hasProfile, setHasProfileState] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [isSettingLocation, setIsSettingLocation] = useState(false);

  const setHasProfile = (has: boolean) => {
    setHasProfileState(has);
  };

  useEffect(() => {
    const initAuth = async () => {
      if (!auth.isAuthenticated || !auth.user) {
        setIsLoading(false);
        return;
      }

      console.log('Authenticated via OIDC:', auth.user);

      const idToken = auth.user?.id_token;
      const accessToken = auth.user?.access_token;

      if (idToken && accessToken) {
        try {
          const payload = JSON.parse(atob(idToken.split('.')[1]));
          const sub = payload.sub;
          const userEmail = payload.email;

          console.log('Identity from token:', sub);
          console.log('Email from token:', userEmail);

          if (!userEmail) {
            console.error('No email in token. Token payload:', payload);
            setIsLoading(false);
            return;
          }

          const userIdentity = { toHexString: () => sub } as unknown as Identity;
          setIdentity(userIdentity);
          setEmail(userEmail);

          try {
            await connectToSpacetimeDB(userEmail, accessToken);

            let profileExists = false;
            for (let i = 0; i < 30; i++) {
              profileExists = await checkProfileExistsByEmail(userEmail);
              if (profileExists) break;
              await new Promise(resolve => setTimeout(resolve, 200));
            }

            console.log('Profile exists in DB:', profileExists);
            setHasProfileState(profileExists);
            if (profileExists) { try { await claimProfile(userEmail); } catch (e) { /* non-fatal */ } }

            // First-login location permission flow (only if device supports it and never asked)
            if (profileExists && 'geolocation' in navigator) {
              try {
                const prof = await getProfileByEmail(userEmail);
                if (prof && !prof.locationAsked) {
                  setShowLocationPrompt(true);
                }
              } catch { /* non-fatal */ }
            }

            if (!profileExists && !window.location.pathname.includes('/register')) {
              console.log('No profile found, redirecting to register');
              setEmail(userEmail);
              setIsLoading(false);
              navigate('/register', { replace: true });
              return;
            }
          } catch (e) {
            console.error('Error connecting to SpacetimeDB:', e);
            setEmail(userEmail);
            setIsLoading(false);
            navigate('/register', { replace: true });
            return;
          }
        } catch (e) {
          console.error('Failed to parse token:', e);
          setIdentity(null as unknown as Identity);
        }
      } else {
        setIdentity(null as unknown as Identity);
      }

      setIsLoading(false);
    };

    initAuth();

    return () => {
      if (!auth.isAuthenticated) {
        disconnectFromSpacetimeDB();
      }
    };
  }, [auth.isAuthenticated, auth.user, navigate]);

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  const handleLocationAllow = async () => {
    setShowLocationPrompt(false);
    setIsSettingLocation(true);
    try {
      const pos = await getBrowserLocation();
      // Approximate precision is jittered ON DEVICE so the exact position never leaves
      const jittered = jitterLocation(pos.lat, pos.lng, 15);
      await updateLocation(jittered.lat, jittered.lng, 'approx');
    } catch {
      try { await updateLocation(0, 0, 'off'); } catch { /* non-fatal */ }
    }
    setIsSettingLocation(false);
  };

  const handleLocationDecline = async () => {
    setShowLocationPrompt(false);
    try { await updateLocation(0, 0, 'off'); } catch { /* non-fatal */ }
  };

  return (
    <AppContext.Provider value={{ identity, email, isLoading: false, hasProfile, setHasProfile }}>
      {children(true)}
      {showLocationPrompt && (
        <div className="loc-prompt-overlay" onClick={() => {}}>
          <div className="loc-prompt" onClick={(e) => e.stopPropagation()}>
            <h3>Allow location?</h3>
            <p>
              Veri Social uses your location to help you find people and organizations near you,
              and to help them find you.
            </p>
            <p>
              <strong>Only your approximate location (accurate within 15 miles) will be used</strong>{' '}
              — never your exact position. You can change this or turn location off completely at
              any time in your profile settings.
            </p>
            <div className="loc-prompt-actions">
              <button onClick={handleLocationDecline} className="loc-prompt-notnow" disabled={isSettingLocation}>Not now</button>
              <button onClick={handleLocationAllow} className="loc-prompt-allow" disabled={isSettingLocation}>
                {isSettingLocation ? 'Getting location…' : 'Allow'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .loc-prompt-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 300; padding: 24px; }
        .loc-prompt { background: white; border-radius: 12px; padding: 24px; max-width: 420px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        .loc-prompt h3 { margin: 0 0 12px; color: #333; font-size: 17px; }
        .loc-prompt p { margin: 0 0 10px; color: #444; font-size: 14px; line-height: 1.5; }
        .loc-prompt-actions { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
        .loc-prompt-notnow { padding: 8px 16px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .loc-prompt-allow { padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .loc-prompt-allow:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </AppContext.Provider>
  );
}

function PrivateRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (auth.isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthCallback>
      {() => children}
    </AuthCallback>
  );
}

function RedirectHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const redirectPath = sessionStorage.getItem('auth_redirect_path');
    if (redirectPath) {
      sessionStorage.removeItem('auth_redirect_path');
      navigate(redirectPath, { replace: true });
    }
  }, [navigate]);
  return null;
}

function LandingPage() {
  return <AboutPage />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppRoutes() {
  return (
    <>
      <ScrollToTop />
    <Routes>
      <Route path="/callback" element={<CallbackPage />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/profile/:identity" element={<ProfilePage />} />
      <Route path="/org/:id" element={<OrgProfilePage />} />
      <Route path="/register" element={<PrivateRoute><RegisterPage /></PrivateRoute>} />
      <Route path="/home" element={<><RedirectHandler /><PrivateRoute><MainFeedPage /></PrivateRoute></>} />
      <Route path="/me" element={<PrivateRoute><MyProfilePage /></PrivateRoute>} />
      <Route path="/follow/:ownerIdentity" element={<PrivateRoute><FollowPage /></PrivateRoute>} />
      <Route path="/notifications" element={<PrivateRoute><NotificationsPage /></PrivateRoute>} />
      <Route path="/friends" element={<PrivateRoute><FriendsPage /></PrivateRoute>} />
      <Route path="/messages/:identity" element={<PrivateRoute><DMChatPage /></PrivateRoute>} />
      <Route path="/org-chat/:id" element={<PrivateRoute><OrgChatPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider {...AUTH_CONFIG}>
      <BrowserRouter>
        <OrgProvider>
          <AppRoutes />
        </OrgProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
