import { useState, useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { connectToSpacetimeDB, getProfileByEmail } from '../utils/spacetime';
import { getOAuthSession, clearOAuthSession } from '../utils/oauthSession';

export function useAuthProfile() {
  const auth = useAuth();
  const [profilePicture, setProfilePicture] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleSignIn = () => {
    auth.signinRedirect();
  };

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      // --- OAuth relay session (Google/Facebook) ---
      const oauthSession = getOAuthSession();
      if (oauthSession) {
        try {
          await connectToSpacetimeDB(oauthSession.email, oauthSession.stToken);
          for (let i = 0; i < 10; i++) {
            if (cancelled) return;
            const profile = await getProfileByEmail(oauthSession.email);
            if (profile) {
              setProfilePicture(profile.profilePicture);
              setIsLoggedIn(true);
              return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (e) {
          console.error('OAuth session connect failed:', e);
          clearOAuthSession();
        }
        if (!cancelled) setIsLoggedIn(false);
        return;
      }

      // --- Legacy OIDC session ---
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
            if (cancelled) return;
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
    return () => { cancelled = true; };
  }, [auth.isAuthenticated, auth.user]);

  return { isLoggedIn, profilePicture, handleSignIn };
}