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

// SpacetimeAuth configuration
export const AUTH_CONFIG = {
  authority: 'https://auth.spacetimedb.com/oidc',
  client_id: 'client_032dcrU7dNeqH21pwTabNC',
  redirect_uri: `${origin}/callback`,
  post_logout_redirect_uri: origin,
  scope: 'openid profile email',
  response_type: 'code',
  loadUserInfo: false,
  automaticSilentRenew: true,
  monitorSession: false,
  validateTokenOnLoad: false,
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

export const RATE_LIMIT_HOURS = 16;
