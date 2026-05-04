# Operator TODO — Microsoft Teams user-level connector (Gate 14)

**Created:** 2026-05-03
**Owner:** Kyle
**Why:** Gate 14A code is shipping (PR open). The Connect button in
`/pathfinder/settings/connectors` will not work in production until
Microsoft Entra app + Vercel env vars are in place. Until then the
TeamsUserTile renders the Connect affordance but `/api/connectors/teams/install`
will return 500 (`install_setup_failed: TEAMS_USER_CLIENT_ID is not set`).

The flag `MULTI_TENANT_TEAMS_ENABLED` controls whether the new tile
even renders. While the flag is unset (default), the legacy
"Coming in Phase 2" stub modal renders unchanged — so production is
safe before any of the steps below complete.

## Decision needed first

**Microsoft Entra app: reuse existing or create fresh?**

Spec says "shared with Outlook user-level app" — but no Outlook
user-level OAuth code exists in the repo today (only the inbound webhook
under `app/api/email/webhooks/outlook`). So nothing to reuse yet.

Options:

- **(A) Create a fresh multi-tenant Entra app for Teams.** Single-purpose;
  cleanest blast radius. Outlook user-level (when it ships) can either
  reuse the same app or create its own.
- **(B) Create a fresh multi-tenant Entra app for "user delegation"
  generally**, intended to cover Teams *and* Outlook user-level when
  Outlook ships. One app, multiple scopes — Microsoft permits a single
  Entra app to hold scopes across services as long as they're delegated.

Recommendation: **(A) for now.** Lower risk. When Outlook ships, expand
that app's scopes or add Outlook to it explicitly.

## Microsoft Entra setup

1. Visit https://entra.microsoft.com → Applications → App registrations → New registration
2. Name: `Pathfinder — User Connectors` (or similar)
3. Supported account types: **Accounts in any organizational directory** (multi-tenant)
4. Redirect URIs (Web platform):
   - `https://www.unicron.systems/pathfinder/api/connectors/teams/callback`
   - `https://www.unicron.systems/api/connectors/teams/callback` (non-www, in case the proxy ever serves direct)
5. After creation, capture from Overview pane:
   - Application (client) ID → goes into `TEAMS_USER_CLIENT_ID`
6. Certificates & secrets → New client secret:
   - Description: `pathfinder-teams-user-2026`
   - Expires: 24 months (longest available)
   - Value (shown once) → goes into `TEAMS_USER_CLIENT_SECRET`
7. API permissions → Microsoft Graph → Delegated permissions, add:
   - `User.Read`
   - `offline_access`
   - `ChannelMessage.Send`
   - `Chat.ReadWrite`
   - (Optional, defer if blocking) `TeamsActivity.Send`
8. Grant admin consent for the development tenant (Kyle's MSDN tenant)
   so Kyle can self-test without admin-of-tenant prompts.
9. Token configuration → optional claim `tid` on `id_token` (probably
   default; verify the token returned to the callback carries `tid` so
   the tenant_id extraction works — without it the callback redirects
   to Settings with `error=introspect_failed&detail=missing tenant_id`).

## Vercel env vars (Pathfinder project)

Add to **production + preview**:

```
TEAMS_USER_CLIENT_ID=<application client id from step 5>
TEAMS_USER_CLIENT_SECRET=<client secret value from step 6>
TEAMS_USER_TENANT_AUTHORITY=https://login.microsoftonline.com/common
MULTI_TENANT_TEAMS_ENABLED=1
```

Then redeploy (or wait for the next merge to main to auto-deploy).

## Smoke test (after env vars + redeploy)

1. Visit `https://www.unicron.systems/pathfinder/settings/connectors` —
   Microsoft Teams tile should now show the user-level UI (not the stub modal).
2. Click "Connect Teams" → expect 302 to `login.microsoftonline.com/common/...`
3. Approve consent → expect redirect back to `/pathfinder/settings/connectors?connected=teams`
4. Tile flips to **Connected**, shows account label + tenant id (truncated) + connected-at.
5. Click Disconnect → confirm → tile returns to **Disconnected**.

## Halt criteria — wake the dispatch session if any of:

- Microsoft 365 license tier blocks one or more required scopes
- Token endpoint returns `tenant_id=null` (multi-tenant routing breaks)
- Disconnect at Microsoft Graph fails with non-401 — investigate before proceeding to Gate 14B

## Coexistence with org-level Teams (PR #66 / #69)

The org-level Bot Framework path uses `TEAMS_APP_ID` + `TEAMS_CLIENT_SECRET`
(distinct env names). They can coexist in Vercel — the user-level Entra
app is separate from any org-level bot Entra app. When PR #66/#69 ships,
its callback handler should be wired into the static
`app/api/connectors/teams/callback` route (currently 400s on no-user_id
state with a clear `org_level_unsupported_here` error).

## Next gates after env vars confirmed

- **Gate 14B** — Send-via-Teams in OutreachComposer (resolves recipient → Microsoft Graph 1:1 chat)
- **Gate 14C** — Inbound replies via Microsoft Graph subscriptions
- **Gate 14D** — Per-user channel posting prefs
- **Gate 14E** — Adaptive Cards for lead notifications

The dispatch session halts at the boundary between 14A and 14B until
Kyle confirms env vars + first end-to-end OAuth round-trip works.
