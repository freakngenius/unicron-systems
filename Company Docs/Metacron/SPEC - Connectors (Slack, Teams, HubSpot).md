# SPEC — Connectors (Slack, Teams, HubSpot)

Status: Draft v0.1 (rewritten 2026-05-02 after data loss; Connector Sprint Phase 0-3 already implemented)
Owner: Kyle (Kēkā)
Related: `PRD - Pathfinder Form-Fit for Zedcor.md`, `SPEC - Cross-Pollination Engine.md`

---

## 1. Why this exists

Zedcor uses Microsoft Teams for chat, HubSpot for CRM, NetSuite for financials, Microsoft ecosystem for everything else. Pathfinder needs a connector framework so customers wire their existing tools without leaving Pathfinder. Three first-class integrations: Slack, Teams, HubSpot. NetSuite is post-pilot.

This spec covers:
- Customer-side setup (what Zedcor IT does, step by step for Teams)
- Pathfinder-side architecture (schema, OAuth, UI)
- Per-connector feature parity (Slack and Teams behave identically)
- HubSpot bi-directional sync model
- Multi-tenant isolation + security
- Productization sequence

## 2. Microsoft Teams setup — what Kyle does once per customer

Operator path. After this, Pathfinder's connector flow handles per-user OAuth.

### 2.1 Prerequisites

- Microsoft 365 tenant
- Tenant admin access
- Azure subscription (free tier)
- Pathfinder admin account

### 2.2 Steps

**Step A: Microsoft Entra app registration**

1. https://entra.microsoft.com → Identity → App registrations → New registration
2. Name: `Pathfinder for Microsoft Teams`
3. Account types: Multi-tenant
4. Redirect URI: Web → `https://www.unicron.systems/pathfinder/api/connectors/teams/callback`
5. Register, copy Application (client) ID + Directory (tenant) ID
6. Certificates & secrets → New client secret → 24-month → copy value

**Step B: API permissions**

Delegated:
- User.Read, ChannelMessage.Send, Chat.ReadWrite, Team.ReadBasic.All, Channel.ReadBasic.All

Application:
- ChannelMessage.Send.Group, Chat.ReadWrite.All

Grant admin consent.

**Step C: Azure Bot Service** (skip if outbound-only)

1. portal.azure.com → Create resource → Azure Bot
2. Bot handle: `pathfinder-bot`
3. Pricing: F0 free
4. App ID: existing → paste client ID from Step A
5. After provisioning: Configuration → Messaging endpoint → `https://www.unicron.systems/pathfinder/api/connectors/teams/messages`

**Step D: Add Teams channel** in Azure Bot resource → Channels → Microsoft Teams.

**Step E: Build Teams app manifest** at https://dev.teams.microsoft.com (Pathfinder generates this per-tenant via `/api/connectors/teams/manifest` endpoint, but for first install do manually).

**Step F: Set Vercel env vars**

- TEAMS_APP_ID
- TEAMS_TENANT_ID
- TEAMS_CLIENT_SECRET
- TEAMS_BOT_ID
- TEAMS_BOT_PASSWORD (same as TEAMS_CLIENT_SECRET)

**Step G: Sideload `.zip` to Teams** via Teams Admin Center → Manage apps → Upload custom app.

### 2.3 Slack setup

Standard Slack app create at api.slack.com. Required scopes: `chat:write`, `channels:read`, `im:write`, `app_mentions:read`, `commands`. Set Vercel env vars: SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_SIGNING_SECRET. Pathfinder's `/api/connectors/slack/manifest` endpoint generates per-customer install URLs.

### 2.4 HubSpot setup

HubSpot OAuth 2.0 app. Required scopes: `crm.objects.deals.read/write`, `crm.objects.contacts.read/write`, `crm.schemas.deals.read`. Set Vercel env vars: HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET.

## 3. Pathfinder connector architecture

### 3.1 Schema (already shipped per Connector Sprint migrations 0105-0108)

