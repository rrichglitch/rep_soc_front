export const APP_URL = 'https://reputable.social';
export const SPACETIMEDB_HOST = 'maincloud';
export const SPACETIMEDB_MODULE = 'reputable_social';

// SpacetimeAuth configuration - UPDATE THIS AFTER CREATING AUTH PROJECT
export const AUTH_CONFIG = {
  authority: 'https://auth.spacetimedb.com/oidc',
  client_id: 'UPDATE_ME_AFTER_CREATING_AUTH_PROJECT',
  redirect_uri: `${APP_URL}/callback`,
  post_logout_redirect_uri: APP_URL,
  scope: 'openid profile email',
};

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
