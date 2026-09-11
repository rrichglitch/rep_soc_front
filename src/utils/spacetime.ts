import { DbConnection } from '../module_bindings';
import { Identity, Timestamp } from 'spacetimedb';
import { SPACETIMEDB_HOST, SPACETIMEDB_MODULE, IMAGES_RELAY_URL, DIDIT_RELAY_URL } from '../config';
import { getOAuthSession } from './oauthSession';
import { getProfileSnapshot, getOwnProfileRow, getTodayPostCount, getMyFriendsList, getMyOrgsList, getMyPostsList, getMyOrgMembersList, getMyStories, fetchProfileStories, setClientDb } from './clientData';
import { preloadProfile, preloadOwnProfile } from './clientData';

let dbConnection: DbConnection | null = null;
let subscriptionPromise: Promise<void> | null = null;
let currentToken: string | undefined = undefined;

// Auto-heal bookkeeping: mobile browsers kill background websockets; when the
// socket dies unexpectedly we reconnect on next foreground/network-restore
// instead of leaving every later search silently empty.
let lastEmail = '';
let lastToken: string | undefined = undefined;
let hasConnectedOnce = false;
let expectDisconnect = false;

type ConnListener = (connected: boolean) => void;
const connListeners = new Set<ConnListener>();

// React subscription for connection state (drives the search gate).
export function onConnectionChange(cb: ConnListener): () => void {
  connListeners.add(cb);
  return () => {
    connListeners.delete(cb);
  };
}

function emitConn(connected: boolean) {
  connListeners.forEach((cb) => {
    try {
      cb(connected);
    } catch { /* listener must never break the socket */ }
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); return; }
    heal(hiddenAt);
  });
  window.addEventListener('online', () => heal(0));
}

// declared below — hoisted function.
function heal(hiddenSince: number) {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (!hasConnectedOnce || expectDisconnect) return;
  if (!dbConnection) {
    connectToSpacetimeDB(lastEmail, lastToken).catch(() => { /* next heal retries */ });
    return;
  }
  // A non-null connection after a long background can't be trusted: mobile
  // browsers freeze the tab and the TCP socket dies silently, so the SDK's
  // onDisconnect never fires and procedure calls hang forever on the corpse
  // (eternal spinner). After 45s hidden, bury it and silently rebuild — cost
  // on a healthy socket is one invisible resubscribe; the search-time timeout
  // in searchProvider is the backstop for mid-session deaths while visible.
  if (hiddenSince && Date.now() - hiddenSince > 45_000) {
    markConnectionDead();
    connectToSpacetimeDB(lastEmail, lastToken).catch(() => { /* next heal retries */ });
  }
}

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

// A stuck subscription must never wedge connect: resolve through after
// SUBSCRIBE_TIMEOUT_MS (RPCs work over the open WS regardless) and let the
// guarded procedure calls do corpse-detection downstream. NOTE: resolve, not
// reject — killing the socket here would break slow-but-healthy subscribes
// on poor cellular.
const SUBSCRIBE_TIMEOUT_MS = 20000;
async function awaitSubscription(p: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.warn('Subscription slow — proceeding without it (RPCs unaffected)');
          resolve(null);
        }, SUBSCRIBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Timestamp of the last socket OPEN, for the search gate watchdog: a
// resolved connect that never produces an OPEN is a dead rebuild (fresh
// socket dies in the wake-radio race) and must be retried, not trusted.
export let lastSockOpenAt = 0;
// Deduped connect for parked callers (the search gate): concurrent callers
// share one in-flight build instead of stampeding the server.
let inflightConnect: Promise<DbConnection> | null = null;
export function ensureConnected(): Promise<DbConnection> {
  if (dbConnection) return Promise.resolve(dbConnection);
  if (!inflightConnect) {
    inflightConnect = connectToSpacetimeDB(lastEmail, lastToken).finally(() => {
      inflightConnect = null;
    });
  }
  return inflightConnect;
}

export async function connectToSpacetimeDB(_email: string, token?: string): Promise<DbConnection> {
  // Any explicit connect cancels the "we meant to be offline" flag.
  expectDisconnect = false;
  lastEmail = _email;
  lastToken = token;
  // If we have a connection with the same token, reuse it
  if (dbConnection && currentToken === token && subscriptionPromise) {
    await awaitSubscription(subscriptionPromise);
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
        hasConnectedOnce = true;
        lastSockOpenAt = Date.now();
        emitConn(true);
      })
      .onDisconnect(() => {
        console.log('Disconnected from SpacetimeDB');
        dbConnection = null;
        subscriptionPromise = null;
        currentToken = undefined;
        setClientDb(null);
        emitConn(false);
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
    setClientDb(dbConnection);

    if (isAnonymous) {
      subscriptionPromise = subscribeAnonymous();
    } else {
      subscriptionPromise = subscribeToTables();
    }
    await awaitSubscription(subscriptionPromise);

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

  console.log('Subscribing anonymously (no tables — everything via RPC)...');
  return new Promise((resolve, reject) => {
    // The anon subscription carries zero rows — its only job is keeping a
    // valid subscription on the wire. If the server is slow (e.g. maincloud
    // under seeding load) the applied/error callbacks can take very long,
    // which used to wedge every anon search at zero results forever.
    // Resolve on timeout: procedure calls work over the open WS regardless.
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.warn('Anonymous subscription slow — proceeding without it (RPCs unaffected)');
        resolve();
      }
    }, 12000);
    const done = (fn: (...a: any[]) => void) => (...a: any[]) => {
      if (!settled) { settled = true; clearTimeout(timer); fn(...a); }
    };
    try {
      // The SDK rejects an EMPTY subscription array, so subscribe the
      // per-sender my_own_profile view: anon has no profile row, so this
      // transfers zero rows while keeping the WS handshake valid.
      dbConnection!.subscriptionBuilder()
        .onApplied(done(() => {
          console.log('Anonymous subscription applied');
          resolve();
        }))
        .onError(done(((ctx: any) => {
          console.error('Anonymous subscription error:', ctx.event);
          reject(new Error('Subscription failed'));
        }) as any))
        .subscribe(['SELECT * FROM my_own_profile']);
    } catch (e) {
      done(() => {
        console.error('Anonymous subscription error:', e);
        reject(e as Error);
      })();
    }
  });
}

