import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { connectToSpacetimeDB, checkProfileExistsByEmail } from '../utils/spacetime';

function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const hasRedirected = useRef(false);

  console.log('CallbackPage rendered, auth:', {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    pathname: location.pathname
  });

  useEffect(() => {
    if (hasRedirected.current) return;

    const handleAuthSuccess = async () => {
      const idToken = auth.user?.id_token;
      const accessToken = auth.user?.access_token;

      if (!idToken || !accessToken) {
        console.error('No tokens found');
        navigate('/', { replace: true });
        return;
      }

      try {
        const payload = JSON.parse(atob(idToken.split('.')[1]));
        const userEmail = payload.email;

        if (!userEmail) {
          console.error('No email in token');
          navigate('/', { replace: true });
          return;
        }

        await connectToSpacetimeDB(userEmail, accessToken);

        let profileExists = false;
        for (let i = 0; i < 10; i++) {
          profileExists = await checkProfileExistsByEmail(userEmail);
          if (profileExists) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('Profile exists in DB:', profileExists);

        if (!profileExists) {
          console.log('No profile found, redirecting to register');
          navigate('/register', { replace: true });
        } else {
          console.log('Profile exists, redirecting to home');
          navigate('/home', { replace: true });
        }
      } catch (e) {
        console.error('Error during callback:', e);
        navigate('/', { replace: true });
      }
    };

    // Timeout fallback - redirect to about page after 5 seconds
    const timeoutId = setTimeout(() => {
      if (!hasRedirected.current) {
        console.log('Callback timeout, redirecting to about');
        hasRedirected.current = true;
        navigate('/', { replace: true });
      }
    }, 5000);

    console.log('Callback checking auth:', {
      isAuthenticated: auth.isAuthenticated,
      isLoading: auth.isLoading,
      error: auth.error
    });

    if (auth.isAuthenticated && auth.user) {
      hasRedirected.current = true;
      clearTimeout(timeoutId);
      handleAuthSuccess();
      return;
    }

    if (auth.error) {
      console.error('Auth error:', auth.error);
      clearTimeout(timeoutId);
      hasRedirected.current = true;
      navigate('/', { replace: true });
      return;
    }

    if (!auth.isLoading && !auth.isAuthenticated) {
      console.log('Auth failed - not loading and not authenticated');
      clearTimeout(timeoutId);
      hasRedirected.current = true;
      navigate('/', { replace: true });
    }

    return () => clearTimeout(timeoutId);
  }, [auth.isAuthenticated, auth.isLoading, auth.error, auth.user, navigate]);

  return (
    <div className="callback-page">
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Completing sign in...</p>
      </div>

      <style>{`
        .callback-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
        }
        .loading-container {
          text-align: center;
        }
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e0e0e0;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        p {
          color: #666;
        }
      `}</style>
    </div>
  );
}

export default CallbackPage;
