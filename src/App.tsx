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
import { connectToSpacetimeDB, checkProfileExistsByEmail, createProfile, disconnectFromSpacetimeDB, getStoredCredentials } from './utils/spacetime';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MainFeedPage from './pages/MainFeedPage';
import ProfilePage from './pages/ProfilePage';
import MyProfilePage from './pages/MyProfilePage';
import FollowPage from './pages/FollowPage';
import CallbackPage from './pages/CallbackPage';

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
      if (auth.isAuthenticated) {
        console.log('Authenticated user:', auth.user);
        
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
            
            // Connect to SpacetimeDB with email and token
            try {
              await connectToSpacetimeDB(userEmail, accessToken);
              
              // Wait for subscription to sync and check profile
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              let profileExists = await checkProfileExistsByEmail(userEmail);
              
              // If not found, try one more time after another delay (in case of race condition)
              if (!profileExists) {
                console.log('Profile not found initially, retrying...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                profileExists = await checkProfileExistsByEmail(userEmail);
              }
              
              console.log('Profile exists in DB:', profileExists);
              setHasProfileState(profileExists);
              
              // If no profile exists, redirect to register
              if (!profileExists && !window.location.pathname.includes('/register')) {
                console.log('No profile found, redirecting to register');
                setEmail(userEmail);
                setIsLoading(false);
                navigate('/register', { replace: true });
                return;
              }
            } catch (e) {
              console.error('Error connecting to SpacetimeDB:', e);
              // Still allow access even if SpacetimeDB fails - redirect to register
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
      }
      setIsLoading(false);
    };

    initAuth();

    // Cleanup on unmount only - don't disconnect on re-renders
    return () => {
      // Only disconnect if auth is no longer valid
      if (!auth.isAuthenticated) {
        disconnectFromSpacetimeDB();
      }
    };
  }, [auth.isAuthenticated]);

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  // Check both auth and stored token
  const credentials = getStoredCredentials();
  const hasStoredToken = credentials.token && credentials.token.length > 0;
  const isAuth = auth.isAuthenticated || hasStoredToken;
  
  console.log('AuthCallback isAuth:', isAuth, 'hasStoredToken:', !!hasStoredToken);
  
  if (!isAuth) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <AppContext.Provider value={{ identity, email, isLoading: false, hasProfile, setHasProfile, createProfile: handleCreateProfile }}>
      {children(true)}
    </AppContext.Provider>
  );
}

function PrivateRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const credentials = getStoredCredentials();
  
  // Debug: log ALL localStorage keys to see what's there
  console.log('localStorage keys:', Object.keys(localStorage));
  
  // Check for OIDC storage (react-oidc-context default is "oidc.user:{authority}:{clientId}")
  const oidcStorageKey = `oidc.user:${AUTH_CONFIG.authority}:${AUTH_CONFIG.client_id}`;
  const oidcUser = localStorage.getItem(oidcStorageKey);
  const stdbToken = localStorage.getItem('stdb_token');
  
  console.log('PrivateRoute check:', {
    isAuthenticated: auth.isAuthenticated,
    hasUser: !!auth.user,
    hasStoredToken: !!credentials.token,
    hasOidcStorage: !!oidcUser,
    stdbToken: !!stdbToken,
    storedTokenLength: credentials.token?.length
  });

  if (auth.isLoading) {
    return <div className="loading">Loading...</div>;
  }

  // Allow access if OIDC says authenticated OR if we have a stored token OR if OIDC storage has user
  const hasStoredToken = credentials.token && credentials.token.length > 0;
  const isAuth = auth.isAuthenticated || auth.user || hasStoredToken || !!oidcUser || !!stdbToken;
  
  console.log('isAuth:', isAuth);
  
  if (!isAuth) {
    return <Navigate to="/login" replace />;
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
      // Extract the path and query from the stored URL
      const match = redirectPath.match(/\/rep_soc_front(\/[^?]*)?(\?.*)?/);
      if (match) {
        const path = match[1] || '/';
        const query = match[2] || '';
        navigate(path + query, { replace: true });
      }
    }
  }, [navigate]);
  
  return null;
}

function AppRoutes() {
  const location = useLocation();
  console.log('Current path:', location.pathname);
  
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/callback" element={<CallbackPage />} />
      <Route
        path="/register"
        element={
          <PrivateRoute>
            <RegisterPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/"
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
        path="/profile/:identity"
        element={
          <PrivateRoute>
            <ProfilePage />
          </PrivateRoute>
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
      <Route path="*" element={
        <div className="loading">Unknown route - loading auth...</div>
      } />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider {...AUTH_CONFIG}>
      <BrowserRouter basename="/rep_soc_front">
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