async function subscribeToTables(): Promise<void> {
  if (!dbConnection) return;

  console.log('Subscribing to per-user views...');
  return new Promise((resolve, reject) => {
    try {
      // Scoped data layer (2026-08-31): ONLY per-subscriber views. No full
      // tables (user_profile/organization/friendship/following/story_post/
      // story_media/friend_request/gallery_photo) — those no longer ship to
      // clients. Everything else arrives on demand via the client_* RPCs.
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
          'SELECT * FROM my_own_profile',
          'SELECT * FROM my_friendships',
          'SELECT * FROM my_following',
          'SELECT * FROM my_friend_requests',
          'SELECT * FROM my_orgs',
          'SELECT * FROM my_org_members',
          'SELECT * FROM my_org_requests',
          'SELECT * FROM my_story',
          'SELECT * FROM my_posts',
          'SELECT * FROM my_gallery',
          'SELECT * FROM my_feed',
          'SELECT * FROM my_notifications',
          'SELECT * FROM my_messages',
          'SELECT * FROM my_search_results',
          'SELECT * FROM my_search_allowance',
          'SELECT * FROM my_pro_subscription',
          'SELECT * FROM my_org_claim_fee',
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

// A live-looking connection that answers nothing (half-open socket after
// mobile backgrounding: onDisconnect never fired). Tear it down synchronously
// so the next connect builds a fresh socket — connectToSpacetimeDB would
// otherwise "reuse" the corpse. Does NOT set expectDisconnect: this death was
// Every socket-backed call in the app funnels through here. A live server
// answers in low seconds; an await past PROC_TIMEOUT_MS means a half-open
// socket (mobile backgrounding kills TCP with no close frame, so the SDK's
// onDisconnect never fires and the raw await would hang FOREVER — the
// eternal-spinner class of bug). On timeout the corpse is buried so the next
// connect builds fresh, and the 'Not connected' marker is thrown, which is
// what each caller's reconnect handler keys off. No caller may await a raw
// dbConnection.procedures/reducers call.
const PROC_TIMEOUT_MS = 15000;
export async function withSocketTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('socket_timeout:' + what)), PROC_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    if (String((e as any)?.message ?? e).startsWith('socket_timeout:')) {
      markConnectionDead();
      throw new Error('Not connected to SpacetimeDB');
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// unplanned, auto-heal stays armed. Idempotent with the onDisconnect handler.
export function markConnectionDead() {
  try { dbConnection?.disconnect(); } catch { /* already gone */ }
  dbConnection = null;
  subscriptionPromise = null;
  currentToken = undefined;
  setClientDb(null);
  emitConn(false);
}

export function disconnectFromSpacetimeDB() {
  // Deliberate teardown (logout / invalid session): do NOT auto-heal this.
  expectDisconnect = true;
  if (dbConnection) {
    dbConnection.disconnect();
    dbConnection = null;
    subscriptionPromise = null;
  }
  setClientDb(null);
}

export async function checkProfileExistsByEmail(email: string): Promise<boolean> {
  if (!dbConnection) {
    console.log('No connection, cannot check profile');
    return false;
  }
  try {
    const r = await withSocketTimeout(dbConnection.procedures.getProfileByEmail({ email }), 'getProfileByEmail');
    return !!r?.found;
  } catch (e) {
    console.error('Error checking profile:', e);
    return false;
  }
}

// Shape-compatible shim over get_profile_by_email: callers expect a row-like
// object with camelCase fields and an identity with toHexString().
export interface ProfileLookupRow {
  identity: { toHexString: () => string };
  email: string;
  fullName: string;
  city: string;
  description: string;
  profilePicture: string;
  profilePictureSmall: string;
  profilePictureUrl: string;
  locationLat?: number;
  locationLng?: number;
  locationPrecision: string;
  gender?: string;
  age?: number;
  hideFriends: boolean;
  disabled?: boolean;
  createdAtMicros?: bigint;
  isPro: boolean;
}

function rowFromProcedure(r: any): ProfileLookupRow | null {
  if (!r?.found) return null;
  return {
    identity: { toHexString: () => r.identityHex || '' },
    email: r.email ?? '',
    fullName: r.fullName ?? '',
    city: r.city ?? '',
    description: r.description ?? '',
    profilePicture: r.profilePicture ?? '',
    profilePictureSmall: r.profilePictureSmall ?? '',
    profilePictureUrl: r.profilePictureUrl ?? '',
    locationLat: r.locationLat ?? undefined,
    locationLng: r.locationLng ?? undefined,
    locationPrecision: r.locationPrecision ?? 'off',
    gender: r.gender ?? undefined,
    age: r.age ?? undefined,
    hideFriends: !!r.hideFriends,
    disabled: !!r.disabled,
    createdAtMicros: r.createdAtMicros ?? undefined,
    isPro: !!r.isPro,
  };
}

// Sync read of the caller's OWN profile row from the my_own_profile view —
// NO procedure RPC, no full-table subscription. Own pages (/me, /home) use
// this on mount so navigation renders instantly.
export function getProfileRowByEmail(_email: string): ProfileLookupRow | null {
  if (!dbConnection) {
    return null;
  }
  try {
    for (const p of dbConnection.db.my_own_profile.iter()) {
      const row = {
        identity: { toHexString: () => p.identity.toHexString() },
        email: p.email,
        fullName: p.fullName,
        city: p.city,
        description: p.description,
        profilePicture: p.profilePicture || '',
        profilePictureSmall: p.profilePictureSmall || '',
        profilePictureUrl: p.profilePictureUrl || '',
        locationLat: p.locationLat ?? undefined,
        locationLng: p.locationLng ?? undefined,
        locationPrecision: p.locationPrecision,
        gender: p.gender ?? undefined,
        age: p.age ?? undefined,
        hideFriends: !!p.hideFriends,
        disabled: !!p.disabled,
        createdAtMicros: p.createdAt ? BigInt(p.createdAt.microsSinceUnixEpoch) : undefined,
        isPro: !!p.isPro,
      };
      // OWN tier: the signed-in user's top info INCLUDING pictures is
      // always cached (pinned, never evicted).
      preloadOwnProfile(row.identity.toHexString(), {
        fullName: row.fullName,
        picture: row.profilePictureSmall || row.profilePicture,
        fullPicture: row.profilePictureUrl || row.profilePicture,
        city: row.city,
        description: row.description,
        gender: row.gender,
        age: row.age,
        hideFriends: row.hideFriends,
        createdAtMicros: row.createdAtMicros,
        isPro: row.isPro,
      });
      return row;
    }
  } catch {
    // view not ready — treat as not found
  }
  return null;
}

export async function getProfileByEmail(email: string): Promise<ProfileLookupRow | null> {
  if (!dbConnection) {
    return null;
  }
  try {
    const r = await withSocketTimeout(dbConnection.procedures.getProfileByEmail({ email }), 'getProfileByEmail');
    return rowFromProcedure(r);
  } catch (e) {
    console.error('Error getting profile:', e);
    return null;
  }
}

export async function updateProfile(
  profilePicture?: string,
  profilePictureSmall?: string,
  profilePictureUrl?: string,
  city?: string,
  description?: string,
  hideFriends?: boolean,
  gender?: string
): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  console.log('Updating profile:', { profilePicture, profilePictureSmall, profilePictureUrl, city, description, hideFriends, gender });
  // NOTE: birthday is intentionally NOT updateable — set once at registration.

  await withSocketTimeout(dbConnection.reducers.updateProfile({
    profilePicture: profilePicture ?? undefined,
    profilePictureSmall: profilePictureSmall ?? undefined,
    profilePictureUrl: profilePictureUrl ?? undefined,
    city: city ?? undefined,
    description: description ?? undefined,
    hideFriends: hideFriends ?? undefined,
    gender: gender ?? undefined,
  }), 'updateProfile');
}

// Self-service disable/enable: a disabled profile is excluded from searches
// (keyword + semantic) until the owner turns it back on from Settings.
export async function setProfileDisabled(disabled: boolean): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }
  await withSocketTimeout(dbConnection.reducers.setProfileDisabled({ disabled }), 'setProfileDisabled');
}

// Permanently deletes an organization (leader only) along with its members,
// pending requests, chat messages, and org-tied stories/follows.
export async function deleteOrganization(orgId: bigint): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }
  await withSocketTimeout(dbConnection.reducers.deleteOrganization({ orgId }), 'deleteOrganization');
}

