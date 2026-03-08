import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    // Give auth time to process the callback
    const timer = setTimeout(() => {
      if (auth.isAuthenticated) {
        const pendingProfile = localStorage.getItem('pending_profile');
        navigate(pendingProfile ? '/me' : '/', { replace: true });
      } else if (auth.error) {
        console.error('Auth error:', auth.error);
        navigate('/login', { replace: true });
      } else if (!auth.isLoading) {
        // Auth not loading and not authenticated - redirect to login
        navigate('/login', { replace: true });
      }
    }, 2000);

    return () => clearTimeout(timer);
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
