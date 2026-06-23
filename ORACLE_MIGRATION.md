# Oracle migration notes (frontend)

The frontend has been updated to talk to the new `repsoc-oracle` Rust module
on the self-hosted SpacetimeDB at `150.136.162.142:3000` (instead of maincloud).

## What changed in code

1. `src/config.ts` — `SPACETIMEDB_HOST` and `SPACETIMEDB_MODULE` now default
   to Oracle (`150.136.162.142:3000` and `repsoc-oracle`). Both are
   overridable via env (`VITE_SPACETIMEDB_HOST`, `VITE_SPACETIMEDB_MODULE`).

2. `src/module_bindings/*` — regenerated against the new Rust module via
   `spacetime generate`. The `my_feed` view is now a **procedure**; the
   private tables (feed_position, pending_registration, etc.) are no longer
   in the public API.

3. `src/utils/spacetime.ts`:
   - Dropped `tables.my_feed` from the subscription list.
   - New `loadMyFeed()` calls `dbConnection.procedures.myFeed({})` to fetch
     the feed rows.
   - `getMyFeedStories` / `getPaginatedFeedStories` are unchanged at the
     call-site level (still sync, still returns `FeedStory[]`) but read from
     an in-memory cache populated by `loadMyFeed()`.
   - Removed dead code: `getFeedPosition`, `setFeedPosition`,
     `getFollowedStories`, `getFollowedStoriesWithOptions` (all relied on
     tables that are now private / not exposed in the bindings).

4. `src/pages/MainFeedPage.tsx`:
   - Imports `loadMyFeed` and awaits it before reading paginated rows.
   - Awaits the now-async `getPaginatedFeedStories` calls.

5. `src/utils/spacetime.ts` `connectToSpacetimeDB`:
   - URI is now `wss://` (HTTPS sites) or `ws://` (HTTP sites) — picks
     scheme from `window.location.protocol`. Override by setting
     `VITE_SPACETIMEDB_HOST` to include the scheme explicitly.

## Build & verify

```bash
cd rep_soc_front
npm run build
```

Output: `dist/index.html` and `dist/assets/index-*.js` (~555 KB).

## Deployment checklist

These are things that the user has to arrange in their environment.
The frontend code is correct; the deployment infrastructure may need
adjustments.

### 1. HTTPS / WSS termination (only remaining blocker)

The Oracle instance only listens on **plain HTTP/WS** port 3000. The
production site is `https://veri.social` (HTTPS), so the browser will
try `wss://150.136.162.142:3000` and fail because of the mixed-content
rule (HTTPS page can't open a plain WS connection).

Two ways to fix:

- **Option A (recommended):** put a TLS-terminating reverse proxy (nginx,
  Caddy, Cloudflare Spectrum) in front of SpacetimeDB. The proxy listens
  on `wss://spacetimedb.veri.social:443` and forwards to
  `127.0.0.1:3000`. Then set
  `VITE_SPACETIMEDB_HOST=spacetimedb.veri.social` for the build.

- **Option B (quick):** add a Cloudflare Spectrum proxy or similar in
  front of port 3000 that does TLS termination.

### 2. OIDC issuer — works out of the box (no action needed)

The SpacetimeDB standalone v2.6.0 already validates maincloud OIDC
tokens by default. Verified end-to-end on 2026-06-18: took the existing
`spacetimedb_token` from `~/.config/spacetime/cli.toml` (a maincloud
JWT, `iss=https://auth.spacetimedb.com`), POSTed to
`http://localhost:3300/v1/identity/websocket-token` with
`Authorization: Bearer ...`, and got a short-lived WebSocket token in
return. The server then accepted a SQL query on the `repsoc-oracle`
database using that WS token.

The server logs show the periodic JWKS fetch from
`https://auth.spacetimedb.com` (`Fetching key for issuer
https://auth.spacetimedb.com`), confirming maincloud is the default
authority. **The frontend's existing OIDC code works against Oracle as-is.**

If you ever want to rotate the OIDC issuer (e.g. to your own Auth0/
Keycloak), SpacetimeDB standalone v2.6.0 supports `--allowed-oidc-issuer`
and the matching `SPACETIMEDB_OIDC_ISSUER` env var. The frontend reads
the authority from `VITE_AUTH_AUTHORITY`.

### 3. Env vars to set at build time

For the production build of `veri.social`, set these in the build
environment (Vite reads them at `npm run build` time):

```bash
VITE_SPACETIMEDB_HOST=spacetimedb.veri.social   # or whatever the WSS host is
VITE_SPACETIMEDB_MODULE=repsoc-oracle
# VITE_AUTH_AUTHORITY defaults to https://auth.spacetimedb.com/oidc and works
# against Oracle as-is. Override only if you switch the OIDC issuer.
# VITE_AUTH_CLIENT_ID defaults to the existing maincloud client id.
VITE_TURNSTILE_SITE_KEY=...   # only if rotating the Turnstile key
VITE_BASE_PATH=               # root path; empty for veri.social
```

### 4. Push-notification VAPID keys

The Rust server has push-notification plumbing in `helpers.rs` /
`story_reducers.rs` but the actual `web-push` integration is still a
TODO (same as the TS port — the `sendPushNotifications` function is
stubbed out). No action needed for this migration; just don't expect
push notifications to fire yet.

### 5. Didit + Turnstile config

The Rust server reads `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`,
`DIDIT_API_BASE`, `TURNSTILE_SECRET` from the Oracle host's
environment. Set these on the Oracle host before publishing (or in
the systemd unit's `Environment=` line). The frontend only needs the
public Turnstile site key (env var above).

## Local dev against Oracle

With the SSH tunnel up:

```bash
pkill -f "ssh.*3300" ; ssh -f -N -L 3300:127.0.0.1:3000 space
cd rep_soc_front
VITE_SPACETIMEDB_HOST=localhost:3300 npm run dev
```

The existing `auth.spacetimedb.com/oidc` OIDC flow will work — the
frontend will get a maincloud JWT and the Oracle standalone will
accept it (it has maincloud's JWKS cached). The full login flow can
be tested end-to-end via the SSH tunnel even without a TLS proxy, as
long as you point the browser at the **HTTP** dev server (e.g.
`http://localhost:5173`) so the WSS-or-WS decision comes out as
`ws://localhost:3300` (mixed content rule doesn't apply on plain
HTTP origins).
