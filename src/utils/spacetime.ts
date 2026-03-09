import { DbConnection, tables } from '../module_bindings';
import { Identity, Timestamp } from 'spacetimedb';
import { SPACETIMEDB_HOST, SPACETIMEDB_MODULE } from '../config';

let dbConnection: DbConnection | null = null;
let subscriptionPromise: Promise<void> | null = null;

const TOKEN_KEY = 'stdb_token';

export async function connectToSpacetimeDB(_email: string, token: string): Promise<DbConnection> {
  localStorage.setItem(TOKEN_KEY, token);

  if (dbConnection && subscriptionPromise) {
    return dbConnection;
  }

  const uri = `wss://${SPACETIMEDB_HOST}`;

  console.log('Connecting to SpacetimeDB at:', uri, 'with database:', SPACETIMEDB_MODULE);

  try {
    dbConnection = await DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(SPACETIMEDB_MODULE)
      .withToken(token)
      .onConnect((_conn, id) => {
        console.log('Connected to SpacetimeDB with identity:', id.toHexString());
      })
      .onDisconnect(() => {
        console.log('Disconnected from SpacetimeDB');
        dbConnection = null;
        subscriptionPromise = null;
      })
      .onConnectError((_ctx, err) => {
        console.error('Error connecting to SpacetimeDB:', err);
      })
      .build();

    subscriptionPromise = subscribeToTables();
    await subscriptionPromise;

    return dbConnection;
  } catch (e) {
    console.error('Failed to connect to SpacetimeDB:', e);
    throw e;
  }
}

async function subscribeToTables(): Promise<void> {
  if (!dbConnection) return;
  
  console.log('Subscribing to tables...');
  dbConnection.subscriptionBuilder().subscribe([
    tables.user_profile,
    tables.following,
    tables.story_post,
  ]);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Subscription initiated');
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

export function getStoredCredentials(): { token: string | null } {
  return {
    token: localStorage.getItem(TOKEN_KEY),
  };
}

export function clearStoredCredentials() {
  localStorage.removeItem(TOKEN_KEY);
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
    for (const post of dbConnection.db.story_post.iter()) {
      if (post.profileOwnerIdentity.toHexString() === profileOwnerIdentity) {
        const poster = dbConnection.db.user_profile.identity.find(post.posterIdentity);
        stories.push({
          id: post.id,
          content: post.content,
          mediaData: post.mediaData,
          mediaTypes: post.mediaTypes,
          createdAt: post.createdAt.toDate(),
          posterIdentity: post.posterIdentity.toHexString(),
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
    for (const post of dbConnection.db.story_post.iter()) {
      if (post.profileOwnerIdentity.toHexString() === currentIdentityHex) {
        const poster = dbConnection.db.user_profile.identity.find(post.posterIdentity);
        stories.push({
          id: post.id,
          content: post.content,
          mediaData: post.mediaData,
          mediaTypes: post.mediaTypes,
          createdAt: post.createdAt.toDate(),
          posterIdentity: post.posterIdentity.toHexString(),
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

export async function getFeedPosition(currentIdentityHex: string): Promise<Date | null> {
  if (!dbConnection) {
    return null;
  }

  try {
    const identity = Identity.fromString(currentIdentityHex);
    const position = dbConnection.db.feed_position.identity.find(identity);
    return position?.lastReadAt?.toDate() ?? null;
  } catch (e) {
    console.error('Error getting feed position:', e);
    return null;
  }
}

export async function setFeedPosition(_currentIdentityHex: string, lastReadAt: Date): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await dbConnection.reducers.updateFeedPosition({
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
        const poster = dbConnection.db.user_profile.identity.find(post.posterIdentity);
        const profileOwner = dbConnection.db.user_profile.identity.find(post.profileOwnerIdentity);
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
