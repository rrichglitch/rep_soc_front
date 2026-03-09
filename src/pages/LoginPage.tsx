import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [auth.isAuthenticated, navigate, from]);

  const handleLogin = () => {
    auth.signinRedirect();
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Reputable Social</h1>
        <p className="tagline">What others say about you matters</p>

        <div className="login-form">
          <button onClick={handleLogin} className="login-button primary">
            Sign In
          </button>
        </div>

        <p className="terms">
          By signing in, you agree to our terms of service and privacy policy.
        </p>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
        }

        .login-container {
          background: white;
          border-radius: 16px;
          padding: 48px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        h1 {
          text-align: center;
          margin: 0 0 8px;
          color: #333;
          font-size: 28px;
        }

        .tagline {
          text-align: center;
          color: #666;
          margin: 0 0 32px;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .login-button, .register-button {
          padding: 14px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
          text-decoration: none;
        }

        .login-button.primary {
          background: #667eea;
          color: white;
          border: none;
        }

        .login-button.primary:hover {
          background: #5568d3;
          transform: translateY(-1px);
        }

        .register-button {
          background: white;
          color: #667eea;
          border: 2px solid #667eea;
        }

        .register-button:hover {
          background: #667eea;
          color: white;
        }

        .divider {
          display: flex;
          align-items: center;
          margin: 8px 0;
        }

        .divider::before, .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #e0e0e0;
        }

        .divider span {
          padding: 0 16px;
          color: #999;
          font-size: 14px;
        }

        .terms {
          text-align: center;
          margin-top: 12px;
          font-size: 12px;
          color: #999;
        }

        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          font-size: 18px;
          color: #666;
        }
      `}</style>
    </div>
  );
}

export default LoginPage;
