import { DbConnection, tables } from '../module_bindings';
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
  ]);
  
  // Give some time for initial sync
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
  
  dbConnection.reducers.createProfile({
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
