import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (hasRedirected.current) return;

    const handleAuth = async () => {
      // Wait for auth to load if still loading
      if (auth.isLoading) {
        return;
      }

      if (auth.isAuthenticated && !hasRedirected.current) {
        hasRedirected.current = true;
        const pendingProfile = localStorage.getItem('pending_profile');
        if (pendingProfile) {
          navigate('/me', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      } else if (auth.error) {
        console.error('Auth error:', auth.error);
        navigate('/login', { replace: true });
      } else if (!auth.isLoading && !auth.isAuthenticated) {
        // Not loading, not authenticated - try to trigger sign in
        console.log('Not authenticated, attempting signin redirect');
        auth.signinRedirect();
      }
    };

    handleAuth();
  }, [auth.isAuthenticated, auth.isLoading, auth.error, auth.signinRedirect, navigate]);

  // Fallback timeout to prevent stuck state
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasRedirected.current) {
        console.log('Callback timeout - forcing redirect to login');
        navigate('/login', { replace: true });
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="callback-page">
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Completing sign in...</p>
      </div>

      <p style={{fontSize: '12px', color: '#999', marginTop: '20px'}}>
        Debug: {auth.isLoading ? 'Loading...' : auth.isAuthenticated ? 'Authenticated!' : 'Not authenticated'}
        {auth.error && ` - Error: ${auth.error.message}`}
      </p>

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