```sql
create table pathfinder.connectors (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  type text not null check (type in ('slack', 'teams', 'hubspot', 'gmail', 'outlook')),
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'expired', 'revoked')),
  user_id uuid references auth.users(id),
  external_account_id text,
  external_account_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[],
  config jsonb default '{}'::jsonb,
  last_used_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, type, external_account_id)
);

create table pathfinder.connector_routing_rules (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid references pathfinder.connectors(id) on delete cascade,
  event_type text not null check (event_type in (
    'lead.high_score', 'lead.verified', 'lead.warm_intro',
    'brief.daily', 'brief.weekly',
    'cost.alert',
    'agent.failure',
    'pipeline.stage_changed'
  )),
  channel_id text,
  channel_name text,
  enabled boolean default true,
  filter jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table pathfinder.connector_audit_log (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid references pathfinder.connectors(id),
  event_type text not null,
  direction text check (direction in ('outbound', 'inbound')),
  payload jsonb,
  status text check (status in ('sent', 'delivered', 'failed', 'received', 'processed')),
  external_id text,
  error_message text,
  created_at timestamptz not null default now()
);

-- HubSpot-specific (migration 0108)
create table pathfinder.hubspot_deals_raw (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references pathfinder.connectors(id),
  hs_object_id text not null,
  payload jsonb not null,
  synced_at timestamptz not null default now(),
  unique (connector_id, hs_object_id)
);
-- + hubspot_contacts_raw, hubspot_engagements_raw with same shape
```

### 3.2 OAuth flow (generic pattern)

1. User clicks "Connect" tile → `/api/connectors/{type}/auth?org_id={org}`
2. Backend generates signed state token → redirects to connector's authorization URL
3. Connector redirects back to `/api/connectors/{type}/callback?code=...&state=...`
4. Backend validates state, exchanges code for tokens, encrypts, writes `pathfinder.connectors` row
5. Frontend redirects to Settings showing connected tile

### 3.3 Settings UI (connector tiles)

Route `/pathfinder/settings/connectors` shows tile grid: Slack, Teams, HubSpot. Each tile has state-aware UX (Disconnected / Pending / Connected / Error / Expired / Revoked). Configure modal per tile with routing rules editor.

### 3.4 Outbound dispatcher

Single `dispatchEvent(orgId, eventType, payload)` API. Every event-emitting agent calls it. Dispatcher reads routing rules, formats per-connector (Slack Block Kit / Teams Adaptive Cards), sends, audits.

### 3.5 Inbound webhook handler

Per-connector webhook endpoints normalize to common `InboundEvent` shape, route to chat agent or sync engine.

### 3.6 Token refresh

Background cron sweeps tokens expiring within 24h, refreshes via connector's refresh-token API. On 401, mark `status='expired'`.

## 4. Per-connector specs

### 4.1 Slack — feature parity baseline

**Outbound:**
- Real-time alerts on `lead.high_score`, `lead.verified`, `lead.warm_intro`
- Daily/Friday briefs
- Cost alert
- Agent failure alert
- Pipeline stage change notifications (per-rep DM)

**Inbound:**
- Slash commands: `/pathfinder leads`, `/pathfinder brief`, `/pathfinder status`, `/pathfinder help`
- DM bot for Q&A
- @mention bot in any channel
- Reaction-based feedback (👍/👎 captures rep feedback)

### 4.2 Microsoft Teams — feature parity with Slack

Identical functionality, different SDK. Adaptive Cards instead of Block Kit. `@mention` instead of slash commands. Adaptive Card action buttons trigger feedback events.

### 4.3 HubSpot — bidirectional sync

**Entities:**
1. Pathfinder leads → HubSpot deals (outbound)
2. Pathfinder contacts → HubSpot contacts (outbound)
3. HubSpot deal stage updates → Pathfinder pipeline (inbound)
4. HubSpot contact updates → Pathfinder enrichment refresh (inbound)
5. HubSpot activities → Pathfinder activity timeline (inbound)
6. Pathfinder outreach sent → HubSpot engagement (outbound)

**Field mapping** (operator-configurable):

| Pathfinder field | HubSpot deal field | Direction |
|------------------|--------------------|-----------|
| project.title | dealname | both |
| project.value | amount | both |
| project.stage | dealstage (mapped) | both |
| project.posted_date | createdate | outbound |
| project.score | custom prop `pathfinder_score` | outbound |
| project.cross_pollination_match | custom prop `pathfinder_warm_intro` | outbound |
| outreach.sent_at | hs_lastmodifieddate | outbound |
| deal.owner_email | hubspot_owner_id (mapped) | both |

