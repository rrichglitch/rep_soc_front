import { WebStorageStateStore, User } from 'oidc-client-ts';

export const APP_URL = 'https://veri.social';
export const BASE_PATH = import.meta.env.VITE_BASE_PATH || '';
// Oracle (self-hosted) — migrated from maincloud in 2026-06.
// The Oracle instance IP changed after the box was wiped on 2026-06-23.
// Old: 150.136.162.142. New: 129.80.36.57.
// `SPACETIMEDB_HOST` is just the host[:port] (no scheme). The frontend
// adds the `ws://` or `wss://` scheme based on window.location.protocol.
// IMPORTANT: the default MUST be the WSS host when running on a real
// HTTPS site. Setting this to a bare IP would make the browser block
// the connection as mixed content (HTTPS page → plain ws://).
// For local dev with the SSH tunnel, override with:
//   VITE_SPACETIMEDB_HOST=localhost:3300 npm run dev
export const SPACETIMEDB_HOST = import.meta.env.VITE_SPACETIMEDB_HOST || 'spacetimedb.veri.social';
export const SPACETIMEDB_MODULE = import.meta.env.VITE_SPACETIMEDB_MODULE || 'repsoc-oracle';

const getOrigin = () => {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    console.log('Auth origin:', origin);
    return origin;
  }
  return 'https://veri.social';
};

const origin = getOrigin();

// Environment variable overrides for local development and Oracle deployment.
// Defaults are maincloud; Oracle needs VITE_AUTH_AUTHORITY set to its own
// OIDC issuer (or to the empty string to disable SpacetimeAuth entirely).
const authAuthority = import.meta.env.VITE_AUTH_AUTHORITY ?? 'https://auth.spacetimedb.com/oidc';
const authClientId = import.meta.env.VITE_AUTH_CLIENT_ID || 'client_032dcrU7dNeqH21pwTabNC';

// SpacetimeAuth configuration
export const AUTH_CONFIG = {
  authority: authAuthority,
  client_id: authClientId,
  redirect_uri: `${origin}/callback`,
  post_logout_redirect_uri: origin,
  scope: 'openid profile email',
  response_type: 'code',
  automaticSilentRenew: true,
  filterProtocolClaims: true,
  loadUserInfo: false,
  userStore: new WebStorageStateStore({
    store: localStorage,
  }),
  onSigninCallback: (user: User | void) => {
    console.log('User signed in:', user);
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

console.log('AUTH_CONFIG:', AUTH_CONFIG);

export const CHAR_LIMITS = {
  fullName: 100,
  city: 100,
  description: 500,
  storyContent: 2000,
} as const;

export const MAX_MEDIA_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_MEDIA_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'video/mp4',
  'video/webm',
] as const;

export const RATE_LIMIT_HOURS = 0;

// Cloudflare Turnstile site key (public)
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAADHTL34hzoQvhfs4';
