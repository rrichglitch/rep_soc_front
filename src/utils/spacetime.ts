import { DbConnection, tables } from '../module_bindings';
import { SPACETIMEDB_HOST, SPACETIMEDB_MODULE } from '../config';

let dbConnection: DbConnection | null = null;

const TOKEN_KEY = 'stdb_token';
const EMAIL_KEY = 'stdb_email';

export async function connectToSpacetimeDB(email: string, token: string): Promise<DbConnection> {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email);

  if (dbConnection) {
    return dbConnection;
  }

  const uri = SPACETIMEDB_HOST === 'maincloud' 
    ? `wss://${SPACETIMEDB_HOST}.spacetime.xyz`
    : `http://${SPACETIMEDB_HOST}`;

  console.log('Connecting to SpacetimeDB at:', uri, 'with database:', SPACETIMEDB_MODULE);

  try {
    dbConnection = await DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(SPACETIMEDB_MODULE)
      .withToken(token)
      .onConnect(async (_conn, id) => {
        console.log('Connected to SpacetimeDB with identity:', id.toHexString());
        await subscribeToTables();
      })
      .onDisconnect(() => {
        console.log('Disconnected from SpacetimeDB');
        dbConnection = null;
      })
      .onConnectError((_ctx, err) => {
        console.error('Error connecting to SpacetimeDB:', err);
      })
      .build();

    return dbConnection;
  } catch (e) {
    console.error('Failed to connect to SpacetimeDB:', e);
    throw e;
  }
}

async function subscribeToTables() {
  if (!dbConnection) return;
  
  console.log('Subscribing to tables...');
  dbConnection.subscriptionBuilder().subscribe([
    tables.user_profile,
  ]);
}

export function getDbConnection(): DbConnection | null {
  return dbConnection;
}

export function disconnectFromSpacetimeDB() {
  if (dbConnection) {
    dbConnection.disconnect();
    dbConnection = null;
  }
}

export function getStoredCredentials(): { token: string | null; email: string | null } {
  return {
    token: localStorage.getItem(TOKEN_KEY),
    email: localStorage.getItem(EMAIL_KEY),
  };
}

export function clearStoredCredentials() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

export async function checkProfileExistsByEmail(email: string): Promise<boolean> {
  if (!dbConnection) {
    console.log('No connection, cannot check profile');
    return false;
  }

  try {
    const lowerEmail = email.toLowerCase().trim();
    for (const profile of dbConnection.db.user_profile.iter()) {
      if (profile.email === lowerEmail) {
        return true;
      }
    }
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

  console.log('Creating profile for email:', email);
  
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
