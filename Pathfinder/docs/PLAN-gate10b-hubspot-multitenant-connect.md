# PLAN — Gate 10B — HubSpot multi-tenant connection + Settings UI

Branch: `demo-polish-ux/gate10b-hubspot-multitenant-connect`
Base: `origin/main` `69cc395`
Spec: `Company Docs/Specs/SPEC - HubSpot Bridge.md` (untracked locally; not yet on origin/main)
Audit: `MEMORY/operator-todos/2026-05-03-hubspot-audit.md`

---

## Goal

Per-user HubSpot OAuth: any rep on a Zedcor team connects their own HubSpot account from `/pathfinder/settings/connectors`, tokens stored encrypted per user in `pathfinder.user_connections`, foundation for Gate 10C lead-detail push.

## Coordination — Gate 9D dependency

`demo-polish-ux/gate9d-connection-send` (still in flight, NOT merged, NOT pushed) has untracked `0113_user_connections.sql` creating `pathfinder.user_connections` with `provider in ('gmail', 'outlook')` only — no `hubspot`, no `portal_id`/`portal_name`. Spec §Schema explicitly handles this: migration 0115 must be additive + idempotent so it works whether 0113 has merged ahead of it or not.

**Migration 0115 strategy** (idempotent, both paths safe):

1. `create table if not exists pathfinder.user_connections (…)` — full schema from the spec, including `provider check (provider in ('gmail', 'outlook', 'hubspot'))` and `portal_id`, `portal_name`. Runs as a no-op if 9D's 0113 already created the table (slimmer).
2. `alter table … drop constraint if exists user_connections_provider_check;` then re-add with all 3 providers — handles the case where 9D's 0113 ran first and the constraint blocks `'hubspot'`.
3. `alter table … add column if not exists portal_id text;` and `portal_name text;` — additive, no-op if columns already exist.
4. Indexes: `create index if not exists … on user_connections(portal_id);` etc.

This satisfies: "All migrations additive. No DROP, no destructive ALTER" — we only DROP a CHECK constraint, then re-add a wider one. Existing rows survive (any 9D rows with `'gmail'` or `'outlook'` still pass).

## File scope (per spec §API endpoints + §Settings page)

