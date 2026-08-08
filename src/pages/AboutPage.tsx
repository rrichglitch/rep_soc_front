import { useNavigate, Link } from 'react-router-dom';
import TopBar from '../components/TopBar';
import SearchBar from '../components/SearchBar';
import AuthActions from '../components/AuthActions';
import { useAuthProfile } from '../hooks/useAuthProfile';

function AboutPage() {
  const navigate = useNavigate();
  const { isLoggedIn, handleSignIn } = useAuthProfile();

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div className="about-page">
      <TopBar
        left={
          <Link to={isLoggedIn ? "/home" : "/"} className="topbar-logo">
            <img src="/veri.png" alt="Veri Social" />
          </Link>
        }
        center={<div className="topbar-search-wrap"><SearchBar onSearch={handleSearch} /></div>}
        absoluteCenter
        right={<AuthActions />}
      />

      <main className="about-content">
        <h1 className="main-logo">Veri Social</h1>

        <div className="about-section">
          <h2>What Is Veri Social?</h2>
          <p>
            Veri Social is a social network with some similarities to Yelp, Bumble, LinkedIn,
            Substack, and Fiverr. We strive to give our community a platform to facilitate
            interactions based in trust and staked on their own reputations. Veri Social will
            help you to find the people or organizations that you are looking for and build
            your reputation. Our platform features a highly comprehensive and expressive
            search which allows you to describe exactly what you're looking for instead of
            using predetermined filters. And we emphasize what others have to say about you
            alongside how you describe yourself. We do not prioritize broadcasting corporate
            messaging to an audience and instead put all our focus into enabling our users
            to find what they are looking for with reliable information.
          </p>
        </div>

        <div className="about-section">
          <h2>What Can It Do For You?</h2>
          <ul>
            <li>
              <strong>For Individuals</strong> – Build a reputation that speaks for itself. 
              Stand out in a world where anyone can claim anything about themselves.
            </li>
            <li>
              <strong>For Businesses</strong> – Find trustworthy partners, contractors, and 
              collaborators. See real recommendations from real people.
            </li>
            <li>
              <strong>For Communities</strong> – Create networks of verified, reliable 
              individuals. Build trust from the ground up.
            </li>
          </ul>
        </div>

        <div className="about-section">
          <h2>How It Works</h2>
          <ul>
            <li>We verify all users on our platform.</li>
            <li>You use our state of the art search to find exactly what you're looking for.</li>
            <li>Our community guarantees the legitimacy of who you find through their reputation.</li>
          </ul>
        </div>

        <div className="cta-section">
          {isLoggedIn ? (
            <Link to="/home" className="cta-button">Go to Home</Link>
          ) : (
            <button onClick={handleSignIn} className="cta-button">Get Started</button>
          )}
        </div>
      </main>

      <footer className="about-footer">
        <div className="footer-content">
          <span className="footer-copyright">&copy; 2026 Veri Social</span>
          <div className="footer-links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <a href="mailto:dev@veri.social">Contact Us</a>
          </div>
        </div>
      </footer>

      <style>{`
        .topbar-search-wrap {
          width: 100%;
          max-width: 500px;
        }

        .about-page {
          min-height: 100vh;
          background: #f5f5f5;
          display: flex;
          flex-direction: column;
        }

        .about-content {
          max-width: 700px;
          margin: 0 auto;
          padding: 40px 24px;
        }

        .main-logo {
          text-align: center;
          font-size: 36px;
          color: #667eea;
          margin: 0 0 40px;
        }

        .about-section {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .about-section h2 {
          margin: 0 0 16px;
          font-size: 22px;
          color: #333;
        }

        .about-section p {
          margin: 0 0 16px;
          line-height: 1.7;
          color: #444;
        }

        .about-section p:last-child {
          margin-bottom: 0;
        }

        .about-section ul {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .about-section li {
          margin-bottom: 16px;
          line-height: 1.6;
          color: #444;
        }

        .about-section li:last-child {
          margin-bottom: 0;
        }

        .about-section li strong {
          color: #333;
        }

        .about-section strong {
          color: #667eea;
        }

        .cta-section {
          display: flex;
          justify-content: center;
          margin: 8px 0 24px;
        }

        .cta-button {
          display: inline-block;
          padding: 12px 32px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          text-decoration: none;
          cursor: pointer;
        }

        .cta-button:hover {
          background: #5a6fd6;
        }

        .about-footer {
          background: #fff;
          border-top: 1px solid #e0e0e0;
          padding: 16px 24px;
          margin-top: auto;
        }

        .footer-content {
          max-width: 700px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .footer-copyright {
          color: #666;
          font-size: 14px;
        }

        .footer-links {
          display: flex;
          gap: 16px;
        }

        .footer-links a {
          color: #667eea;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }

        .footer-links a:hover {
          text-decoration: underline;
        }

        @media (max-width: 640px) {
          .about-content {
            padding: 24px 16px;
          }

          .main-logo {
            font-size: 28px;
          }

          .about-section {
            padding: 20px;
          }

          .about-section h2 {
            font-size: 20px;
          }

          .footer-content {
            flex-direction: column;
            text-align: center;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}

export default AboutPage;