**Stage mapping** (per-customer, side-by-side picker):

```
Pathfinder NEW       → HubSpot "appointmentscheduled"
Pathfinder CONTACTED → HubSpot "qualifiedtobuy"
Pathfinder MEETING   → HubSpot "presentationscheduled"
Pathfinder PROPOSAL  → HubSpot "decisionmakerboughtin"
Pathfinder WON       → HubSpot "closedwon"
Pathfinder LOST      → HubSpot "closedlost"
```

**Conflict resolution policies** (per-field):
1. Pathfinder wins (default for project.value, score)
2. HubSpot wins (default for owner_email, notes)
3. Last write wins (default for everything else)
4. Manual review (queues for operator)

**Sync triggers:**
- Outbound: when Pathfinder agent writes a deal-mapped field, immediately push (async, fail-open).
- Inbound real-time: HubSpot webhooks subscribed for deal/contact/engagement updates → `/api/connectors/hubspot/webhook`.
- Inbound reconciliation: nightly cron pulls last-modified-since-yesterday for sanity check.

**Initial bulk sync:**
1. Preview: "We will sync 1,247 deals. Estimated time: 5 minutes. Cost: $0.20."
2. Customer confirms.
3. Background job paginates, matches by name/value/created_date, flags duplicates.
4. Notification on completion.

## 5. Multi-tenant isolation + security

- Per-org isolation via `org_id` on every connector row + dispatch call
- Tokens encrypted at rest via Supabase Vault (or envelope encryption)
- OAuth state validation (signed, time-bounded, anti-CSRF)
- Webhook signature verification per connector
- Permission scoping: minimum scopes documented in connector tile
- Disconnect revokes token at connector API + local audit log

## 6. Build sequence

**Phase 1 — Foundation + Slack OAuth (SHIPPED in Connector Sprint)**
- Schema (migrations 0105-0107)
- Generic OAuth flow + token storage
- Slack OAuth, slash commands, mention/DM, Block Kit, reaction feedback
- Settings UI tiles + routing rules editor

**Phase 2 — Teams parity (SHIPPED in Connector Sprint, pending operator setup)**
- Teams OAuth + Bot Framework
- Adaptive Card formatter
- @mention command parsing
- Per-customer manifest generation

**Phase 3 — HubSpot bidirectional (Phase 3A FOUNDATION shipped in Connector Sprint)**
- Phase 3A: OAuth + bulk sync foundation (migration 0108)
- Phase 3B: Webhook subscriptions + outbound push (DEFERRED)
- Phase 3C: Field/stage mapping + conflict resolution UI (DEFERRED)
- Phase 3D: Nightly reconciliation cron (DEFERRED)

**Phase 4 — Productization polish**
- C-4A: Customer onboarding wizard (SHIPPED)
- C-4B: Operator connector health dashboard (DEFERRED to Metacron chat)
- C-4C: Audit log surfacing (DEFERRED)

**Phase 5 — Stretch (post-pilot)**
- NetSuite, Outlook calendar, Salesforce, Zapier

## 7. Productization notes

- Connectors are core, not premium. All tiers include them. Differentiation is sync volume + custom field mapping + advanced routing.
- Onboarding wizard (`/pathfinder/onboarding/connectors`) walks new customers through Slack/Teams/HubSpot connect.
- Status pill on dashboard shows connector health.

## 8. Open questions

- Slack vs Teams reaction-feedback parity (defer to Phase 4 polish)
- HubSpot custom property naming prefix (configurable to handle governance rules)
- Bulk-sync performance for 10k+ deals (may need Inngest worker if Vercel function limit hits)
- Cross-org HubSpot deduplication (default: no, operator-configurable)
- Teams Bot Framework cost at scale (free tier 10k msgs/month/region)
- NetSuite priority (post-pilot per PRD)

## 9. Acceptance criteria for Tuesday demo

For the demo:
- Settings page renders three connector tiles: Slack, Teams, HubSpot, in correct states
- Slack tile shows Connected (existing webhook + new OAuth path both work)
- Teams + HubSpot tiles show Connect buttons that launch OAuth (or "Coming soon" placeholder if env vars not set)

This makes connectors visible as a first-class surface during the demo without requiring full Teams/HubSpot wiring beforehand.
