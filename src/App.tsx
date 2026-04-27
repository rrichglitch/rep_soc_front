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
import { connectToSpacetimeDB, checkProfileExistsByEmail, createProfile, disconnectFromSpacetimeDB } from './utils/spacetime';

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

interface AppContextType {
  identity: Identity | null;
  email: string | null;
  isLoading: boolean;
  hasProfile: boolean;
  setHasProfile: (has: boolean) => void;
  createProfile: (fullName: string, profilePicture: string, city: string, description: string) => Promise<void>;
}

const AppContext = createContext<AppContextType>({
  identity: null,
  email: null,
  isLoading: true,
  hasProfile: false,
  setHasProfile: () => {},
  createProfile: async () => {},
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

  const setHasProfile = (has: boolean) => {
    setHasProfileState(has);
  };

  const handleCreateProfile = async (fullName: string, profilePicture: string, city: string, description: string) => {
    if (!email) {
      throw new Error('No email');
    }
    await createProfile(email, fullName, profilePicture, city, description);
    setHasProfile(true);
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

            // Poll for profile up to 1 second
            let profileExists = false;
            for (let i = 0; i < 10; i++) {
              profileExists = await checkProfileExistsByEmail(userEmail);
              if (profileExists) break;
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log('Profile exists in DB:', profileExists);
            setHasProfileState(profileExists);

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
      
      const pendingFollow = localStorage.getItem('pending_follow');
      if (pendingFollow) {
        console.log('Pending follow found:', pendingFollow);
        localStorage.removeItem('pending_follow');
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

  console.log('AuthCallback isAuth:', auth.isAuthenticated);

  if (!auth.isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return (
    <AppContext.Provider value={{ identity, email, isLoading: false, hasProfile, setHasProfile, createProfile: handleCreateProfile }}>
      {children(true)}
    </AppContext.Provider>
  );
}

function PrivateRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();

  console.log('PrivateRoute check:', {
    isAuthenticated: auth.isAuthenticated,
    hasUser: !!auth.user,
    isLoading: auth.isLoading,
  });

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
  const location = useLocation();
  console.log('Current path:', location.pathname);

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
      <Route
        path="/profile/:identity"
        element={<ProfilePage />}
      />
      <Route
        path="/register"
        element={
          <PrivateRoute>
            <RegisterPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/home"
        element={
          <>
            <RedirectHandler />
            <PrivateRoute>
              <MainFeedPage />
            </PrivateRoute>
          </>
        }
      />
      <Route
        path="/me"
        element={
          <PrivateRoute>
            <MyProfilePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/follow/:ownerIdentity"
        element={
          <PrivateRoute>
            <FollowPage />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider {...AUTH_CONFIG}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
