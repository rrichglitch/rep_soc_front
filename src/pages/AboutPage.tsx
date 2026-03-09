import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../App';
import { useAuth } from 'react-oidc-context';
import { getProfileByEmail, connectToSpacetimeDB } from '../utils/spacetime';
import SearchBar from '../components/SearchBar';

function AboutPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { email } = useApp();
  const [profilePicture, setProfilePicture] = useState<string>('');

  const isAuthenticated = auth.isAuthenticated;
  const hasReferrer = document.referrer.includes(window.location.host);

  const handleSignIn = () => {
    auth.signinRedirect();
  };

  useEffect(() => {
    const loadProfile = async () => {
      if (email) {
        const profile = await getProfileByEmail(email);
        if (profile) {
          setProfilePicture(profile.profilePicture);
        }
      }
    };
    loadProfile();
  }, [email]);

  useEffect(() => {
    const tryAutoConnect = async () => {
      if (isAuthenticated) return;
      
      const token = auth.user?.access_token;
      if (token) {
        try {
          await connectToSpacetimeDB('', token);
        } catch (e) {
          console.log('Auto-connect failed:', e);
        }
      }
    };
    tryAutoConnect();
  }, [isAuthenticated, auth.user]);

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div className="about-page">
      <header className="header">
        <div className="header-left">
          {hasReferrer ? (
            <button onClick={() => navigate(-1)} className="back-button">← Back</button>
          ) : (
            <span />
          )}
        </div>
        <div className="header-center">
          <SearchBar onSearch={handleSearch} />
        </div>
        <div className="header-right">
          {isAuthenticated ? (
            <Link to="/me" className="profile-link">
              {profilePicture ? (
                <img src={profilePicture} alt="My Profile" className="profile-image" />
              ) : (
                <div className="profile-placeholder" />
              )}
            </Link>
          ) : (
            <button onClick={handleSignIn} className="signin-button">
              Sign In
            </button>
          )}
        </div>
      </header>

      <main className="about-content">
        <h1 className="main-logo">Reputable Social</h1>

        <div className="about-section">
          <h2>Why Trust Matters</h2>
          <p>
            In an age of endless options and infinite information, how do we know who to trust? 
            Traditional social networks reward popularity and viral content, but what we really 
            need is a way to evaluate reliability and character.
          </p>
          <p>
            Trust is our most valuable currency. Whether you're choosing a business partner, 
            someone to collaborate with, or deciding to open up to someone, you want to know: 
            <strong> can I count on this person?</strong>
          </p>
        </div>

        <div className="about-section">
          <h2>What Is Reputable Social?</h2>
          <p>
            Reputable Social is a social network built around reputation. Instead of 
            posting content for the masses, every post you make is about someone else—it's 
            a public attestation of your experience with them.
          </p>
          <p>
            Think of it as <strong>Yelp for people</strong>. When you have a positive (or 
            negative) experience with someone, you can post about it on their profile. 
            These reviews accumulate over time, building a trustworthy picture of who that 
            person really is.
          </p>
        </div>

        <div className="about-section">
          <h2>How It Works</h2>
          <ul>
            <li>
              <strong>Create Your Profile</strong> – Sign up and build your reputation page. 
              This is where others will post about their experiences with you.
            </li>
            <li>
              <strong>Post About Others</strong> – Share your honest experiences with people 
              you've interacted with. Did they deliver? Were they reliable? Would you recommend them?
            </li>
            <li>
              <strong>Build Your Network</strong> – Follow friends, family, and acquaintances to see 
              what others are saying about them. Discover who others recommend.
            </li>
            <li>
              <strong>Grow Your Reputation</strong> – As others post about their positive 
              experiences with you, your reputation grows. Future connections can see 
              your track record at a glance.
            </li>
          </ul>
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
          <p>
            In a world drowning in information but starving for truth, 
            <strong> reputation is the antidote</strong>. Join us in building a social 
            network where character counts and trust is earned.
          </p>
          {isAuthenticated ? (
            <Link to="/home" className="cta-button">Go to Feed</Link>
          ) : (
            <button onClick={handleSignIn} className="cta-button">Get Started</button>
          )}
        </div>
      </main>

      <style>{`
        .about-page {
          min-height: 100vh;
          background: #f5f5f5;
        }

        .header {
          position: sticky;
          top: 0;
          background: white;
          padding: 12px 24px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          z-index: 100;
        }

        .header-left {
          display: flex;
          align-items: center;
          justify-content: flex-start;
        }

        .header-center {
          display: flex;
          justify-content: center;
          width: 100%;
          max-width: 600px;
        }

        .header-center .search-bar {
          width: 100%;
          max-width: 500px;
        }

        .header-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }

        .signin-button {
          padding: 8px 16px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .signin-button:hover {
          background: #5a6fd6;
        }

        .back-button {
          color: #667eea;
          text-decoration: none;
          font-size: 16px;
          font-weight: 600;
        }

        .back-button:hover {
          color: #5a6fd6;
        }

        .profile-link {
          display: block;
        }

        .profile-placeholder {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #e0e0e0;
        }

        .profile-image {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
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

        .cta-button {
          display: inline-block;
          margin-top: 16px;
          padding: 12px 32px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
        }

        .cta-button:hover {
          background: #5a6fd6;
        }

        @media (max-width: 640px) {
          .header {
            padding: 10px 16px;
          }

          .header-center {
            display: none;
          }

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
        }
      `}</style>
    </div>
  );
}

export default AboutPage;
