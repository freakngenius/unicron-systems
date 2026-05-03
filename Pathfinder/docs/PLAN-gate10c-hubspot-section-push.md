# PLAN — Gate 10C — HubSpot lead-detail section + push endpoint

Branch: `demo-polish-ux/gate10c-hubspot-section-push`
Base: `origin/main` `db220cc` (post-10B + 9D)
Spec: `Company Docs/Specs/SPEC - HubSpot Bridge.md` §Lead detail + §API endpoints

## Goal

User clicks "Push to HubSpot" on a lead → Pathfinder creates a deal + company + contacts in HubSpot using the operator's per-user OAuth connection from Gate 10B. Status visible after push (deal stage, owner, last activity, "Open in HubSpot" link). Empty states for no-connection / connected-no-deal / pushed.

## File scope

**New:**
- `Pathfinder/supabase/migrations/0116_lead_hubspot_deals.sql` — `lead_hubspot_deals` + `lead_hubspot_contacts` tables (additive, idempotent)
- `Pathfinder/lib/hubspot/field-mapper.ts` — pure project → HubSpot deal property map per spec table; reuses `lib/hubspot/deal-mapper.ts` primitives
- `Pathfinder/lib/hubspot/user-client.ts` — REST wrapper that takes a decrypted user-connection access token (distinct from existing `lib/hubspot/client.ts` which the cron uses)
- `Pathfinder/lib/hubspot/lead-deal.ts` — server-side orchestration: create deal → create/find company → upsert contacts → write `lead_hubspot_deals` row. Idempotent on `(project_id, user_id, portal_id)` unique.
- `Pathfinder/app/api/leads/[projectId]/hubspot/push/route.ts` — POST; user-auth gate; calls `pushLeadDeal()`
- `Pathfinder/app/api/leads/[projectId]/hubspot/status/route.ts` — GET; user-auth; reads `lead_hubspot_deals` row for `(project_id, current operator)`
- `Pathfinder/components/lead/HubspotSection.tsx` — section with three empty-state branches + connected-pushed card
- `Pathfinder/components/lead/HubspotPushModal.tsx` — "What gets pushed?" expandable + Push CTA
- `Pathfinder/tests/connectors/hubspot-field-mapper.test.ts` — pure tests on the mapper
- `Pathfinder/tests/connectors/hubspot-lead-deal.test.ts` — orchestration tests with stubbed user-client

**Modified:**
- `Pathfinder/components/lead/LeadDetail.tsx` — slot `<HubspotSection>` between §5 (Contacts) and §6 (Relationship Context). Read user-connection state via existing `/api/connectors/hubspot/status`.

**Out of scope (10D + 10E):**
- Refresh button live wiring (10D)
- Add Note button — render stub gated by `NOTE_BUTTON_ENABLED` (default false). Engagement scopes blocked by Kyle's sandbox tier.
- Push-update endpoint (10D)
- Webhook → lead_hubspot_deals updates (10E)
- Token refresh cron (10E)

## Migration 0116

```sql
create table if not exists pathfinder.lead_hubspot_deals (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references pathfinder.projects(id) on delete cascade,
  user_id text not null,
  portal_id text not null,
  hubspot_deal_id text not null,
  hubspot_deal_url text,
  hubspot_company_id text,
  pushed_at timestamptz not null default now(),
  last_synced_at timestamptz,
  current_stage text,
  current_stage_label text,
  current_amount numeric,
  current_owner_id text,
  current_owner_name text,
  last_activity_at timestamptz,
  last_activity_type text,
  status text not null default 'active'
    check (status in ('active','archived','lost','won','error')),
  error_message text,
  unique (project_id, user_id, portal_id)
);

create index if not exists lead_hubspot_deals_project_id_idx on pathfinder.lead_hubspot_deals(project_id);
create index if not exists lead_hubspot_deals_user_id_idx on pathfinder.lead_hubspot_deals(user_id);

create table if not exists pathfinder.lead_hubspot_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_contact_id uuid not null references pathfinder.lead_contacts(id) on delete cascade,
  user_id text not null,
  portal_id text not null,
  hubspot_contact_id text not null,
  hubspot_contact_url text,
  pushed_at timestamptz not null default now(),
  unique (lead_contact_id, user_id, portal_id)
);

-- RLS: service-role only (writes happen through the push endpoint)
alter table pathfinder.lead_hubspot_deals enable row level security;
alter table pathfinder.lead_hubspot_contacts enable row level security;
revoke all on pathfinder.lead_hubspot_deals from public, anon, authenticated;
revoke all on pathfinder.lead_hubspot_contacts from public, anon, authenticated;
grant select, insert, update, delete on pathfinder.lead_hubspot_deals to service_role;
grant select, insert, update, delete on pathfinder.lead_hubspot_contacts to service_role;
```

Note: `project_id text` matches `pathfinder.projects.id` (sam.gov:..., usaspending:..., etc.) — same divergence-from-spec as migration 0112.

## Field mapping (per spec § Field mapping)