export async function initiateDiditVerification(
  email: string,
  profilePictureSmall: string,
  profilePictureUrl: string,
  city: string,
  description: string,
  turnstileToken: string
): Promise<string> {
  // Initiation now routes through the didit relay (https://auth.veri.social/didit)
  // — the module cannot see client IPs, so the REAL per-IP throttle (+
  // Turnstile verification) lives there. The relay calls back into
  // SpacetimeDB as this user for the pending row. Only the 10KB thumbnail +
  // the S3 URL travel this path — the full-size image was already uploaded
  // to the images relay. Returns the Didit verification URL, or throws with
  // the relay/module message.
  const token = getOAuthSession()?.stToken;
  if (!token) {
    throw new Error('Not signed in');
  }

  const resp = await fetch(`${DIDIT_RELAY_URL}/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      email,
      profile_picture_small: profilePictureSmall,
      profile_picture_url: profilePictureUrl,
      city,
      description,
      turnstile_token: turnstileToken,
    }),
  });

  let data: any = null;
  try {
    data = await resp.json();
  } catch { /* non-JSON error body */ }

  if (!resp.ok) {
    throw new Error(data?.error ?? `Verification failed (${resp.status}) — please try again`);
  }
  if (!data?.success || !data.url) {
    throw new Error(data?.error ?? 'Failed to start identity verification');
  }
  return data.url;
}

// Fetch the caller's pending-registration state. If they already have an
// APPROVED Didit verification (or an in-progress one), the register page can
// resume the flow instead of restarting from scratch.
export async function getPendingRegistration(): Promise<{
  hasPending: boolean;
  verified: boolean;
  legalName: string | null;
  email: string | null;
  city: string | null;
  description: string | null;
  profilePicture: string | null;
  profilePictureSmall: string | null;
  profilePictureUrl: string | null;
} | null> {
  if (!dbConnection) {
    throw new Error('Not connected to SpacetimeDB');
  }

  const result = await withSocketTimeout(dbConnection.procedures.getPendingRegistration({}), 'getPendingRegistration');
  console.log('getPendingRegistration result:', result);

  if (!result.hasPending) return null;

  return {
    hasPending: result.hasPending,
    verified: result.verified,
    legalName: result.legalName ?? null,
    email: result.email ?? null,
    city: result.city ?? null,
    description: result.description ?? null,
    profilePicture: result.profilePicture ?? null,
    profilePictureSmall: result.profilePictureSmall ?? null,
    profilePictureUrl: result.profilePictureUrl ?? null,
  };
}

export async function checkDiditVerification(sessionId: string): Promise<{ fullName: string; selfieImage: string | null; status: string }> {
  if (!dbConnection) {
    throw new Error('Not connected to SpacetimeDB');
  }

  console.log('Calling checkDiditVerification for session:', sessionId);

  const result = await withSocketTimeout(dbConnection.procedures.checkDiditVerification({
    sessionId,
  }), 'checkDiditVerification');

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
  profilePictureSmall: string,
  profilePictureUrl: string,
  city: string,
  description: string,
  fullName: string,
  birthday?: string,
  gender?: string
): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpacetimeDB');
  }

  console.log('Calling createVerifiedProfile for session:', sessionId);

  const result = await withSocketTimeout(dbConnection.procedures.createVerifiedProfile({
    sessionId,
    profilePicture: '',
    profilePictureSmall,
    profilePictureUrl,
    city,
    description,
    fullName,
    birthday: birthday ?? '',
    gender: gender ?? '',
  }), 'createVerifiedProfile');

  console.log('createVerifiedProfile result:', result);

  if (!result.success) {
    throw new Error(result.error ?? 'Failed to create profile');
  }
}

export async function getProfileByIdentity(identity: string): Promise<ProfileLookupRow | null> {
  if (!dbConnection) {
    return null;
  }

  try {
    const r = await withSocketTimeout(dbConnection.procedures.getProfileByIdentity({ identityHex: identity }), 'getProfileByIdentity');
    return rowFromProcedure(r);
  } catch (e) {
    console.error('Error getting profile by identity:', e);
    return null;
  }
}

// Sync resolution of ANY profile from the merged client data layer
// (memory tier → view-tier embedded snapshots → fetched cache) — NO RPC, no
// full-table subscription. ProfilePage lazy-inits from this; the procedure
// refresh keeps it fresh after.
export function getProfileByIdentitySync(identityHex: string): ProfileLookupRow | null {
  if (!dbConnection) return null;
  const snap = getProfileSnapshot(identityHex);
  if (!snap) return null;
  return {
    identity: { toHexString: () => identityHex },
    email: '',
    fullName: snap.fullName,
    city: snap.city,
    description: snap.description,
    profilePicture: snap.picture,
    profilePictureSmall: snap.picture,
    profilePictureUrl: snap.fullPicture || '',
    locationPrecision: 'off',
    gender: snap.gender,
    age: snap.age,
    hideFriends: !!snap.hideFriends,
    disabled: false,
    createdAtMicros: snap.createdAtMicros as bigint | undefined,
    isPro: !!snap.isPro,
  };
}

// ─── On-demand RPC wrappers for OTHER people's data (scoped data layer) ─────

export async function callProfileStories(profileIdentityHex: string): Promise<any[]> {
  if (!dbConnection) return [];
  try {
    const r = await withSocketTimeout(dbConnection.procedures.getProfileStories({ profileOwnerIdentityHex: profileIdentityHex }), 'getProfileStories');
    return (r?.stories ?? []).map((s: any) => ({
      id: s.id,
      posterIdentity: s.posterIdentityHex,
      posterName: s.posterName,
      posterPicture: s.posterPicture,
      content: s.content,
      mediaData: s.mediaData,
      mediaTypes: s.mediaTypes,
      mediaUrl: s.mediaUrl,
      createdAt: new Date(Number(s.createdAtMicros) / 1000),
      actingAsOrgId: s.actingAsOrgId,
      actingAsOrgName: s.actingAsOrgName,
      actingAsOrgPicture: s.actingAsOrgPicture,
    }));
  } catch (e) {
    console.error('Error fetching profile stories:', e);
    return [];
  }
}

export async function callProfileFriends(identityHex: string): Promise<Array<{ identity: string; fullName: string; picture: string; city: string }>> {
  if (!dbConnection) return [];
  try {
    const r = await withSocketTimeout(dbConnection.procedures.getProfileFriends({ targetIdentityHex: identityHex }), 'getProfileFriends');
    return (r?.friends ?? []).map((f: any) => ({
      identity: f.identityHex,
      fullName: f.fullName,
      picture: f.picture,
      city: f.city,
    }));
  } catch (e) {
    console.error('Error fetching profile friends:', e);
    return [];
  }
}

export async function callOrgMembers(orgId: bigint): Promise<Array<{ identity: string; fullName: string; picture: string; city: string; role: string }>> {
  if (!dbConnection) return [];
  try {
    const r = await withSocketTimeout(dbConnection.procedures.getOrgMembers({ orgId }), 'getOrgMembers');
    return (r?.members ?? []).map((m: any) => ({
      identity: m.identityHex,
      fullName: m.fullName,
      picture: m.picture,
      city: m.city,
      role: m.role,
    }));
  } catch (e) {
    console.error('Error fetching org members:', e);
    return [];
  }
}

export async function callProfileGallery(ownerIdentityHex: string): Promise<any[]> {
  if (!dbConnection) return [];
  try {
    const r = await withSocketTimeout(dbConnection.procedures.getProfileGallery({ ownerIdentityHex }), 'getProfileGallery');
    return (r?.photos ?? []).map((g: any) => ({
      id: g.id,
      s3Key: g.s3Key,
      url: g.url,
      bytes: g.bytes,
      createdAt: new Date(Number(g.createdAtMicros) / 1000),
      sourceUrl: g.sourceUrl ?? undefined,
      sourceTitle: g.sourceTitle ?? undefined,
    }));
  } catch (e) {
    console.error('Error fetching profile gallery:', e);
    return [];
  }
}

export async function callOrgProfile(orgId: bigint): Promise<any | null> {
  if (!dbConnection) return null;
  try {
    const r = await withSocketTimeout(dbConnection.procedures.getOrgProfile({ orgId }), 'getOrgProfile');
    if (!r?.found) return null;
    return {
      id: r.orgId,
      name: r.name,
      picture: r.pictureSmall || r.picture,
      pictureSmall: r.pictureSmall,
      pictureUrl: r.pictureUrl,
      pictureSource: r.pictureSource,
      city: r.city,
      description: r.description,
      createdAt: new Date(Number(r.createdAtMicros) / 1000),
      gender: r.gender,
      hideMembers: !!r.hideMembers,
      isPro: !!r.isPro,
      leaderIdentityHex: r.leaderIdentityHex,
      locationLat: r.locationLat ?? undefined,
      locationLng: r.locationLng ?? undefined,
      locationPrecision: r.locationPrecision,
    };
  } catch (e) {
    console.error('Error fetching org profile:', e);
    return null;
  }
}

export async function checkIsFollowing(targetIdentity: string, currentIdentityHex: string): Promise<boolean> {
  // MY follow edges now live in the my_following view (scoped data layer).
  // Only valid for the signed-in identity's own relation; other-direction
  // calls are not made anywhere.
  if (!dbConnection || !currentIdentityHex) {
    return false;
  }
  const me = getOwnProfileRow()?.identity.toHexString();
  if (me && currentIdentityHex !== me) return false;
  try {
    for (const f of dbConnection.db.my_following.iter()) {
      if (f.followingIdentity.toHexString() === targetIdentity) {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error('Error checking follow status:', e);
    return false;
  }
}

// Deterministic SpacetimeDB identity for an organization account (0x4f + orgId)
export function orgAccountIdentityHex(orgId: bigint): string {
  return '4f' + orgId.toString(16).padStart(62, '0');
}

export async function followUser(targetIdentity: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  const identity = Identity.fromString(targetIdentity);
  await withSocketTimeout(dbConnection.reducers.follow({
    targetIdentity: identity,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  }), 'follow');
}

export async function unfollowUser(targetIdentity: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  const identity = Identity.fromString(targetIdentity);
  await withSocketTimeout(dbConnection.reducers.unfollow({
    targetIdentity: identity,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  }), 'unfollow');
}

export async function createStoryPost(
  profileOwnerIdentity: string,
  content: string,
  mediaData?: string,
  mediaTypes?: string[],
  actingAsOrgId?: bigint,
  mediaKey?: string,
  mediaUrl?: string,
  mediaBytes?: bigint,
  mediaType?: string
): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  const identity = Identity.fromString(profileOwnerIdentity);
  await withSocketTimeout(dbConnection.reducers.createStoryPost({
    profileOwnerIdentity: identity,
    content,
    mediaData,
    mediaTypes: mediaTypes ? JSON.stringify(mediaTypes) : undefined,
    actingAsOrgId: actingAsOrgId ?? undefined,
    mediaKey,
    mediaUrl,
    mediaBytes,
    mediaType,
  }), 'createStoryPost');
}

// Local pre-check for the daily post budget (mirrors the backend gate so the
// user gets a friendly message instead of a 530). Counts the caller's story
// posts created since the start of the UTC day.
// Scoped data layer: counts the caller's posts today from the my_posts view.
export function getTodayStoryPostCount(posterHex: string): number {
  return getTodayPostCount(posterHex);
}

// Stories ON a profile — fetched on demand (scoped data layer); cached in
// clientData and invalidated via refreshFetchedStories after posting/deleting.
export async function getStoriesForProfile(profileOwnerIdentity: string) {
  return fetchProfileStories(profileOwnerIdentity);
}

// Uploads story media through the images relay (gallery rules: 500KB cap,
// WebP/JPEG sniff, S3 storage) and returns the key + public URL.
export async function uploadStoryMedia(file: Blob): Promise<{ s3Key: string; url: string; bytes: number } | null> {
  const session = getOAuthSession();
  const token = session?.stToken;
  if (!token) {
    console.error('Not authenticated for story upload');
    return null;
  }
  try {
    const res = await fetch(`${IMAGES_RELAY_URL}/story-upload`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: file,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Story upload failed:', res.status, text);
      return null;
    }
    const data = await res.json();
    return { s3Key: data.s3_key, url: data.url, bytes: data.bytes };
  } catch (e) {
    console.error('Story upload error:', e);
    return null;
  }
}

// Posts ON my profile — the my_story view (per-subscriber, poster snapshot +
// S3 media URL embedded). Signature kept for callers.
export async function getMyStoryPosts(_currentIdentityHex: string) {
  return getMyStories();
}

// Posts BY me — the my_posts view (per-subscriber, owner snapshot + S3 media
// URL embedded). Signature kept for callers.
export async function getMyPosts(_currentIdentityHex: string) {
  return getMyPostsList();
}

export async function deleteStoryPost(postId: bigint): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await withSocketTimeout(dbConnection.reducers.deleteStoryPost({
    postId,
  }), 'deleteStoryPost');
}

const PAGE_SIZE = 20;

export interface FeedStory {
  id: bigint;
  profileOwnerIdentity: any;
  posterIdentity: any;
  content: string;
  mediaData: string;
  mediaTypes: string;
  mediaUrl?: string;
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

  await withSocketTimeout(dbConnection.reducers.refreshFeed({}), 'refreshFeed');
}

export async function updateFeedScrollPosition(lastReadAt: Date): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await withSocketTimeout(dbConnection.reducers.updateFeedScrollPosition({
    lastReadAt: Timestamp.fromDate(lastReadAt),
  }), 'updateFeedScrollPosition');
}

export function getMyFeedStories(orderOldToNew: boolean = true): FeedStory[] {
  if (!dbConnection) {
    return [];
  }

  try {
    const stories: FeedStory[] = [];
    for (const row of dbConnection.db.my_feed.iter()) {
      const posterHex = row.posterIdentity.toHexString();
      const ownerHex = row.profileOwnerIdentity.toHexString();
      preloadProfile(posterHex, {
        fullName: row.posterName,
        picture: row.posterPicture,
        city: '',
        description: '',
      });
      preloadProfile(ownerHex, {
        fullName: row.profileOwnerName,
        picture: row.profileOwnerPicture,
        city: '',
        description: '',
      });
      stories.push({
        id: row.id,
        profileOwnerIdentity: row.profileOwnerIdentity,
        posterIdentity: row.posterIdentity,
        content: row.content,
        mediaData: row.mediaData,
        mediaTypes: row.mediaTypes,
        mediaUrl: row.mediaUrl || '',
        createdAt: row.createdAt.toDate(),
        posterName: row.posterName,
        posterPicture: row.posterPicture,
        profileOwnerIdentityHex: ownerHex,
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

export async function getFeedPosition(_currentIdentityHex: string): Promise<Date | null> {
  if (!dbConnection) return null;
  // feed_position is a private table, not available client-side
  return null;
}

export async function setFeedPosition(_currentIdentityHex: string, lastReadAt: Date): Promise<void> {
  if (!dbConnection) {
    throw new Error('Not connected to SpaceTimeDB');
  }

  await withSocketTimeout(dbConnection.reducers.updateFeedScrollPosition({
    lastReadAt: Timestamp.fromDate(lastReadAt),
  }), 'updateFeedScrollPosition');
}

// ─── Organization APIs ───────────────────────────────────────────

// Location is mandatory for org creation: caller passes the geolocation fix
// (jittered client-side when approx) + the city derived from it + precision.
export async function createOrganization(
  name: string, picture: string, city: string, description: string,
  locationLat: number, locationLng: number, locationPrecision: 'exact' | 'approx' = 'exact',
  pictureSmall?: string, pictureUrl?: string,
): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.createOrganization({
    name, picture, city, description,
    locationLat,
    locationLng,
    locationPrecision,
    pictureSmall: pictureSmall ?? undefined,
    pictureUrl: pictureUrl ?? undefined,
  }), 'createOrganization');
}

export async function updateOrganization(
  orgId: bigint, picture?: string, pictureSmall?: string, pictureUrl?: string,
  city?: string, description?: string, locationLat?: number, locationLng?: number,
  hideMembers?: boolean, gender?: string
): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.updateOrganization({
    orgId, picture: picture ?? undefined, pictureSmall: pictureSmall ?? undefined,
    pictureUrl: pictureUrl ?? undefined, city: city ?? undefined, description: description ?? undefined,
    locationLat: locationLat ?? undefined,
    locationLng: locationLng ?? undefined,
    hideMembers: hideMembers ?? undefined,
    gender: gender ?? undefined,
  }), 'updateOrganization');
}

// My organizations — the my_orgs view (per-subscriber, includes my role).
export function getMyOrganizations(_identity: string) {
  return getMyOrgsList();
}

// Sync org row for orgs I belong to (my_orgs view). Other orgs: null — call
// fetchOrgProfile (RPC) for the full row on demand.
export function getOrganizationById(orgId: bigint) {
  if (!dbConnection) return null;
  for (const o of dbConnection.db.my_orgs.iter()) {
    if (o.orgId === orgId) {
      return {
        id: o.orgId,
        name: o.name,
        picture: o.picture,
        pictureSmall: o.pictureSmall,
        pictureUrl: o.pictureUrl,
        pictureSource: o.pictureSource,
        city: o.city,
        description: o.description,
        createdAt: o.createdAt.toDate(),
        gender: o.gender,
        hideMembers: o.hideMembers,
        isPro: o.isPro,
        leaderIdentity: { toHexString: () => o.leaderIdentity.toHexString() },
      };
    }
  }
  return null;
}

// Members (with roles) of orgs the caller belongs to — the my_org_members
// view. Viewing OTHER orgs' members uses fetchOrgMembers (RPC).
export function getOrganizationMembers(orgId: bigint) {
  if (!dbConnection) return [];
  return getMyOrgMembersList().filter((m: any) => m.orgId === orgId);
}

export async function acceptOrgMember(requestId: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.acceptOrgMember({ requestId }), 'acceptOrgMember');
}

export async function declineOrgMember(requestId: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.declineOrgMember({ requestId }), 'declineOrgMember');
}

export async function promoteToCoLeader(orgId: bigint, memberIdentity: string): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.promoteToCoLeader({
    orgId,
    memberIdentity: Identity.fromString(memberIdentity),
  }), 'promoteToCoLeader');
}

export async function demoteCoLeader(orgId: bigint, memberIdentity: string): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.demoteCoLeader({
    orgId,
    memberIdentity: Identity.fromString(memberIdentity),
  }), 'demoteCoLeader');
}

export async function transferLeadership(orgId: bigint, newLeaderIdentity: string): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.transferLeadership({
    orgId,
    newLeaderIdentity: Identity.fromString(newLeaderIdentity),
  }), 'transferLeadership');
}

export async function removeOrgMember(orgId: bigint, memberIdentity: string): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.removeOrgMember({
    orgId,
    memberIdentity: Identity.fromString(memberIdentity),
  }), 'removeOrgMember');
}

// ─── Friend Request APIs ──────────────────────────────────────────

export async function sendFriendRequest(toIdentity: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.sendFriendRequest({
    toIdentity: Identity.fromString(toIdentity),
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  }), 'sendFriendRequest');
}

export async function acceptFriendRequest(requestId: bigint, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.acceptFriendRequest({
    requestId,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  }), 'acceptFriendRequest');
}

export async function declineFriendRequest(requestId: bigint, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.declineFriendRequest({
    requestId,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  }), 'declineFriendRequest');
}

export async function cancelFriendRequest(toIdentity: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.cancelFriendRequest({
    toIdentity: Identity.fromString(toIdentity),
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  }), 'cancelFriendRequest');
}

export async function unfriend(targetIdentity: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.unfriend({
    targetIdentity: Identity.fromString(targetIdentity),
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  }), 'unfriend');
}

export function checkIsFriend(_currentIdentityHex: string, otherIdentity: string): boolean {
  // MY friendships live in the my_friendships view (edge is symmetric).
  if (!dbConnection) return false;
  for (const f of dbConnection.db.my_friendships.iter()) {
    if (f.friendIdentity.toHexString() === otherIdentity) return true;
  }
  return false;
}

export function getFriendRequestStatus(fromIdentity: string, toIdentity: string): string | null {
  // MY requests live in the my_friend_requests view (either side).
  if (!dbConnection) return null;
  for (const r of dbConnection.db.my_friend_requests.iter()) {
    if (r.fromIdentity.toHexString() === fromIdentity &&
        r.toIdentity.toHexString() === toIdentity) {
      return r.status === 'pending' ? 'pending' : null;
    }
  }
  return null;
}

export function getOrgMemberRequestStatus(orgId: bigint, _fromIdentity: string): string | null {
  // MY org join requests live in the my_org_requests view.
  if (!dbConnection) return null;
  for (const r of dbConnection.db.my_org_requests.iter()) {
    if (r.orgId === orgId) {
      return r.status;
    }
  }
  return null;
}

export async function sendOrgMemberRequest(orgId: bigint, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.sendOrgMemberRequest({
    orgId,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  }), 'sendOrgMemberRequest');
}

// Leave an organization = UNFRIEND the org's account identity (membership ≡
// friendship; the unfriend reducer drops the member row + pending request
// when the target is an org identity). Follows of the org are unaffected.
export async function leaveOrg(orgId: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await unfriend(orgAccountIdentityHex(orgId));
}

// ─── Messaging APIs ───────────────────────────────────────────────

export async function sendDirectMessage(recipientIdentity: string, content: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.sendDirectMessage({
    recipientIdentity: Identity.fromString(recipientIdentity),
    content,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgId !== undefined ? Identity.fromString(orgAccountIdentityHex(actingAsOrgId)) : undefined,
  }), 'sendDirectMessage');
}

export async function sendOrgMessage(orgId: bigint, content: string, actingAsOrgId?: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.sendOrgMessage({ orgId, content, actingAsOrgId: actingAsOrgId ?? undefined }), 'sendOrgMessage');
}

export function getDirectMessages(userA: string, userB: string) {
  if (!dbConnection) return [];
  const msgs: any[] = [];
  for (const m of dbConnection.db.my_messages.iter()) {
    const sender = m.senderIdentity.toHexString();
    const recipient = m.recipientIdentity?.toHexString() || '';
    if ((sender === userA && recipient === userB) || (sender === userB && recipient === userA)) {
      msgs.push({
        id: m.id,
        senderIdentity: sender,
        content: m.content,
        createdAt: m.createdAt.toDate(),
      });
    }
  }
  return msgs.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function getOrgMessages(orgId: bigint) {
  if (!dbConnection) return [];
  const msgs: any[] = [];
  for (const m of dbConnection.db.my_messages.iter()) {
    if (m.orgId === orgId) {
      const senderHex = m.senderIdentity.toHexString();
      const snap = getProfileSnapshot(senderHex);
      msgs.push({
        id: m.id,
        senderIdentity: senderHex,
        senderName: snap?.fullName || 'Unknown',
        senderPicture: snap?.picture || '',
        content: m.content,
        createdAt: m.createdAt.toDate(),
      });
    }
  }
  return msgs.sort((a, b) => (a.id < b.id ? -1 : 1));
}

// MY friends — the my_friendships view (per-subscriber, snapshot embedded).
// Other users' friend lists are fetched on demand (fetchProfileFriends).
export function getFriends(_identity: string): { identity: string; name: string; picture: string; city: string }[] {
  if (!dbConnection) return [];
  return getMyFriendsList();
}

export function getFriendChats(identity: string) {
  if (!dbConnection) return [];
  const friends = new Map<string, { fullName: string; picture: string }>();
  for (const f of dbConnection.db.my_friendships.iter()) {
    friends.set(f.friendIdentity.toHexString(), { fullName: f.friendName, picture: f.friendPicture });
  }
  // Find latest message for each friend
  const latestMsg = new Map<string, number>();
  for (const m of dbConnection.db.my_messages.iter()) {
    const s = m.senderIdentity.toHexString();
    const r = m.recipientIdentity?.toHexString();
    if (!r) continue;
    const friendId = s === identity ? r : r === identity ? s : null;
    if (friendId && friends.has(friendId)) {
      const existing = latestMsg.get(friendId);
      const ts = Number(m.createdAt);
      if (existing === undefined || ts > existing) {
        latestMsg.set(friendId, ts);
      }
    }
  }
  return Array.from(friends.keys())
    .map(fid => {
      const profile = friends.get(fid)!;
      return {
        identity: fid,
        fullName: profile.fullName,
        picture: profile.picture,
        lastMsgAt: latestMsg.get(fid) || 0,
      };
    })
    .sort((a, b) => Number(b.lastMsgAt) - Number(a.lastMsgAt));
}

// ─── Notification APIs ────────────────────────────────────────────

export function getNotifications(identity: string) {
  if (!dbConnection) return [];
  const notifs: any[] = [];
  for (const n of dbConnection.db.my_notifications.iter()) {
    if (n.recipientIdentity.toHexString() !== identity) continue;
    const fromHex = n.fromIdentity?.toHexString();
    const snap = fromHex ? getProfileSnapshot(fromHex) : undefined;
    if (fromHex && snap) {
      preloadProfile(fromHex, { fullName: snap.fullName, picture: snap.picture, city: snap.city, description: '' });
    }
    notifs.push({
      id: n.id,
      type: n.type,
      fromIdentity: fromHex,
      fromName: snap?.fullName || 'Someone',
      fromPicture: snap?.picture || '',
      orgId: n.orgId,
      message: n.message,
      createdAt: n.createdAt.toDate(),
      resolved: n.resolved,
      referenceId: n.referenceId,
    });
  }
  return notifs.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function getUnreadNotificationCount(identity: string): number {
  if (!dbConnection) return 0;
  let count = 0;
  for (const n of dbConnection.db.my_notifications.iter()) {
    if (n.recipientIdentity.toHexString() === identity && !n.resolved) {
      count++;
    }
  }
  return count;
}

export async function updateLocation(lat: number, lng: number, precision: 'off' | 'approx' | 'exact'): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.updateLocation({ lat, lng, precision }), 'updateLocation');
}

// Downgrade to approximate: backend jitters the last stored precise location (no new fetch)
export async function jitterToApprox(): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.jitterToApprox({}), 'jitterToApprox');
}

export async function updateOrgLocation(
  orgId: bigint, lat: number, lng: number, precision: 'off' | 'approx' | 'exact'
): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.updateOrgLocation({ orgId, lat, lng, precision }), 'updateOrgLocation');
}

export async function jitterOrgToApprox(orgId: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.jitterOrgToApprox({ orgId }), 'jitterOrgToApprox');
}

export async function resolveNotification(notificationId: bigint): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.resolveNotification({ notificationId }), 'resolveNotification');
}

export async function cancelProSubscription(): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.cancelProSubscription({}), 'cancelProSubscription');
}

// One-time org claim fee rows for the current caller (my_org_claim_fee view).
export function getMyOrgClaimFee(): any[] {
  if (!dbConnection) return [];
  try {
    const rows: any[] = [];
    for (const r of (dbConnection as any).db.myOrgClaimFee.iter()) rows.push(r);
    return rows;
  } catch {
    return [];
  }
}

// ─── Gallery (S3-backed photos) ───────────────────────────────────

export interface GalleryPhoto {
  id: bigint;
  ownerIdentity?: string;
  s3Key: string;
  url: string;
  bytes: number;
  createdAt: Date;
  sourceUrl?: string;   // attribution: page the image was found on (web-sourced seeds)
  sourceTitle?: string;
}

// MY gallery photos from the my_gallery view (sync). Other users' galleries
// are fetched on demand via clientData.fetchProfileGallery.
export function getGallery(_ownerIdentity: string): GalleryPhoto[] {
  if (!dbConnection) return [];
  const photos: GalleryPhoto[] = [];
  for (const g of dbConnection.db.my_gallery.iter()) {
    photos.push({
      id: g.id,
      s3Key: g.s3Key,
      url: g.url,
      bytes: Number(g.bytes),
      createdAt: g.createdAt.toDate(),
      sourceUrl: g.sourceUrl ?? undefined,
      sourceTitle: g.sourceTitle ?? undefined,
    });
  }
  return photos.sort((a, b) => (a.createdAt.getTime() - b.createdAt.getTime()));
}

// Upload a compressed WebP blob to the images relay. The relay stores it in
// S3 AND records the gallery row in SpacetimeDB using the caller's identity
// token (the upload itself is the auth). Returns the relay's {key, url}.
export async function uploadGalleryPhoto(
  blob: Blob,
  actingAsOrgId?: bigint,
  actingAsOrgIdentityHex?: string,
): Promise<{ key: string; url: string; bytes: number }> {
  const token = getOAuthSession()?.stToken;
  if (!token) throw new Error('Not signed in');
  const headers: Record<string, string> = {
    'Content-Type': blob.type || 'image/webp',
    Authorization: `Bearer ${token}`,
  };
  if (actingAsOrgId !== undefined && actingAsOrgIdentityHex) {
    headers['X-Acting-Org-Id'] = actingAsOrgId.toString();
    headers['X-Acting-Org-Identity'] = actingAsOrgIdentityHex;
  }
  const resp = await fetch(`${IMAGES_RELAY_URL}/upload`, {
    method: 'POST',
    headers,
    body: blob,
  });
  const text = await resp.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* non-JSON */ }
  if (!resp.ok) {
    throw new Error(data?.error || `Upload failed (${resp.status})`);
  }
  return { key: data.key, url: data.url, bytes: data.bytes };
}

// Upload the full-size (≤0.5MB) profile picture to S3 via the images relay.
// Returns the immutable URL; the DB only ever stores this URL + the 10KB
// thumbnail (bandwidth design — the full image is fetched on demand for
// swipe backgrounds and profile-pic zoom only).
export async function uploadProfilePicture(
  blob: Blob,
  actingAsOrgId?: bigint,
  actingAsOrgIdentityHex?: string,
): Promise<{ url: string }> {
  const token = getOAuthSession()?.stToken;
  if (!token) throw new Error('Not signed in');
  const headers: Record<string, string> = {
    'Content-Type': blob.type || 'image/webp',
    Authorization: `Bearer ${token}`,
  };
  if (actingAsOrgId !== undefined && actingAsOrgIdentityHex) {
    headers['X-Acting-Org-Id'] = actingAsOrgId.toString();
    headers['X-Acting-Org-Identity'] = actingAsOrgIdentityHex;
  }
  const resp = await fetch(`${IMAGES_RELAY_URL}/profile-upload`, {
    method: 'POST',
    headers,
    body: blob,
  });
  const text = await resp.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* non-JSON */ }
  if (!resp.ok) {
    throw new Error(data?.error || `Picture upload failed (${resp.status})`);
  }
  if (!data?.url) {
    throw new Error('Picture upload failed — no URL returned');
  }
  return { url: data.url };
}

// Delete a gallery photo: S3 object first (the relay gates ownership
// row-based via the module — can_delete_gallery_photo), then the row.
// The row reducer is idempotent, so a retried flow stays safe.
export async function deleteGalleryPhoto(
  photo: GalleryPhoto,
  actingAsOrgId?: bigint,
  actingAsOrgIdentityHex?: string,
): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  const token = getOAuthSession()?.stToken;
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${IMAGES_RELAY_URL}/img/${photo.s3Key}`, {
    method: 'DELETE',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(actingAsOrgIdentityHex ? { 'X-Acting-Org-Identity': actingAsOrgIdentityHex } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text?.includes('Not your photo') ? 'You can only delete your own gallery photos' : `Could not delete photo (${res.status})`);
  }
  await withSocketTimeout(dbConnection.reducers.deleteGalleryPhoto({
    photoId: photo.id,
    actingAsOrgId: actingAsOrgId ?? undefined,
    actingAsOrgIdentity: actingAsOrgIdentityHex ? Identity.fromString(actingAsOrgIdentityHex) : undefined,
  }), 'deleteGalleryPhoto');
}

export interface OrgRating {
  raterIdentityHex: string;
  stars: number;
}

export interface RatingsSummary {
  count: number;
  average: number;
  ratings: OrgRating[];
}

// Public read: 5-star votes for any profile identity (frontend only shows
// org ratings, but the procedure works for individuals too).
export async function getRatings(targetIdentityHex: string): Promise<RatingsSummary> {
  if (!dbConnection) return { count: 0, average: 0, ratings: [] };
  try {
    const r = await withSocketTimeout(dbConnection.procedures.getRatings({ targetIdentityHex }), 'getRatings');
    return {
      count: Number(r?.count ?? 0),
      average: Number(r?.average ?? 0),
      ratings: (r?.ratings ?? []).map((g: any) => ({
        raterIdentityHex: g.raterIdentityHex,
        stars: g.stars,
      })),
    };
  } catch (e) {
    console.error('Error fetching ratings:', e);
    return { count: 0, average: 0, ratings: [] };
  }
}

export async function giveRating(targetIdentityHex: string, stars: number): Promise<void> {
  if (!dbConnection) throw new Error('Not connected');
  await withSocketTimeout(dbConnection.reducers.giveRating({
    targetIdentity: Identity.fromString(targetIdentityHex),
    stars,
  }), 'giveRating');
}