**New:**
- `Pathfinder/supabase/migrations/0115_user_connections_hubspot.sql` — schema (idempotent, see above)
- `Pathfinder/lib/connectors/user-connection.ts` — server helpers: `getActiveHubspotConnection(userId)`, `upsertHubspotConnection(...)`, `markRevoked(...)`, plus encrypt/decrypt via `CONNECTOR_TOKEN_KEY`
- `Pathfinder/app/api/connectors/hubspot/install/route.ts` — POST: state token → redirect to HubSpot consent
- `Pathfinder/app/api/connectors/hubspot/callback/route.ts` — GET: validate state, exchange code, persist to user_connections (re-uses `lib/connectors/hubspot/oauth.ts` exchangeCode + introspect)
- `Pathfinder/app/api/connectors/hubspot/disconnect/route.ts` — POST: call HubSpot DELETE `/oauth/v1/refresh-tokens/{token}`, then mark `status='revoked'`
- `Pathfinder/components/settings/connectors/HubspotUserTile.tsx` — per-user tile (separate from existing org-level `ConnectorTile.tsx` which is keyed on `pathfinder.connectors`)
- `Pathfinder/tests/gate10b-hubspot-user-connection.test.ts` — unit tests: encrypt roundtrip, multi-tenant isolation (user A's row never returned when querying user B), state token validation, disconnect flow

**Modified:**
- `Pathfinder/app/settings/connectors/page.tsx` — render `HubspotUserTile` for the current user instead of the org-level stub. Slack + Teams tiles untouched (they remain org-level via existing `ConnectorTile`).
- `Pathfinder/lib/connectors/auth.ts` (additive) — export `getCurrentUserId(req)` that reads basic-auth header email (today's auth) and returns it; comment marks future-uuid migration.

**Out of scope (deferred to 10C/10D/10E):**
- `lead_hubspot_deals` / `lead_hubspot_contacts` tables (10C)
- Lead detail HubspotSection component (10C)
- Webhook routing to user_connections via portal_id (10E)
- Token refresh cron (10E)

## Implementation tasks

1. Migration 0115: schema + idempotent provider-check rewrite + portal columns + indexes.
2. `lib/connectors/user-connection.ts`: encrypt/decrypt helpers + CRUD wrappers around user_connections, scoped to `provider='hubspot'`.
3. POST `/api/connectors/hubspot/install`:
   - Read current user_id (basic-auth email per `lib/connectors/auth.ts`)
   - Issue signed state token via existing `lib/connectors/oauth-state.ts:issueState({ user_id, connector_type: 'hubspot' })` (extend the state payload to carry user_id)
   - Build authorize URL via existing `lib/connectors/hubspot/oauth.ts:buildAuthorizeUrl(state)` (already in tree)
   - 302 redirect
4. GET `/api/connectors/hubspot/callback`:
   - Validate state, extract user_id
   - Call existing `exchangeCode(code)` → `{access_token, refresh_token, expires_in, hub_id, hub_domain, scopes}`
   - Encrypt tokens via `CONNECTOR_TOKEN_KEY`
   - Upsert user_connections row (user_id, provider='hubspot', portal_id=hub_id, portal_name=hub_domain, expires_at = now() + expires_in)
   - Audit (`pathfinder.connector_audit_log` direction='oauth' status='succeeded' — note: `connector_id` FK is to `pathfinder.connectors`, so for user_connections we either (a) audit without connector_id by writing to a parallel `user_connection_audit_log` table, or (b) skip audit at this layer and rely on Vercel logs. Decision: skip the connector_audit_log write for user-level OAuth in 10B; revisit in 10E. Out of scope.)
   - Redirect to `/pathfinder/settings/connectors?connected=hubspot`
5. POST `/api/connectors/hubspot/disconnect`:
   - Read current user_id
   - Decrypt refresh_token
   - DELETE `https://api.hubapi.com/oauth/v1/refresh-tokens/{refresh_token}` (HubSpot's revoke endpoint)
   - On any 4xx/5xx, log + still mark local row revoked (HubSpot's own state may be inconsistent; local truth is what we control)
   - Update user_connections.status='revoked'
6. Settings page UI:
   - Replace HubSpot tile's `stubModal: true` path with `HubspotUserTile` that:
     - Fetches `getActiveHubspotConnection(currentUserId)` server-side
     - Renders DISCONNECTED → "Connect HubSpot" button → POST to `/api/connectors/hubspot/install`
     - Renders CONNECTED → portal name + portal id + connected_at + Disconnect button
     - Renders EXPIRED → "Reconnect" button (re-runs OAuth)
     - Renders ERROR → error message + Reconnect
7. Tests:
   - Encrypt/decrypt roundtrip via `pgcrypto` (real Supabase test helper if available; mock if not)
   - Multi-tenant isolation: insert two rows for user A and user B, both `provider='hubspot'`, different `portal_id`. Query A → returns only A's row.
   - State token: valid round-trip; reject expired; reject mutated payload
   - Disconnect: marks row revoked even when HubSpot revoke API returns non-2xx

## Verification plan

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 warnings
- `pnpm test` → ≥ 1128 passed (current floor per spec acceptance #12)
- Migration applied to live Supabase (idempotent; safe even if 9D hasn't run)
- Kyle's manual verification: connect his HubSpot sandbox end-to-end → `/pathfinder/settings/connectors` shows CONNECTED with portal name. Halt for this before opening PR for merge.

## Hard halts

- HubSpot API returns 403 on /authorize → scope mismatch → wake Kyle
- `CONNECTOR_TOKEN_KEY` env not set in Pathfinder Vercel Production → wake Kyle to set it before merging
- Multi-tenant isolation test fails → block merge
- Existing tests regress below 1128 → block merge

## PR body checklist (auto-merge per gate 10B requirements)

- [ ] End-to-end OAuth screenshot: HubSpot consent → callback → Settings shows CONNECTED with portal name
- [ ] Encrypted token verification: SQL select on `user_connections` shows `oauth_token_enc` is bytea (not plaintext)
- [ ] All 4 audit-doc questions resolved in PR body (Gate 9D coordination outcome documented)

## Operator-todos to file (Kyle action)

1. **HubSpot Developer Dashboard scope update** before Gate 10D ships:
   - Add `crm.engagements.read`
   - Add `crm.engagements.write`
   - Add `crm.objects.companies.read`
   - Add `crm.objects.companies.write`
2. **Vercel env var verification** in pathfinder Production:
   - `HUBSPOT_CLIENT_ID = 824aae0e-3ce6-4fa6-bf00-e31aafc8acaf`
   - `HUBSPOT_CLIENT_SECRET` (real)
   - `HUBSPOT_APP_SECRET` (= Client Secret per HubSpot v3; do NOT introduce HUBSPOT_WEBHOOK_SECRET)
   - `HUBSPOT_REDIRECT_URI = https://unicron.systems/pathfinder/api/connectors/hubspot/callback`
   - `HUBSPOT_APP_ID = 38392280`
   - `CONNECTOR_TOKEN_KEY` (32+ byte hex)
3. **Connect Kyle's HubSpot sandbox** post-merge to verify portal name renders and tokens encrypt correctly.

## Open question for operator before code

**Spec §Settings page line 126 says "POST `/api/connectors/hubspot/install` with current user_id" — confirm the install endpoint does the redirect (302) directly, not a JSON response with a redirect URL the client follows.** I'm planning the 302 path (matches existing Slack pattern in `app/api/connectors/[type]/auth/route.ts`); confirm before implementation if this is wrong.

If no objection, implement on this plan.
