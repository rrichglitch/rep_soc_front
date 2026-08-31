// Preload store: profile TOP-INFO captured where it already exists in memory
// (search results, friend/chat/notification rows, story cards, RPC lookups)
// so ProfilePage paints the header instantly on click. Only header fields —
// NEVER posts, stories, or friend lists.
//
// Three tiers (user spec 2026-08-31):
//   SCREEN  — users on the current screen (search batch, friend/chat/notif/
//             story rows): LRU capped at SCREEN_CAP. Search preloads only a
//             reasonable batch per call (see searchProvider), never all pages.
//   VISITED  — the last VISITED_CAP other profiles actually opened (top data
//             only): LRU, written by ProfilePage.loadProfile on RPC success.
//   OWN      — the signed-in user's own top info INCLUDING pictures: pinned,
//             never evicted. Written from getProfileRowByEmail (every
//             own-page boot path reads it). This is the guarantee the future
//             per-subscriber view round (visible_profiles) builds on when the
//             full user_profile/organization subscriptions are dropped.
//
// The 2s RPC refresh on ProfilePage fills anything a partial entry lacks.

export interface ProfilePreload {
  fullName: string;
  picture: string; // thumb (small-first) — renders at header/avatar size
  fullPicture?: string; // S3 URL / legacy — zoom + swipe backgrounds
  city: string;
  description: string;
  gender?: string;
  age?: number;
  hideFriends?: boolean;
  createdAtMicros?: bigint | number;
  isPro?: boolean;
}

export interface OrgPreload {
  name: string;
  picture: string; // thumb
  fullPicture?: string;
  city: string;
  description: string;
  gender?: string;
  hideMembers?: boolean;
}

const SCREEN_CAP = 100;
const VISITED_CAP = 10;
const ORG_CAP = 50;

const screenStore = new Map<string, ProfilePreload>();
const screenOrder: string[] = [];
const visitedStore = new Map<string, ProfilePreload>();
const visitedOrder: string[] = [];
const orgStore = new Map<string, OrgPreload>();
const orgOrder: string[] = [];
let ownProfile: { identityHex: string; preload: ProfilePreload } | null = null;

function lruSet<T>(map: Map<string, T>, order: string[], key: string, value: T, cap: number): void {
  if (map.has(key)) {
    map.set(key, value);
    const i = order.indexOf(key);
    if (i > 0) {
      order.splice(i, 1);
      order.unshift(key);
    }
    return;
  }
  map.set(key, value);
  order.unshift(key);
  if (order.length > cap) {
    const evicted = order.pop()!;
    map.delete(evicted);
  }
}

// ─── SCREEN tier: whoever is on the current screen ──────────────────────────
export function preloadProfile(identityHex: string, p: ProfilePreload): void {
  if (!identityHex) return;
  lruSet(screenStore, screenOrder, identityHex, p, SCREEN_CAP);
}

// ─── VISITED tier: last 10 other profiles opened (top data only) ────────────
export function preloadVisitedProfile(identityHex: string, p: ProfilePreload): void {
  if (!identityHex) return;
  lruSet(visitedStore, visitedOrder, identityHex, p, VISITED_CAP);
}

// ─── OWN tier: pinned, never evicted, pictures included ─────────────────────
export function preloadOwnProfile(identityHex: string, p: ProfilePreload): void {
  if (!identityHex) return;
  ownProfile = { identityHex, preload: p };
}

// ─── Orgs (few by nature; small LRU) ────────────────────────────────────────
export function preloadOrg(orgId: bigint, o: OrgPreload): void {
  lruSet(orgStore, orgOrder, orgId.toString(), o, ORG_CAP);
}

export function getPreloadedProfile(identityHex: string): ProfilePreload | undefined {
  return (
    visitedStore.get(identityHex) ??
    screenStore.get(identityHex) ??
    (ownProfile && ownProfile.identityHex === identityHex ? ownProfile.preload : undefined)
  );
}

export function getPreloadedOrg(orgId: bigint): OrgPreload | undefined {
  return orgStore.get(orgId.toString());
}