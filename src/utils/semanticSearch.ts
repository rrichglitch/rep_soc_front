// GPU-box semantic search via the SpacetimeDB event-table bridge.
//
// Flow (all over the existing maincloud WebSocket — no new public surface):
//   1. call request_semantic_search(nonce, query, params)
//   2. the box receives the row via its view subscription, computes results,
//      calls deliver_search_result
//   3. we receive our row via my_search_results view (recipient = us)
//   4. timeout → caller falls back to keyword search

const SEMANTIC_TIMEOUT_MS = 6000;

export async function semanticSearch(
  query: string,
  filters: import('./searchProvider').SearchFilters
): Promise<import('./searchProvider').SearchResult[]> {
  const { getDbConnection } = await import('./spacetime');
  const db = getDbConnection();
  if (!db) throw new Error('Not connected to SpacetimeDB');

  const nonce = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const params = JSON.stringify({
    types: [
      ...(filters.showIndividuals !== false ? ['person'] : []),
      ...(filters.showOrganizations !== false ? ['org'] : []),
    ],
    gender: filters.gender && filters.gender !== 'any' ? filters.gender : undefined,
    age_min: filters.ageMin,
    age_max: filters.ageMax,
    tier: 'client',
  });

  // Subscribe BEFORE requesting so the push can't race past us.
  let done: ((r: import('./searchProvider').SearchResult[]) => void) | null = null;
  let fail: ((e: Error) => void) | null = null;
  const resultPromise = new Promise<import('./searchProvider').SearchResult[]>((resolve, reject) => {
    done = resolve;
    fail = reject;
  });

  const onInsert = (_ctx: unknown, row: any) => {
    if (row.nonce !== nonce) return;
    try {
      const parsed = JSON.parse(row.resultsJson || '{}');
      if (parsed.error === 'allowance_exhausted' || parsed.error === 'allowance_disabled') {
        fail?.(new Error(parsed.error));
        return;
      }
      const out = (parsed.results ?? []).map((r: any) => ({
        type: r.type === 'org' ? ('org' as const) : ('person' as const),
        identity: r.identity_hex || '',
        orgId: r.org_id !== undefined && r.org_id !== null ? BigInt(r.org_id) : undefined,
        email: r.email || '',
        fullName: r.full_name || '',
        profilePicture: r.profile_picture || '',
        city: r.city || '',
        description: r.description || '',
        locationLat: r.location_lat ?? undefined,
        locationLng: r.location_lng ?? undefined,
      }));
      done?.(out);
      done = null; fail = null;
    } catch (e) {
      console.error('[semantic] bad payload:', e);
      done?.([]);
    }
  };

  (db as any).db.mySearchResults.onInsert(onInsert);
  const onAllowance = (_ctx: unknown, row: any) => {
    // Allowance rows update as a side effect of the request reducer; if the
    // server signalled exhaustion, fail fast with the code the provider maps.
    void row;
  };
  try { (db as any).db.mySearchAllowance.onInsert(onAllowance); } catch {}

  try {
    await (db as any).reducers.requestSemanticSearch({ nonce, query, paramsJson: params });
    const results = await Promise.race([
      resultPromise,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('semantic timeout')), SEMANTIC_TIMEOUT_MS)
      ),
    ]);
    return results;
  } finally {
    try { (db as any).db.mySearchResults.removeOnInsert(onInsert); } catch {}
    try { (db as any).db.mySearchAllowance.removeOnInsert(onAllowance); } catch {}
  }
}
