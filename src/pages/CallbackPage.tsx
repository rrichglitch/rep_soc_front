import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (hasRedirected.current) return;

    console.log('Callback checking auth:', {
      isAuthenticated: auth.isAuthenticated,
      isLoading: auth.isLoading,
      error: auth.error
    });

    // If authenticated, redirect immediately
    if (auth.isAuthenticated) {
      console.log('User authenticated, redirecting');
      hasRedirected.current = true;
      const pendingProfile = localStorage.getItem('pending_profile');
      navigate(pendingProfile ? '/me' : '/', { replace: true });
      return;
    }

    // If there's an error, redirect to login
    if (auth.error) {
      console.error('Auth error:', auth.error);
      hasRedirected.current = true;
      navigate('/login', { replace: true });
      return;
    }

    // If not loading and not authenticated, something went wrong
    if (!auth.isLoading && !auth.isAuthenticated) {
      console.log('Auth failed - not loading and not authenticated');
      hasRedirected.current = true;
      navigate('/login', { replace: true });
    }
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
