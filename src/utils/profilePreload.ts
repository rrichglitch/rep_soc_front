// Preload store: profile top-info captured where it ALREADY exists in memory
// (search results, friend/chat/notification rows, story posts, RPC lookups)
// so ProfilePage can paint the header instantly on click — no full-table
// subscription and no network round trip needed for the first frame.
//
// Bounded by what the user has actually SEEN or already looked up this
// session (search page results, on-screen rows) — never "every user". The
// 2s RPC refresh on ProfilePage fills anything the preload lacks (gender,
// age, hide-friends state, etc. on partial entries).
//
// This is the click-context preload the user requested (2026-08-31) and the
// seam the future per-subscriber profile view (visible_profiles) will plug
// into when the full user_profile/organization subscriptions are dropped.

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

const profileStore = new Map<string, ProfilePreload>();
const orgStore = new Map<string, OrgPreload>(); // key: orgId.toString()

export function preloadProfile(identityHex: string, p: ProfilePreload): void {
  if (!identityHex) return;
  profileStore.set(identityHex, p);
}

export function preloadProfiles(
  entries: Array<{ identityHex: string; preload: ProfilePreload }>
): void {
  for (const e of entries) preloadProfile(e.identityHex, e.preload);
}

export function getPreloadedProfile(identityHex: string): ProfilePreload | undefined {
  return profileStore.get(identityHex);
}

export function preloadOrg(orgId: bigint, o: OrgPreload): void {
  orgStore.set(orgId.toString(), o);
}

export function getPreloadedOrg(orgId: bigint): OrgPreload | undefined {
  return orgStore.get(orgId.toString());
}