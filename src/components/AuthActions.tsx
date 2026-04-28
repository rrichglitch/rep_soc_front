import { Link } from 'react-router-dom';
import { useAuthProfile } from '../hooks/useAuthProfile';

function AuthActions() {
  const { isLoggedIn, profilePicture, handleSignIn } = useAuthProfile();

  if (isLoggedIn) {
    return (
      <Link to="/home" className="topbar-profile-link">
        {profilePicture ? (
          <img src={profilePicture} alt="My Profile" className="topbar-profile-image" />
        ) : (
          <div className="topbar-profile-placeholder" />
        )}
      </Link>
    );
  }

  return (
    <button onClick={handleSignIn} className="topbar-signin">
      Sign In
    </button>
  );
}

export default AuthActions;
