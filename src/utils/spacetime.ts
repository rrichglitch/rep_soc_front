import { DbConnection, tables } from '../module_bindings';
import { Identity, Timestamp } from 'spacetimedb';
import { SPACETIMEDB_HOST, SPACETIMEDB_MODULE } from '../config';

let dbConnection: DbConnection | null = null;
let subscriptionPromise: Promise<void> | null = null;
let currentToken: string | undefined = undefined;

// Matches backend Gmail normalization in profile_reducers.ts
export function sanitizeEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex === -1) {
    return normalized;
  }
  const localPart = normalized.substring(0, atIndex);
  const domain = normalized.substring(atIndex);
  const cleanedLocal = localPart.split('+')[0].replace(/\./g, '');
  return cleanedLocal + domain;
}

export async function connectToSpacetimeDB(_email: string, token?: string): Promise<DbConnection> {
  // If we have a connection with the same token, reuse it
  if (dbConnection && currentToken === token && subscriptionPromise) {
    await subscriptionPromise;
    return dbConnection;
  }

  // If we have a token connection but want anonymous, don't downgrade
  if (dbConnection && currentToken && !token) {
    return dbConnection;
  }

  const uri = SPACETIMEDB_HOST.startsWith('ws://') || SPACETIMEDB_HOST.startsWith('wss://')
    ? SPACETIMEDB_HOST
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${SPACETIMEDB_HOST}`;
  const isAnonymous = !token;

  console.log('Connecting to SpacetimeDB at:', uri, 'with database:', SPACETIMEDB_MODULE, isAnonymous ? 'anonymous' : 'with token');

  try {
    const builder = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(SPACETIMEDB_MODULE)
      .onConnect((_conn, id) => {
        console.log('Connected to SpacetimeDB with identity:', id.toHexString());
      })
      .onDisconnect(() => {
        console.log('Disconnected from SpacetimeDB');
        dbConnection = null;
        subscriptionPromise = null;
        currentToken = undefined;
      })
      .onConnectError((_ctx, err) => {
        console.error('Error connecting to SpacetimeDB:', err);
      });

    if (token) {
      builder.withToken(token);
      currentToken = token;
    } else {
      currentToken = undefined;
    }

    dbConnection = await builder.build();

    if (isAnonymous) {
      subscriptionPromise = subscribeAnonymous();
    } else {
      subscriptionPromise = subscribeToTables();
    }
    await subscriptionPromise;

    return dbConnection;
  } catch (e) {
    console.error('Failed to connect to SpacetimeDB:', e);
    dbConnection = null;
    subscriptionPromise = null;
    throw e;
  }
}

async function subscribeAnonymous(): Promise<void> {
  if (!dbConnection) return;
  
  console.log('Subscribing anonymously...');
  return new Promise((resolve, reject) => {
    try {
      dbConnection!.subscriptionBuilder()
        .onApplied(() => {
          console.log('Anonymous subscription applied');
          resolve();
        })
        .onError((ctx) => {
          console.error('Anonymous subscription error:', ctx.event);
          reject(new Error('Subscription failed'));
        })
        .subscribe([
          tables.user_profile,
        ]);
    } catch (e) {
      console.error('Anonymous subscription error:', e);
      reject(e);
    }
  });
}

async function subscribeToTables(): Promise<void> {
  if (!dbConnection) return;

  console.log('Subscribing to tables...');
  return new Promise((resolve, reject) => {
    try {
      // NOTE: `my_feed` is now a procedure in the Rust server, not a table,
      // so it is no longer in this subscription list. The frontend calls
      // `dbConnection.procedures.myFeed()` explicitly to load the feed.
      dbConnection!.subscriptionBuilder()
        .onApplied(() => {
          console.log('Subscription applied');
          resolve();
        })
        .onError((ctx) => {
          console.error('Subscription error:', ctx.event);
          reject(new Error('Subscription failed'));
        })
        .subscribe([
          tables.user_profile,
          tables.following,
          tables.story_post,
        ]);
    } catch (e) {
      console.error('Subscription error:', e);
      reject(e);
    }
  });
}

export function getDbConnection(): DbConnection | null {
  return dbConnection;
}

export function disconnectFromSpacetimeDB() {
  if (dbConnection) {
    dbConnection.disconnect();
    dbConnection = null;
    subscriptionPromise = null;
  }
}

export async function checkProfileExistsByEmail(email: string): Promise<boolean> {
  if (!dbConnection) {
    console.log('No connection, cannot check profile');
    return false;
  }

  try {
    const sanitized = sanitizeEmail(email);
    console.log('Checking profile for email:', email, 'sanitized:', sanitized);
    for (const profile of dbConnection.db.user_profile.iter()) {
      console.log('Found profile with email:', profile.email);
      if (profile.email === sanitized) {
        return true;
      }
    }
    console.log('No profile found for sanitized email:', sanitized);
    return false;
  } catch (e) {
    console.error('Error checking profile:', e);
    return false;
  }
}

export async function getProfileByEmail(email: string) {
  if (!dbConnection) {
    return null;
  }

  try {
    const sanitized = sanitizeEmail(email);
    for (const profile of dbConnection.db.user_profile.iter()) {
      if (profile.email === sanitized) {
        return profile;
      }
    }
    return null;
  } catch (e) {
    console.error('Error getting profile:', e);
    return null;
  }
}

export async function updateProfile(
  profilePicture?: string,
  city?: string,
  description?: string
): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  console.log('Updating profile:', { profilePicture, city, description });
  
  await dbConnection.reducers.updateProfile({
    profilePicture,
    city,
    description,
  });
}

export async function initiateDiditVerification(
  email: string,
  profilePicture: string,
  city: string,
  description: string,
  turnstileToken: string
): Promise<string> {
  if (!dbConnection) {
    throw new Error('Not connected to SpacetimeDB');
  }

  console.log('Calling initiateDiditVerification procedure');

    const result = await dbConnection.procedures.initiateDiditVerification({
    email,
    profilePicture,
    city,
    description,
    turnstileToken,
  });

  console.log('initiateDiditVerification result:', result);

  if (!result.success || !result.url) {
    throw new Error(result.error ?? 'Failed to start identity verification');
  }

  return result.url;
}

export async function checkDiditVerification(sessionId: string): Promise<{ fullName: string; selfieImage: string | null; status: string }> {
  if (!dbConnection) {
    throw new Error('Not connected to SpacetimeDB');
  }

  console.log('Calling checkDiditVerification for session:', sessionId);

  const result = await dbConnection.procedures.checkDiditVerification({
    sessionId,
  });

  console.log('checkDiditVerification result:', result);

  if (!result.success) {
    throw new Error(result.error ?? `Identity verification ${result.status ?? 'failed'}`);
  }

  if (!result.fullName) {
    throw new Error('Identity verified, but your name was not returned. Make sure your Didit workflow includes ID document verification.');
  }

  return { fullName: result.fullName, selfieImage: result.selfieImage ?? null, status: result.status ?? 'APPROVED' };
}

export async function createVerifiedProfile(
  sessionId: string,
  profilePicture: string,
  city: string,
  description: string,
  fullName: string
): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpacetimeDB');
  }

  console.log('Calling createVerifiedProfile for session:', sessionId);

  const result = await dbConnection.procedures.createVerifiedProfile({
    sessionId,
    profilePicture,
    city,
    description,
    fullName,
  });

  console.log('createVerifiedProfile result:', result);

  if (!result.success) {
    throw new Error(result.error ?? 'Failed to create profile');
  }
}

export async function getProfileByIdentity(identity: string) {
  if (!dbConnection) {
    return null;
  }

  try {
    for (const profile of dbConnection.db.user_profile.iter()) {
      if (profile.identity.toHexString() === identity) {
        return profile;
      }
    }
    return null;
  } catch (e) {
    console.error('Error getting profile by identity:', e);
    return null;
  }
}

export async function checkIsFollowing(targetIdentity: string, currentIdentityHex: string): Promise<boolean> {
  if (!dbConnection || !currentIdentityHex) {
    return false;
  }

  try {
    for (const f of dbConnection.db.following.iter()) {
      if (f.followerIdentity.toHexString() === currentIdentityHex && 
          f.followingIdentity.toHexString() === targetIdentity) {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error('Error checking follow status:', e);
    return false;
  }
}

export async function followUser(targetIdentity: string): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  const identity = Identity.fromString(targetIdentity);
  await dbConnection.reducers.follow({
    targetIdentity: identity,
  });
}

export async function unfollowUser(targetIdentity: string): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  const identity = Identity.fromString(targetIdentity);
  await dbConnection.reducers.unfollow({
    targetIdentity: identity,
  });
}

export async function createStoryPost(
  profileOwnerIdentity: string,
  content: string,
  mediaData?: string,
  mediaTypes?: string[]
): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  const identity = Identity.fromString(profileOwnerIdentity);
  await dbConnection.reducers.createStoryPost({
    profileOwnerIdentity: identity,
    content,
    mediaData,
    mediaTypes: mediaTypes ? JSON.stringify(mediaTypes) : undefined,
  });
}

export async function getStoriesForProfile(profileOwnerIdentity: string) {
  if (!dbConnection) {
    return [];
  }

  try {
    const stories: any[] = [];
    const posterIdentities = new Set<string>();
    
    for (const post of dbConnection.db.story_post.iter()) {
      if (post.profileOwnerIdentity.toHexString() === profileOwnerIdentity) {
        posterIdentities.add(post.posterIdentity.toHexString());
      }
    }
    
    const profileCache = new Map<string, any>();
    for (const profile of dbConnection.db.user_profile.iter()) {
      profileCache.set(profile.identity.toHexString(), profile);
    }
    
    for (const post of dbConnection.db.story_post.iter()) {
      if (post.profileOwnerIdentity.toHexString() === profileOwnerIdentity) {
        const posterHex = post.posterIdentity.toHexString();
        const poster = profileCache.get(posterHex);
        stories.push({
          id: post.id,
          content: post.content,
          mediaData: post.mediaData,
          mediaTypes: post.mediaTypes,
          createdAt: post.createdAt.toDate(),
          posterIdentity: posterHex,
          posterName: poster?.fullName || 'Unknown',
          posterPicture: poster?.profilePicture || '',
        });
      }
    }
    return stories.sort((a, b) => {
      const aTime = a.createdAt as unknown as bigint;
      const bTime = b.createdAt as unknown as bigint;
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  } catch (e) {
    console.error('Error getting stories:', e);
    return [];
  }
}

export async function getMyStoryPosts(currentIdentityHex: string) {
  if (!dbConnection) {
    return [];
  }

  try {
    const stories: any[] = [];
    
    const profileCache = new Map<string, any>();
    for (const profile of dbConnection.db.user_profile.iter()) {
      profileCache.set(profile.identity.toHexString(), profile);
    }
    
    for (const post of dbConnection.db.story_post.iter()) {
      if (post.profileOwnerIdentity.toHexString() === currentIdentityHex) {
        const posterHex = post.posterIdentity.toHexString();
        const poster = profileCache.get(posterHex);
        stories.push({
          id: post.id,
          content: post.content,
          mediaData: post.mediaData,
          mediaTypes: post.mediaTypes,
          createdAt: post.createdAt.toDate(),
          posterIdentity: posterHex,
          posterName: poster?.fullName || 'Unknown',
          posterPicture: poster?.profilePicture || '',
          profileOwnerIdentity: currentIdentityHex,
        });
      }
    }
    return stories.sort((a, b) => {
      const aTime = a.createdAt as unknown as bigint;
      const bTime = b.createdAt as unknown as bigint;
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  } catch (e) {
    console.error('Error getting my story posts:', e);
    return [];
  }
}

export async function getMyPosts(currentIdentityHex: string) {
  if (!dbConnection) {
    return [];
  }

  try {
    const posts: any[] = [];
    
    const profileCache = new Map<string, any>();
    for (const profile of dbConnection.db.user_profile.iter()) {
      profileCache.set(profile.identity.toHexString(), profile);
    }
    
    for (const post of dbConnection.db.story_post.iter()) {
      if (post.posterIdentity.toHexString() === currentIdentityHex) {
        const ownerHex = post.profileOwnerIdentity.toHexString();
        const owner = profileCache.get(ownerHex);
        posts.push({
          id: post.id,
          content: post.content,
          mediaData: post.mediaData,
          mediaTypes: post.mediaTypes,
          createdAt: post.createdAt.toDate(),
          profileOwnerIdentity: ownerHex,
          profileOwnerName: owner?.fullName || 'Unknown',
          profileOwnerPicture: owner?.profilePicture || '',
        });
      }
    }
    return posts.sort((a, b) => {
      const aTime = a.createdAt as unknown as bigint;
      const bTime = b.createdAt as unknown as bigint;
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  } catch (e) {
    console.error('Error getting my posts:', e);
    return [];
  }
}

export async function deleteStoryPost(postId: bigint): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await dbConnection.reducers.deleteStoryPost({
    postId,
  });
}

const PAGE_SIZE = 20;

export interface FeedStory {
  id: bigint;
  profileOwnerIdentity: any;
  posterIdentity: any;
  content: string;
  mediaData: string;
  mediaTypes: string;
  createdAt: Date;
  posterName: string;
  posterPicture: string;
  profileOwnerIdentityHex: string;
  profileOwnerName: string;
  profileOwnerPicture: string;
}

export async function refreshFeed(): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await dbConnection.reducers.refreshFeed({});
}

export async function updateFeedScrollPosition(lastReadAt: Date): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await dbConnection.reducers.updateFeedScrollPosition({
    lastReadAt: Timestamp.fromDate(lastReadAt),
  });
}

// In-memory cache of the most recent myFeed() result, so paginated reads
// don't re-call the procedure on every page (it scans the whole table
// internally). Cleared by loadMyFeed() on each new refresh.
let myFeedCache: FeedStory[] = [];

function rowToFeedStory(row: any): FeedStory {
  return {
    id: row.id,
    profileOwnerIdentity: row.profileOwnerIdentity,
    posterIdentity: row.posterIdentity,
    content: row.content,
    mediaData: row.mediaData,
    mediaTypes: row.mediaTypes,
    createdAt: row.createdAt.toDate(),
    posterName: row.posterName,
    posterPicture: row.posterPicture,
    profileOwnerIdentityHex: row.profileOwnerIdentity.toHexString(),
    profileOwnerName: row.profileOwnerName,
    profileOwnerPicture: row.profileOwnerPicture,
  };
}

function sortFeedStories(stories: FeedStory[], orderOldToNew: boolean): FeedStory[] {
  return stories.slice().sort((a, b) => {
    const aTime = a.createdAt.getTime();
    const bTime = b.createdAt.getTime();
    if (orderOldToNew) {
      return aTime > bTime ? 1 : aTime < bTime ? -1 : 0;
    }
    return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
  });
}

/**
 * Call the `my_feed` procedure and cache the result. Replaces the old
 * `db.my_feed.iter()` subscription. The server returns stories filtered
 * to the caller's identity (followed profiles, exclude self, 2-year cutoff,
 * and respects the caller's `feed_position.last_feed_load_at` cursor).
 */
export async function loadMyFeed(): Promise<FeedStory[]> {
  if (!dbConnection) {
    return [];
  }
  try {
    // The generated `params` for `my_feed` is an empty object — pass `{}`
    // to satisfy the SDK's single-argument signature.
    const rows = await dbConnection.procedures.myFeed({});
    myFeedCache = rows.map(rowToFeedStory);
    return myFeedCache;
  } catch (e) {
    console.error('Error calling my_feed procedure:', e);
    return [];
  }
}

/**
 * Returns the cached feed (call loadMyFeed() first) sorted by createdAt.
 * The old sync version did this in place; the new version reads from
 * `myFeedCache` which is populated by `loadMyFeed()`.
 */
export function getMyFeedStories(orderOldToNew: boolean = true): FeedStory[] {
  return sortFeedStories(myFeedCache, orderOldToNew);
}

export function getPaginatedFeedStories(
  orderOldToNew: boolean = true,
  page: number = 0,
  perPage: number = PAGE_SIZE
): { stories: FeedStory[]; hasMore: boolean } {
  const allStories = getMyFeedStories(orderOldToNew);
  const start = page * perPage;
  const end = start + perPage;
  return {
    stories: allStories.slice(start, end),
    hasMore: end < allStories.length,
  };
}
