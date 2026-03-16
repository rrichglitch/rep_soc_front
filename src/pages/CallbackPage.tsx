import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

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

    // Timeout fallback - redirect to about page after 1 second
    const timeoutId = setTimeout(() => {
      if (!hasRedirected.current) {
        console.log('Callback timeout, redirecting to about');
        hasRedirected.current = true;
        navigate('/', { replace: true });
      }
    }, 1000);

    console.log('Callback checking auth:', {
      isAuthenticated: auth.isAuthenticated,
      isLoading: auth.isLoading,
      error: auth.error
    });

    // If authenticated, redirect to about page
    if (auth.isAuthenticated) {
      console.log('User authenticated, redirecting');
      clearTimeout(timeoutId);
      hasRedirected.current = true;
      navigate('/', { replace: true });
      return;
    }

    // If there's an error, redirect to about page
    if (auth.error) {
      console.error('Auth error:', auth.error);
      clearTimeout(timeoutId);
      hasRedirected.current = true;
      navigate('/', { replace: true });
      return;
    }

    // If not loading and not authenticated, redirect to about page
    if (!auth.isLoading && !auth.isAuthenticated) {
      console.log('Auth failed - not loading and not authenticated');
      clearTimeout(timeoutId);
      hasRedirected.current = true;
      navigate('/', { replace: true });
    }

    return () => clearTimeout(timeoutId);
  }, [auth.isAuthenticated, auth.isLoading, auth.error, navigate]);

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
