# Operator TODO — Microsoft Teams operator-side setup (C-2A blocker)

**Date:** 2026-05-02
**Branch:** `connectors/c2a-teams` (PR opening)
**Owner:** Kyle (operator-side; no engineering required)
**Spec reference:** `Company Docs/Specs/SPEC - Connectors (Slack, Teams, HubSpot).md` § 2

## Status: code shipped, env vars not yet provisioned

The C-2A code branch ships:
- Teams OAuth code-for-token exchange (callback route)
- Bot Framework messaging endpoint with JWT signature verification
- Adaptive Card formatters (formatLead / formatRejection / formatFeedbackPrompt / formatHelp)
- @-mention command parser (mirrors Slack `lib/connectors/slack/commands.ts`)
- DM handler for `conversation.conversationType === 'personal'`
- Action button feedback writes to `lead_feedback` (source='teams_card')
- Dispatcher's `teams` branch wired to post via Bot Framework

The code is unit-tested with stubbed fetch and runs green in CI. **It cannot connect a real customer until Kyle completes the operator-side Microsoft Entra app + Azure Bot Service setup below.**

## Env probe result (at branch HEAD)

`grep -iE "TEAMS|MS_GRAPH|MICROSOFT" .env.production.local .env.local` returned **no results**. None of the following env vars are set:

- `TEAMS_APP_ID`
- `TEAMS_TENANT_ID`
- `TEAMS_CLIENT_SECRET`
- `TEAMS_BOT_ID`
- `TEAMS_BOT_PASSWORD`

Tests stub these via `process.env.TEAMS_APP_ID = 'test-app-id'` so the build is green; production traffic to `/api/connectors/teams/callback` returns a clear "missing env" 500 until the values land in Vercel.

## Required steps (≈90 min first time, per SPEC § 2.3)

Per **SPEC § 2.2** verbatim:

### Step A — Register the Pathfinder app in Microsoft Entra
1. Visit https://entra.microsoft.com → Identity → App registrations → New registration
2. Name: `Pathfinder for Microsoft Teams`
3. Supported account types: "Accounts in any organizational directory (multitenant)"
4. Redirect URI (Web): `https://www.unicron.systems/pathfinder/api/connectors/teams/callback`
5. Register → copy Application (client) ID and Directory (tenant) ID
6. Certificates & secrets → New client secret → 24-month expiry → copy the value (visible once)

### Step B — Configure API permissions
Add Microsoft Graph delegated permissions:
- `User.Read`
- `ChannelMessage.Send`
- `Chat.ReadWrite`
- `Team.ReadBasic.All`
- `Channel.ReadBasic.All`

Plus Application permissions:
- `ChannelMessage.Send.Group`
- `Chat.ReadWrite.All`

Grant admin consent for the tenant.

### Step C — Register an Azure Bot
1. https://portal.azure.com → Create resource → Azure Bot
2. Bot handle: `pathfinder-bot`
3. F0 (free) tier
4. Microsoft App ID: "Use existing app registration" → paste client ID from Step A
5. Configuration → Messaging endpoint: `https://www.unicron.systems/pathfinder/api/connectors/teams/webhook`

### Step D — Add Teams channel to the Bot
Channels → Microsoft Teams → click → accept terms.

### Step E — Build the Teams app manifest
Use https://dev.teams.microsoft.com to package the bot into a `.zip` for Zedcor IT to sideload. Bot scopes: Personal, Team, Group Chat. Commands: `/leads`, `/brief`, `/status`, `/help`. Valid domain: `www.unicron.systems`.

### Step F — Set Vercel env vars
In Vercel → pathfinder project → Settings → Environment Variables (mark `TEAMS_CLIENT_SECRET` and `TEAMS_BOT_PASSWORD` as Sensitive):

| Name | Value |
|------|-------|
| `TEAMS_APP_ID` | client ID from Step A |
| `TEAMS_TENANT_ID` | tenant ID from Step A (use `common` for multi-tenant) |
| `TEAMS_CLIENT_SECRET` | secret value from Step A |
| `TEAMS_BOT_ID` | bot ID from Step C |
| `TEAMS_BOT_PASSWORD` | same as `TEAMS_CLIENT_SECRET` |

Redeploy after saving.

### Step G — Sideload to test tenant
Hand the manifest `.zip` to Zedcor IT for sideload via Teams Admin Center.

## Verification once env is set

After deploy:
1. Visit `/pathfinder/settings/connectors` → Teams tile shows "Connect"
2. Click Connect → redirects to `https://login.microsoftonline.com/...` with the proper scopes
3. Authorize → callback lands on `/api/connectors/teams/callback?code=...&state=...`
4. Token persists encrypted in `pathfinder.connector_tokens`; tile flips to "Connected"
5. Bot DMs the user the welcome card
6. `dispatchEvent` to that org with a `lead.high_score` event posts an Adaptive Card

Until Step F is done, customer-facing flow returns a clear error and the operator-side gap remains the only blocker.
