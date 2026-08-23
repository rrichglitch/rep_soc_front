import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { connectToSpacetimeDB, checkProfileExistsByEmail } from '../utils/spacetime';
import { setOAuthSession } from '../utils/oauthSession';
import { oauthClaimProfile } from '../utils/oauthRelay';

function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  console.log('CallbackPage rendered, auth:', {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    hash: window.location.hash.slice(0, 80),
    search: window.location.search.slice(0, 80),
  });

  // OAuth relay callback: /callback#st_token=..&provider=..&email=..&...
  const handleOAuthCallback = async (params: URLSearchParams) => {
    const errorParam = params.get('error');
    if (errorParam) {
      hasRedirected.current = true;
      setErrorMsg(decodeURIComponent(errorParam));
      return;
    }

    const stToken = params.get('st_token');
    const provider = params.get('provider');
    const sub = params.get('sub');
    const email = params.get('email');
    const name = params.get('name');
    const picture = params.get('picture');
    const oauthToken = params.get('oauth_token');
    const identityHex = params.get('identity_hex');

    if (!stToken || !provider || !sub || !email) {
      console.error('OAuth callback missing parameters:', {
        hasToken: Boolean(stToken),
        provider,
        sub: Boolean(sub),
        email: Boolean(email),
      });
      hasRedirected.current = true;
      setErrorMsg('Sign-in response was incomplete. Please try again.');
      return;
    }

    // Clean the URL so a refresh doesn't re-process the callback
    window.history.replaceState({}, document.title, window.location.pathname);

    try {
      setOAuthSession({
        stToken,
        provider: provider === 'facebook' ? 'facebook' : 'google',
        sub,
        email,
        name: name || '',
        picture: picture || '',
        oauthToken: oauthToken || '',
        identityHex: identityHex || '',
      });

      await connectToSpacetimeDB(email, stToken);

      // New OAuth users have a brand-new identity. If a profile with this email
      // already exists (legacy SpacetimeCloud-OIDC account), claim it — the
      // procedure verifies the provider access token server-side.
      if (oauthToken && identityHex) {
        const claim = await oauthClaimProfile(
          provider === 'facebook' ? 'facebook' : 'google',
          oauthToken,
          sub,
          email,
          identityHex
        );
        console.log('OAuth claim result:', claim);

        if (claim.success) {
          hasRedirected.current = true;
          navigate('/home', { replace: true });
          return;
        }
        if (claim.error && !claim.error.includes('No profile')) {
          // Verification hiccup — let the user retry; keep them on register
          // fallback below only when there is genuinely no profile.
          console.warn('OAuth claim failed:', claim.error);
        }
      }

      // Claim is either irrelevant (brand-new user) or failed with a
      // "no profile" answer — decide by what the DB actually has.
      let profileExists = false;
      for (let i = 0; i < 10; i++) {
        profileExists = await checkProfileExistsByEmail(email);
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
      console.error('Error during OAuth callback:', e);
      // If DB connection fails, still let the user try to register
      hasRedirected.current = true;
      navigate('/register', { replace: true });
    }
  };

  useEffect(() => {
    if (hasRedirected.current) return;

    // OAuth relay redirect (fragment carries the session)
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (hashParams.get('st_token') || hashParams.get('error')) {
      handleOAuthCallback(hashParams);
      return;
    }

    // Handle Didit identity verification callback
    const searchParams = new URLSearchParams(window.location.search);
    const diditSessionId = searchParams.get('verificationSessionId');

    if (diditSessionId) {
      console.log('Didit callback detected, forwarding to /register with params');
      hasRedirected.current = true;
      navigate(`/register?${searchParams.toString()}`, { replace: true });
      return;
    }

    const handleAuthSuccess = async () => {
      const idToken = auth.user?.id_token;
      const accessToken = auth.user?.access_token;

      if (!idToken || !accessToken) {
        console.error('No tokens found in auth.user:', auth.user);
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

        hasRedirected.current = true;
        if (!profileExists) {
          navigate('/register', { replace: true });
        } else {
          navigate('/home', { replace: true });
        }
      } catch (e) {
        console.error('Error during callback:', e);
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