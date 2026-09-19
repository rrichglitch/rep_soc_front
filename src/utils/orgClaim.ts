// Shared organization-claim flow.
//
// CURRENT MODEL (2026-09-19): claiming a leaderless ("claimable") org is
// IMMEDIATE. The user pays the one-time $19.99 Stripe fee (unless already
// held) and request_org_claim ACCEPTS the claim server-side the moment it is
// filed — one payment == instant ownership. The user lands on
// /me?claim=done, which shows the "claim complete" modal.
//
// The earlier EMAIL-VERIFICATION flow is RETAINED for future use: the
// claim-relay (notifyClaimRelay / fileClaimAndNotify) emails dev@veri.social
// about a pending claim and the owner replies ACCEPT/DENY (resolve_org_claim).
// Nothing in the current happy path calls it.
//
// The Stripe leg reuses the existing org-fee Checkout; the payments relay
// returns to /me?claim=success. A pending claim org id parked in localStorage
// lets MyProfilePage / CreateOrgPage finish a claim after payment.
import { CLAIM_RELAY_URL } from '../config';
import { getOAuthSession } from './oauthSession';
import { requestOrgClaim, getMyPendingClaimForOrg, getMyOrgClaims } from './spacetime';

// Org id awaiting post-payment claim filing (set before Stripe redirect).
const PENDING_CLAIM_KEY = 'veri_pending_claim_org';

export function setPendingClaimOrg(orgId: string): void {
  try { localStorage.setItem(PENDING_CLAIM_KEY, orgId); } catch { /* private mode */ }
}

export function getPendingClaimOrg(): string | null {
  try { return localStorage.getItem(PENDING_CLAIM_KEY); } catch { return null; }
}

export function clearPendingClaimOrg(): void {
  try { localStorage.removeItem(PENDING_CLAIM_KEY); } catch { /* private mode */ }
}

// Tell the claim-relay to email the site owner about a filed claim. The relay
// authenticates the caller via the STDB bearer token (whoami must equal the
// claimant) — a forged claimId for someone else's claim is rejected there.
// Best-effort from the UI's perspective: the claim itself is already filed;
// a notify failure just means the owner won't get the email for this attempt
// (the error is surfaced so the user can retry by tapping Claim again, which
// hits the duplicate-pending guard and re-sends the email).
export async function notifyClaimRelay(
  claimId: string,
  orgId: string,
  orgName: string,
): Promise<void> {
  const session = getOAuthSession();
  if (!session?.stToken) throw new Error('Not authenticated');
  const resp = await fetch(`${CLAIM_RELAY_URL}/api/claim-notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.stToken,
    },
    body: JSON.stringify({ claimId, orgId, orgName }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `Could not send the verification request (${resp.status})`);
  }
}

// File the claim — the current model: the server ACCEPTS it immediately
// (leadership transfers + fee consumed in the same transaction). No
// verification email, no relay call.
//
// Idempotent for the common re-entry cases (double-tap, the success effect
// re-running, back-then-forward): when an ACCEPTED claim for this org is
// already in the local cache, filing again would panic server-side (fee
// already consumed) — treat it as done instead.
export async function fileClaim(orgId: bigint): Promise<void> {
  if (getMyOrgClaims().some(c => c.orgId === orgId && c.status === 'accepted')) return;
  await requestOrgClaim(orgId);
}

// RETIRED HAPPY PATH — kept for the future email-verification flow. Files the
// on-chain claim, then triggers the verification email. Returns the claim id.
// When a pending claim already exists (the resend path) the reducer is
// SKIPPED: request_org_claim throws on duplicates and module-reducer throws
// are PANICS — clients only ever see the generic "The instance encountered a
// fatal error.", never the thrown text. State checks, not message parsing.
export async function fileClaimAndNotify(
  orgId: bigint,
  orgName: string,
): Promise<{ claimId: string; duplicate: boolean }> {
  const pending = getMyPendingClaimForOrg(orgId);
  if (pending) {
    await notifyClaimRelay(pending.id.toString(), orgId.toString(), orgName);
    return { claimId: pending.id.toString(), duplicate: true };
  }
  try {
    await requestOrgClaim(orgId);
  } catch (e: any) {
    // Race (filed from another tab between the check and the call) — re-read
    // state instead of the (unreliable) error message.
    const nowPending = getMyPendingClaimForOrg(orgId)
      ?? getMyOrgClaims().filter(c => c.orgId === orgId && c.status === 'pending').pop();
    if (nowPending) {
      await notifyClaimRelay(nowPending.id.toString(), orgId.toString(), orgName);
      return { claimId: nowPending.id.toString(), duplicate: true };
    }
    throw e;
  }
  // The new pending row lands via subscription — poll briefly for its id.
  let claimId: string | null = null;
  for (let i = 0; i < 20 && !claimId; i++) {
    const pending = getMyPendingClaimForOrg(orgId);
    if (pending) { claimId = pending.id.toString(); break; }
    await new Promise(r => setTimeout(r, 500));
  }
  // Fallback: newest pending claim overall (single-claim flow — the user just
  // filed it). If even that is missing, the claim still exists server-side;
  // the relay will match by (claimant, org) instead.
  if (!claimId) {
    const all = getMyOrgClaims().filter(c => c.status === 'pending');
    const last = all[all.length - 1];
    claimId = last ? last.id.toString() : '0';
  }
  await notifyClaimRelay(claimId, orgId.toString(), orgName);
  return { claimId, duplicate: false };
}

// SpacetimeDB reducer throws are panics: clients receive only the generic
// "The instance encountered a fatal error." — use a copy-appropriate fallback
// for those; pass real messages (network errors, relay JSON errors) through.
export function claimErrorMessage(e: any, fallback: string): string {
  const msg = String(e?.message ?? e ?? '');
  if (!msg || /fatal error/i.test(msg) || /instance encountered/i.test(msg)) return fallback;
  return msg;
}
