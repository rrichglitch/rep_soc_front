import { DbConnection, tables } from '../module_bindings';
import { Identity, Timestamp } from 'spacetimedb';
import { SPACETIMEDB_HOST, SPACETIMEDB_MODULE } from '../config';

let dbConnection: DbConnection | null = null;
let subscriptionPromise: Promise<void> | null = null;
let currentToken: string | undefined = undefined;

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

  const uri = `wss://${SPACETIMEDB_HOST}`;
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
          tables.my_feed,
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
    console.log('Checking profile for email:', email);
    const lowerEmail = email.toLowerCase().trim();
    for (const profile of dbConnection.db.user_profile.iter()) {
      console.log('Found profile with email:', profile.email);
      if (profile.email === lowerEmail) {
        return true;
      }
    }
    console.log('No profile found for email:', lowerEmail);
    return false;
  } catch (e) {
    console.error('Error checking profile:', e);
    return false;
  }
}

export async function createProfile(
  email: string,
  fullName: string,
  profilePicture: string,
  city: string,
  description: string
): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpacetimeDB');
  }

  console.log('Creating profile for email:', email, 'with fullName:', fullName);
  
  await dbConnection.reducers.createProfile({
    email: email.toLowerCase().trim(),
    fullName,
    profilePicture,
    city,
    description,
  });
}

export async function getProfileByEmail(email: string) {
  if (!dbConnection) {
    return null;
  }

  try {
    const lowerEmail = email.toLowerCase().trim();
    for (const profile of dbConnection.db.user_profile.iter()) {
      if (profile.email === lowerEmail) {
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

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

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

export function getMyFeedStories(orderOldToNew: boolean = true): FeedStory[] {
  if (!dbConnection) {
    return [];
  }

  try {
    const stories: FeedStory[] = [];
    for (const row of dbConnection.db.my_feed.iter()) {
      stories.push({
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
      });
    }

    return stories.sort((a, b) => {
      const aTime = a.createdAt.getTime();
      const bTime = b.createdAt.getTime();
      if (orderOldToNew) {
        return aTime > bTime ? 1 : aTime < bTime ? -1 : 0;
      }
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  } catch (e) {
    console.error('Error getting feed stories:', e);
    return [];
  }
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

export async function getFeedPosition(currentIdentityHex: string): Promise<Date | null> {
  if (!dbConnection) {
    return null;
  }

  try {
    for (const position of dbConnection.db.feed_position.iter()) {
      if (position.identity.toHexString() === currentIdentityHex) {
        return position.lastReadAt?.toDate() ?? null;
      }
    }
    return null;
  } catch (e) {
    console.error('Error getting feed position:', e);
    return null;
  }
}

export async function setFeedPosition(_currentIdentityHex: string, lastReadAt: Date): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await dbConnection.reducers.updateFeedScrollPosition({
    lastReadAt: Timestamp.fromDate(lastReadAt),
  });
}

export async function getFollowedStoriesWithOptions(
  currentIdentityHex: string,
  orderOldToNew: boolean,
  startFromTimestamp?: Date
) {
  if (!dbConnection) {
    return [];
  }

  const cutoffDate = new Date(Date.now() - TWO_YEARS_MS);

  try {
    const followedIdentities: string[] = [];
    for (const f of dbConnection.db.following.iter()) {
      if (f.followerIdentity.toHexString() === currentIdentityHex) {
        followedIdentities.push(f.followingIdentity.toHexString());
      }
    }

    if (followedIdentities.length === 0) {
      return [];
    }

    const profileCache = new Map<string, any>();
    for (const profile of dbConnection.db.user_profile.iter()) {
      profileCache.set(profile.identity.toHexString(), profile);
    }

    const stories: any[] = [];
    for (const post of dbConnection.db.story_post.iter()) {
      const profileOwnerHex = post.profileOwnerIdentity.toHexString();
      const posterHex = post.posterIdentity.toHexString();
      const postDate = post.createdAt.toDate();
      
      if (followedIdentities.includes(profileOwnerHex) && posterHex !== profileOwnerHex) {
        if (postDate < cutoffDate) {
          continue;
        }
        if (startFromTimestamp) {
          if (orderOldToNew && postDate < startFromTimestamp) {
            continue;
          }
          if (!orderOldToNew && postDate > startFromTimestamp) {
            continue;
          }
        }
        const poster = profileCache.get(posterHex);
        const profileOwner = profileCache.get(profileOwnerHex);
        stories.push({
          id: post.id,
          content: post.content,
          mediaData: post.mediaData,
          mediaTypes: post.mediaTypes,
          createdAt: postDate,
          posterIdentity: posterHex,
          posterName: poster?.fullName || 'Unknown',
          posterPicture: poster?.profilePicture || '',
          profileOwnerIdentity: profileOwnerHex,
          profileOwnerName: profileOwner?.fullName || 'Unknown',
          profileOwnerPicture: profileOwner?.profilePicture || '',
        });
      }
    }

    return stories.sort((a, b) => {
      const aTime = a.createdAt as unknown as bigint;
      const bTime = b.createdAt as unknown as bigint;
      if (orderOldToNew) {
        return aTime > bTime ? 1 : aTime < bTime ? -1 : 0;
      }
      return aTime > bTime ? -1 : aTime < bTime ? 1 : 0;
    });
  } catch (e) {
    console.error('Error getting followed stories:', e);
    return [];
  }
}

export async function getFollowedStories(currentIdentityHex: string) {
  return getFollowedStoriesWithOptions(currentIdentityHex, false);
}
