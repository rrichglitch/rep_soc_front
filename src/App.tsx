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
              
              // Check if profile exists in SpaceTimeDB by email
              const profileExists = await checkProfileExistsByEmail(userEmail);
              console.log('Profile exists in DB:', profileExists);
              setHasProfileState(profileExists);
              
              // If no profile exists, redirect to register
              if (!profileExists && location.pathname !== '/register') {
                console.log('No profile found, redirecting to register');
                navigate('/register', { replace: true });
                setIsLoading(false);
                return;
              }
            } catch (e) {
              console.error('Error connecting to SpacetimeDB:', e);
              // Still allow access even if SpacetimeDB fails - redirect to register
              setEmail(userEmail);
              navigate('/register', { replace: true });
              setIsLoading(false);
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

    // Cleanup on unmount
    return () => {
      disconnectFromSpacetimeDB();
    };
  }, [auth.isAuthenticated, navigate, location.pathname]);

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!auth.isAuthenticated) {
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

  if (!auth.isAuthenticated) {
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
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/callback" element={<CallbackPage />} />
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
