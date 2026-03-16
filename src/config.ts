import { WebStorageStateStore, User } from 'oidc-client-ts';

export const APP_URL = 'https://reputable.social';
export const BASE_PATH = import.meta.env.VITE_BASE_PATH || '';
export const SPACETIMEDB_HOST = 'maincloud.spacetimedb.com';
export const SPACETIMEDB_MODULE = 'repsoc';

const getOrigin = () => {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin + (import.meta.env.VITE_BASE_PATH || '');
    console.log('Auth origin:', origin);
    return origin;
  }
  return 'https://rrichglitch.github.io/rep_soc_front';
};

const origin = getOrigin();

// Environment variable overrides for local development
const authAuthority = import.meta.env.VITE_AUTH_AUTHORITY || 'https://auth.spacetimedb.com/oidc';
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
