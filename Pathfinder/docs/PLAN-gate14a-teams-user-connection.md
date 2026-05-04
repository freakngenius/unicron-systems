# PLAN — Gate 14A: User-level Microsoft Teams connector

**Branch:** `demo-polish-ux/gate14a-teams-user-connection`
**Worktree:** `Pathfinder-worktrees/gate14a-teams-user-connection/`
**Goal:** Replace the "Coming in Phase 2" stub on the Teams tile with a per-user multi-tenant Microsoft Entra OAuth flow, mirroring the Gate 10B HubSpot pattern.

## Scope (this gate)

Schema + connection routes + Settings tile only. Send-via-Teams, inbound notifications, channel posting, and Adaptive Cards are deferred to Gates 14B–14E.

## Files

### New
- `Pathfinder/supabase/migrations/0123_user_connections_teams.sql` — additive migration: widen `user_connections.provider` CHECK to include `'teams'`; add nullable `tenant_id text` column.
- `Pathfinder/lib/connectors/teams/user-oauth.ts` — user-level OAuth helpers: `buildAuthorizeUrl(state)`, `exchangeCode(code)`, `revokeAtMicrosoft(accessToken)`. Reads `TEAMS_USER_CLIENT_ID` / `TEAMS_USER_CLIENT_SECRET` / `TEAMS_USER_TENANT_AUTHORITY` (defaults to `https://login.microsoftonline.com/common`).
- `Pathfinder/app/api/connectors/teams/install/route.ts` — POST + GET → 302 to Microsoft consent. Mirrors `hubspot/install`. Operator-gated.
- `Pathfinder/app/api/connectors/teams/callback/route.ts` — GET. Forks on `state.payload.user_id` presence: user-level when set; 400 with an explanatory `org_level_unsupported_here` error when absent (org-level Teams ships separately and gets its own routing — see TODO).
- `Pathfinder/app/api/connectors/teams/disconnect/route.ts` — POST. Best-effort `https://graph.microsoft.com/v1.0/me/revokeSignInSessions` then flips local row to `status='revoked'`.
- `Pathfinder/app/api/connectors/teams/status/route.ts` — GET. Per-user tile-state response.
- `Pathfinder/components/settings/connectors/TeamsUserTile.tsx` — mirrors `HubspotUserTile.tsx`. States: disconnected / connected / expired / error.
- `Pathfinder/tests/connectors/teams-user-connection.test.ts` — 8 tests mirroring `hubspot-user-connection.test.ts`.

### Modified
- `Pathfinder/lib/connectors/user-connection.ts` — widen `UserConnectionProvider` to include `'teams'`. Add `tenant_id` to `UserConnection` interface + row mapping. Add Teams-specific helpers: `getActiveTeamsConnection`, `getTeamsConnectionTokens`, `upsertTeamsConnection`, `markTeamsConnectionRevoked`, `revokeTeamsTokenAtProvider`.
- `Pathfinder/app/settings/connectors/page.tsx` — when `process.env.MULTI_TENANT_TEAMS_ENABLED === '1'`, slot `<TeamsUserTile state="disconnected" operatorEmail={null} />` via `tileOverrides.teams`. When env flag missing, leave the legacy stub modal path.

### Operator side (out-of-tree)
- `MEMORY/operator-todos/2026-05-03-teams-user-setup.md` — Microsoft Entra app reuse decision, scopes, redirect URI registration, Vercel env vars.
- `MEMORY/gate14-teams-live-status.md` — initial entry.

## Schema

Migration `0123_user_connections_teams.sql`:
1. `do $$` block: drop any existing `user_connections_provider_check` CHECK constraint that does NOT include `'teams'`, then re-add the wider check.
2. `alter table pathfinder.user_connections add column if not exists tenant_id text;`
3. Index `user_connections_user_provider_tenant_idx on (user_id, provider, tenant_id) where tenant_id is not null` (idempotent).

No DROP. No data-mutating ALTER. Re-runnable. Mirrors the 0115 pattern.

## Auth + scopes

- Authority: `https://login.microsoftonline.com/common` (multi-tenant default)
- Scopes (delegated): `User.Read offline_access ChannelMessage.Send Chat.ReadWrite`
- Redirect URI: `https://www.unicron.systems/pathfinder/api/connectors/teams/callback` (Kyle registers in Microsoft Entra app config)
- Token storage: encrypted via existing `pgcrypto` helpers (`encrypt_connector_token` / `decrypt_connector_token` from migration 0105). Same `CONNECTOR_TOKEN_KEY` env var.

## State token

Reuse `lib/connectors/oauth-state.ts` `issueState` with `connector_type: 'teams'` + `user_id: <operator email>`. Callback validates with `expectedType: 'teams'` and forks on `user_id` presence.

## Coexistence with org-level Teams (PR #66 / #69)

The existing generic `app/api/connectors/[type]/callback/route.ts` handles org-level Teams via Bot Framework. Adding a static `app/api/connectors/teams/callback/route.ts` shadows the generic for the `teams` segment. To preserve future org-level callback ability:
- Static callback validates state. If state has `user_id` → user-level path.
- If state has no `user_id` → respond 400 `{error: 'org_level_unsupported_here', detail: '...'}` and add a TODO comment to fork to org-level handling when PR #66/#69 lands.

This is safe today because PR #66/#69 are not merged to main (verified via `git log --all`). When they ship, that PR should add the org-level dispatch branch.

## Tile gating

`MULTI_TENANT_TEAMS_ENABLED=1` env var. When unset:
- `app/settings/connectors/page.tsx` does NOT pass `tileOverrides.teams`, so the existing stub-modal path renders unchanged.
- Routes still exist but harmless without the tile entry point.

When set:
- `<TeamsUserTile />` replaces the stub via `tileOverrides`.
- Tile self-hydrates via `/api/connectors/teams/status`.

## Tests (8 total)

Mirror `tests/connectors/hubspot-user-connection.test.ts`:

1. `getActiveTeamsConnection filters by (user_id, provider='teams', status='active')` — multi-tenant isolation
2. Returns null when user has no active row (user B query returns nothing from user A data)
3. `getTeamsConnectionTokens` decrypts both access + refresh
4. `upsertTeamsConnection` encrypts before insert + revokes prior active row (filters on user, provider, tenant_id, status)
5. `markTeamsConnectionRevoked` filters scope correctly with tenant_id
6. `markTeamsConnectionRevoked` without tenant_id still scopes by user+provider+status
7. `revokeTeamsTokenAtProvider` returns false on transport error (best-effort)
8. `revokeTeamsTokenAtProvider` returns true on 2xx Microsoft Graph response

## Verification gates

- `pnpm typecheck` — green (no `npx tsc --noEmit` regressions)
- `pnpm lint` — clean
- `pnpm test tests/connectors/teams-user-connection` — 8/8 pass
- `pnpm test` — total ≥ baseline (1244)
- `pnpm build` — green Next.js build

## Hard halt criteria

Wake Kyle if any of:
- Existing tests regress below 1244
- Settings page returns 5xx after my diff
- Multi-tenant routing fails (user A's Teams data visible to user B)
- Token encryption requires schema change beyond additive
- Microsoft Entra app reuse decision blocks shipping

## Auto-revert triggers

Same as Gate 12 boilerplate. Houston flagship preserved; agent_runs untouched.

## Auto-merge

Per dispatch + Kyle's confirmation: PR opens, watches CI, `gh pr merge --squash` on green. Halt before Gate 14B for env var setup.
