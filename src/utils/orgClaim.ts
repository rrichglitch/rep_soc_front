// Shared organization-claim flow (manual verification by the site owner).
//
// Flow: Claimable Org Profile -> Claim button -> Stripe $19.99 payment (if the
// fee isn't already held) -> request_org_claim reducer -> claim-relay sends a
// verification email to dev@veri.social -> owner replies ACCEPT/DENY ->
// claimant gets a notification and leadership on accept.
//
// The Stripe leg reuses the existing org-fee Checkout (the relay returns to
// /org/create?org_claim=success). A pending claim org id parked in
// localStorage lets CreateOrgPage finish a claim instead of a create after
// payment. After filing, the user lands on /me?claim=verifying, which shows
// the "being verified" modal.
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
    throw new Error(data.error || `Could not send verification email (${resp.status})`);
  }
}

// File the on-chain claim, then trigger the verification email. Returns the
// claim id. On a duplicate-pending error the existing pending claim is
// returned so the email can still be (re)sent.
export async function fileClaimAndNotify(
  orgId: bigint,
  orgName: string,
): Promise<{ claimId: string; duplicate: boolean }> {
  try {
    await requestOrgClaim(orgId);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/already have a pending claim/i.test(msg)) {
      const existing = getMyPendingClaimForOrg(orgId)
        ?? getMyOrgClaims().filter(c => c.orgId === orgId && c.status === 'pending').pop();
      if (existing) {
        await notifyClaimRelay(existing.id.toString(), orgId.toString(), orgName);
        return { claimId: existing.id.toString(), duplicate: true };
      }
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
