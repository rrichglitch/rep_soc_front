import { useState, useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { connectToSpacetimeDB, getProfileByEmail } from '../utils/spacetime';

export function useAuthProfile() {
  const auth = useAuth();
  const [profilePicture, setProfilePicture] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleSignIn = () => {
    auth.signinRedirect();
  };

  useEffect(() => {
    const initAuth = async () => {
      if (!auth.isAuthenticated) {
        try {
          await connectToSpacetimeDB('', undefined);
        } catch (e) {
          console.log('Anonymous connect failed:', e);
        }
        return;
      }

      const token = auth.user?.access_token;
      if (!token) return;

      try {
        await connectToSpacetimeDB('', token);

        let userEmail: string | undefined;
        if (auth.user?.id_token) {
          try {
            const payload = JSON.parse(atob(auth.user.id_token.split('.')[1]));
            userEmail = payload.email;
          } catch (e) {
            console.error('Failed to parse token:', e);
          }
        }

        if (userEmail) {
          for (let i = 0; i < 10; i++) {
            const profile = await getProfileByEmail(userEmail);
            if (profile) {
              setProfilePicture(profile.profilePicture);
              setIsLoggedIn(true);
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } catch (e) {
        console.error('Auth connect failed:', e);
      }
    };

    initAuth();
  }, [auth.isAuthenticated, auth.user]);

  return { isLoggedIn, profilePicture, handleSignIn };
}
