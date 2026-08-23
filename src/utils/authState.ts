// Unified auth state across both session types:
//  - OAuth relay sessions (Google/Facebook) — localStorage-based
//  - Legacy SpacetimeCloud-OIDC sessions — react-oidc-context
import { getOAuthSession } from './oauthSession';

interface OidcLike {
  isAuthenticated: boolean;
  user?: { id_token?: string } | null;
}

function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    return payload.email ?? null;
  } catch {
    return null;
  }
}

// Email of the signed-in user regardless of session type. Pass the value of
// useAuth() when available so legacy OIDC sessions resolve too.
export function currentUserEmail(auth?: OidcLike): string | null {
  const oauth = getOAuthSession();
  if (oauth?.email) return oauth.email;
  return emailFromIdToken(auth?.user?.id_token);
}

export function isSignedIn(auth?: OidcLike): boolean {
  return Boolean(getOAuthSession()) || Boolean(auth?.isAuthenticated);
}