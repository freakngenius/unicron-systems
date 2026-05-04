# Gate 14 — Teams User Connector — Live Status

## 2026-05-03 — Gate 14A code complete; PR open

**Branch:** `demo-polish-ux/gate14a-teams-user-connection`
**Worktree:** `Pathfinder-worktrees/gate14a-teams-user-connection/`
**PR:** (filled in after `gh pr create`)

### Shipped

- Migration `0123_user_connections_teams.sql` — additive: widens
  `user_connections.provider` CHECK to include `'teams'`; adds
  nullable `tenant_id` column; idempotent (mirrors 0115 pattern).
- `lib/connectors/user-connection.ts` — extended with:
  - `UserConnectionProvider` widened to include `'teams'`
  - `tenant_id` field on `UserConnection`
  - `UpsertTeamsConnectionInput` interface
  - `getActiveTeamsConnection`, `getTeamsConnectionTokens`,
    `upsertTeamsConnection`, `markTeamsConnectionRevoked`,
    `revokeTeamsTokenAtProvider`
- `lib/connectors/teams/user-oauth.ts` (new) — Microsoft Entra v2.0
  OAuth helpers: `buildAuthorizeUrl(state)`, `exchangeCode(code)`,
  `refreshToken(refresh)`, `decodeIdToken(idToken)`. Distinct from
  the existing org-level `lib/connectors/teams/oauth.ts` (Bot
  Framework). Reads `TEAMS_USER_CLIENT_ID` / `TEAMS_USER_CLIENT_SECRET`
  / `TEAMS_USER_TENANT_AUTHORITY` env vars.
- `app/api/connectors/teams/install/route.ts` — POST + GET → 302 to
  Microsoft consent. Operator-gated.
- `app/api/connectors/teams/callback/route.ts` — GET. Forks on state's
  `user_id` presence. User-level path writes to `user_connections`.
  Org-level path 400s with a clear `org_level_unsupported_here` pointer
  (org-level Teams ships in PR #66/#69; that PR will add the dispatch).
- `app/api/connectors/teams/disconnect/route.ts` — POST. Best-effort
  Microsoft Graph `/me/revokeSignInSessions` then mark local revoked.
- `app/api/connectors/teams/status/route.ts` — GET. Per-user state for
  the tile (mirrors `/api/connectors/hubspot/status`).
- `components/settings/connectors/TeamsUserTile.tsx` — mirrors
  `HubspotUserTile`. States: disconnected / connected / expired / error.
  Brand color `#4B53BC` (primary) / `#7B83EB` (accent) / `#c42424` (revoke).
- `app/settings/connectors/page.tsx` — when
  `process.env.MULTI_TENANT_TEAMS_ENABLED === '1'`, slots
  `<TeamsUserTile state="disconnected" operatorEmail={null} />` via
  `tileOverrides.teams`. When unset, the legacy "Coming in Phase 2"
  stub modal renders unchanged.
- `tests/connectors/teams-user-connection.test.ts` — 9 tests covering
  multi-tenant isolation, encrypt round-trip, upsert/revoke cycle,
  tenant scoping, and best-effort revoke at Microsoft Graph.

### Verification

- `npx vitest run tests/connectors/teams-user-connection.test.ts` →
  9/9 passed
- `npx vitest run` (full suite) → 1332 passed | 24 skipped (well above
  the 1244+ baseline)
- `npx tsc --noEmit` → 0 errors
- `npx next lint` → No ESLint warnings or errors
- `npx next build` → green; 4 new Teams routes built
  (`/api/connectors/teams/{install,callback,disconnect,status}`)

### Coexistence

- Org-level Teams generic callback (`app/api/connectors/[type]/callback`)
  is shadowed by the new static `/teams/callback`. Today this is safe
  because PR #66/#69 (org-level Bot Framework) is not merged to main.
  When that PR lands, it must add a `state.payload.user_id`-absent
  fork in the static callback to dispatch to the org-level handler.

### Operator action required (parallel)

`MEMORY/operator-todos/2026-05-03-teams-user-setup.md` — Kyle to:
1. Decide Microsoft Entra app posture (recommendation: fresh user-only app)
2. Register app + redirect URI
3. Add `TEAMS_USER_CLIENT_ID`, `TEAMS_USER_CLIENT_SECRET`,
   `TEAMS_USER_TENANT_AUTHORITY`, `MULTI_TENANT_TEAMS_ENABLED=1` to
   Vercel (production + preview)
4. Smoke-test the round-trip after redeploy

### Halt before Gate 14B

Per dispatch: do NOT proceed to Gate 14B (send-via-Teams in
OutreachComposer) until Kyle confirms env vars + first OAuth
round-trip works. Without that confirmation we don't know whether
the Microsoft Entra app is correctly configured for delegated send.

### Auto-merge

PR opens, watches CI, `gh pr merge --squash` on green. Per dispatch +
Kyle's explicit confirmation in this session.
