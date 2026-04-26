import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { connectToSpacetimeDB, checkProfileExistsByEmail } from '../utils/spacetime';

function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const hasRedirected = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  console.log('CallbackPage rendered, auth:', {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    pathname: location.pathname,
    search: location.search,
  });

  useEffect(() => {
    if (hasRedirected.current) return;

    const handleAuthSuccess = async () => {
      const idToken = auth.user?.id_token;
      const accessToken = auth.user?.access_token;

      if (!idToken || !accessToken) {
        console.error('No tokens found in auth.user:', auth.user);
        // User is authenticated but tokens are missing - let them try to register
        hasRedirected.current = true;
        navigate('/register', { replace: true });
        return;
      }

      try {
        const payload = JSON.parse(atob(idToken.split('.')[1]));
        const userEmail = payload.email;

        if (!userEmail) {
          console.error('No email in token payload:', payload);
          hasRedirected.current = true;
          navigate('/register', { replace: true });
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
        hasRedirected.current = true;

        if (!profileExists) {
          console.log('No profile found, redirecting to register');
          navigate('/register', { replace: true });
        } else {
          console.log('Profile exists, redirecting to home');
          navigate('/home', { replace: true });
        }
      } catch (e) {
        console.error('Error during callback:', e);
        // If DB connection fails, still let the user try to register
        hasRedirected.current = true;
        navigate('/register', { replace: true });
      }
    };

    // Timeout fallback - redirect to register after 10 seconds
    const timeoutId = setTimeout(() => {
      if (!hasRedirected.current) {
        console.log('Callback timeout, redirecting to register');
        hasRedirected.current = true;
        navigate('/register', { replace: true });
      }
    }, 10000);

    console.log('Callback checking auth:', {
      isAuthenticated: auth.isAuthenticated,
      isLoading: auth.isLoading,
      error: auth.error,
    });

    if (auth.isAuthenticated && auth.user) {
      clearTimeout(timeoutId);
      handleAuthSuccess();
      return;
    }

    if (auth.error) {
      console.error('Auth error:', auth.error);
      clearTimeout(timeoutId);
      hasRedirected.current = true;
      setErrorMsg(auth.error.message || 'Authentication failed. Please try again.');
      return;
    }

    // CRITICAL FIX: react-oidc-context has a race condition where isLoading
    // becomes false BEFORE isAuthenticated becomes true. If the URL still
    // has OIDC callback params (code or state), the auth is still processing.
    // Don't redirect away yet!
    const searchParams = new URLSearchParams(window.location.search);
    const hasCallbackParams = searchParams.has('code') || searchParams.has('state');

    if (!auth.isLoading && !auth.isAuthenticated && !hasCallbackParams) {
      console.log('Auth failed - not loading, not authenticated, and no callback params');
      clearTimeout(timeoutId);
      hasRedirected.current = true;
      navigate('/', { replace: true });
    }

    return () => clearTimeout(timeoutId);
  }, [auth.isAuthenticated, auth.isLoading, auth.error, auth.user, navigate]);

  return (
    <div className="callback-page">
      <div className="loading-container">
        {errorMsg ? (
          <>
            <p style={{ color: '#d32f2f', fontWeight: 500, marginBottom: 16 }}>
              {errorMsg}
            </p>
            <button
              onClick={() => navigate('/', { replace: true })}
              style={{
                padding: '8px 24px',
                borderRadius: 4,
                border: 'none',
                background: '#667eea',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Go Home
            </button>
          </>
        ) : (
          <>
            <div className="spinner"></div>
            <p>Completing sign in...</p>
          </>
        )}
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