| Pathfinder | HubSpot deal property |
|---|---|
| project.title | dealname |
| project.project_value | amount (only when finite) |
| project.estimated_end_date \|\| posted_date+90d \|\| now+90d | closedate (ms-since-epoch) |
| project.summary \|\| project.rationale | description |
| project.naics_description | hs_industry (best-effort; HubSpot default fields support this) |
| project.project_stage normalized via stage map | dealstage (env-resolved ID) |
| project.source + project.source_id | hs_lead_source + custom property `pathfinder_source_id` |
| project.score | custom property `pathfinder_score` |
| nearest_branch.name | custom property `pathfinder_branch` |
| project.id | custom property `pathfinder_lead_id` (idempotency anchor) |

Stage map default (in `lib/hubspot/stage-map.ts`, additive normalizeProjectStage helper):
- "Announcement" / "Announced" / null → "appointmentscheduled"
- "Pre-bid" → "qualifiedtobuy"
- "RFP open" / "Bidding" → "presentationscheduled"
- "Awarded" → "decisionmakerboughtin"

Custom-property bootstrapping is best-effort (HubSpot's `ensureCustomProperty`). 4xx errors on custom-property creation get logged but don't fail the push — the deal still creates with the standard fields.

## Push orchestration (`pushLeadDeal`)

1. Resolve current user (operator email) from request.
2. Look up user's active HubSpot connection (from Gate 10B helper). 401 if none.
3. Check existing `lead_hubspot_deals` row for `(project_id, user_id, portal_id)`. If exists, short-circuit and return its hubspot_deal_id (idempotent).
4. Decrypt access token, build `userClient`.
5. Map fields → call `userClient.createDeal()`.
6. Create or find company by NAICS-derived name (best effort; on failure, deal still associates without company).
7. For each `lead_contacts` row: upsert via `userClient.findOrCreateContact()`, associate with deal, write `lead_hubspot_contacts` row.
8. Append a single source-record note to the deal (description-style block — cross-poll match note ships when matches exist; gracefully omitted when no matches).
9. Insert `lead_hubspot_deals` row with `pushed_at = now()`, `current_stage = mapped`, `hubspot_deal_url = portal-resolved URL`.
10. Return result.

## API routes

- `POST /api/leads/[projectId]/hubspot/push` — body `{}` (no params). Resolves current user. Returns `{ ok, hubspot_deal_id, hubspot_deal_url, idempotent: bool }`.
- `GET /api/leads/[projectId]/hubspot/status` — Returns `{ state: 'no-connection' | 'connected-no-deal' | 'pushed', deal?: {...} }`. State is per-user.

Both gated via `getCurrentUserId` (basic-auth + operator email). 403 on missing operator.

## UI: `HubspotSection`

Renders three states:
- **no-connection** → "Connect HubSpot to push this lead and track the deal." + Connect link → `/pathfinder/settings/connectors`
- **connected-no-deal** → "This lead is not yet in HubSpot." + Push button + "What gets pushed?" expandable → opens `HubspotPushModal`
- **pushed** → card with: deal stage chip, amount, owner name (if known), last activity (if known), last sync timestamp, Refresh button (10D — disabled label "Refresh status (live in 10D)" until 10D ships), Add Note button (gated by `NOTE_BUTTON_ENABLED`; default stub), Push update button (10D — disabled), Open in HubSpot link

Self-hydrates client-side via `/api/leads/[id]/hubspot/status`. On Push success, optimistically flip state to "pushed" and show the new deal_id.

Slot in `LeadDetail.tsx` between §5 and §6 (per Gate 9 v2 ordering).

## NOTE_BUTTON_ENABLED env flag

Per Kyle's pre-direction for 10D: render "Notes coming soon" tooltip stub when env unset/false. When Kyle upgrades sandbox tier and engagement scopes are granted, flip to `NOTE_BUTTON_ENABLED=1` in Vercel.

`process.env.NOTE_BUTTON_ENABLED === '1'` gate; default false.

## Verification plan

- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 warnings
- `pnpm test` → ≥ 1181 (current 10B baseline; +new tests this gate)
- Migration 0116 applied to Supabase: idempotent re-run
- Manual sandbox push (after Kyle's 10B verification + this gate's merge): TxDOT flagship → deal in HubSpot with mapped fields

## Halt before

Live HubSpot smoke test. Per Kyle's directive: stop short of running smoke tests against live sandbox; halt for Kyle's sandbox-CONNECTED report before final verification.

## Hard halts

- `lib/hubspot/client.ts` is reserved for the cron flow — do not touch its internals; the new `user-client.ts` is the per-user equivalent.
- Push idempotency must be DB-enforced via the `(project_id, user_id, portal_id)` unique key. Test exercises double-push.
- Multi-tenant: every read/write on `lead_hubspot_deals` filters on `user_id` so user A never sees user B's deal row even for the same project.
- Existing tests must not regress.

## PR plan

Single PR, auto-merge on green. PR body covers field-map table, push orchestration sequence, NOTE_BUTTON_ENABLED gate, and the Kyle-action-items: migration 0116 apply + sandbox smoke after Kyle's 10B sandbox verify.
