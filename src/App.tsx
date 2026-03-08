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

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MainFeedPage from './pages/MainFeedPage';
import ProfilePage from './pages/ProfilePage';
import MyProfilePage from './pages/MyProfilePage';
import FollowPage from './pages/FollowPage';
import CallbackPage from './pages/CallbackPage';

interface AppContextType {
  identity: Identity | null;
  isLoading: boolean;
}

const AppContext = createContext<AppContextType>({
  identity: null,
  isLoading: true,
});

export const useApp = () => useContext(AppContext);

interface AuthCallbackProps {
  children: (isAuthenticated: boolean) => ReactNode;
}

function AuthCallback({ children }: AuthCallbackProps) {
  const auth = useAuth();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      if (auth.isAuthenticated) {
        // Get user identity from the auth token
        console.log('Authenticated user:', auth.user);
        // Extract sub from id_token JWT
        const idToken = auth.user?.id_token;
        if (idToken) {
          try {
            const payload = JSON.parse(atob(idToken.split('.')[1]));
            const sub = payload.sub;
            console.log('Identity from token:', sub);
            setIdentity({ toHexString: () => sub } as unknown as Identity);
          } catch (e) {
            console.error('Failed to parse token:', e);
            setIdentity(null as unknown as Identity);
          }
        } else {
          setIdentity(null as unknown as Identity);
        }
        
        // Check for pending follow from QR code
        const pendingFollow = localStorage.getItem('pending_follow');
        if (pendingFollow) {
          console.log('Pending follow found:', pendingFollow);
          localStorage.removeItem('pending_follow');
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, [auth.isAuthenticated]);

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <AppContext.Provider value={{ identity, isLoading: false }}>
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
