# PLAN — Demo Polish UX Gate 13W-A: brief schema + composer

**Branch:** `demo-polish-ux/gate13w-brief-schema`
**Base:** `origin/main` `19535b3` (post `feat(metacron): wave2-D — operator audit log surface (#128)`)
**Worktree:** `Pathfinder-worktrees/gate13w-brief-schema/`

## Goal (Gate 13W-A)

Schema + composition layer for the daily intelligence loop. Lands the
per-user preferences table and a pure brief composer that, given a
`user_id` and a "now", returns a deterministic markdown brief with five
sections. No cron, no send, no UI in this gate — those land in 13W-B/C.

## Out of scope this gate

- Inngest cron — Gate 13W-B
- Email send via user's connected provider — Gate 13W-B
- `/pathfinder/settings/briefing` page + manual dispatch — Gate 13W-C
- Production verification (kyle@freakngenius.com) — Gate 13W-D

## Schema decisions

### Migration `0122_briefing_prefs.sql`

Migration number leaves room for in-flight 0118 (sources ban) … 0121.

Columns per the gate prompt:

```sql
create table if not exists pathfinder.briefing_prefs (
  user_id     text primary key,
  frequency   text not null default 'daily'
              check (frequency in ('daily', 'weekly', 'paused')),
  send_hour   int  not null default 7
              check (send_hour between 0 and 23),
  timezone    text not null default 'America/Los_Angeles',
  sections    jsonb not null default
              '{"new_leads":true,"follow_ups":true,
                "stage_changes":true,"replies":true,
                "contacts_pending":true}'::jsonb,
  paused      bool not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

Notes:

- `user_id` is `text` to mirror the existing actor identity scheme used by
  `outreach_sends.user_id` and `user_connections.user_id` (operator email,
  not uuid; see `0113_user_connections.sql:19-23`).
- `paused` is a flag in addition to `frequency='paused'` so an operator can
  resume to their prior frequency without losing the value. The cron in
  13W-B treats `paused = true OR frequency = 'paused'` as a skip.
- `sections` is a typed jsonb default rather than five bool columns so
  13W-C can grow new sections without a schema migration.
- Primary key on `user_id` (single row per user) — upserts in
  `getOrCreateBriefingPrefs(user_id)` from 13W-C.
- `updated_at` is touched by a trigger mirroring the `deals` table
  (`0050_deals.sql:90-103`).

**Backfill / default for existing users.** The prompt asks for a "daily,
7am local, all sections" default for existing users. We do NOT eagerly
insert one row per known operator at migration time — that requires
discovering the operator set, which lives across `email_integrations`,
`user_connections`, and basic-auth env. Instead, the composer's
`getPrefs(user_id)` returns the table default if no row exists. When
13W-C ships, the settings page upserts on first save. This matches
how `connectors.metadata.hubspot_mapping` is treated: jsonb default at
read time, row written on first user touch.

Hard-halt protection: additive, idempotent (`create table if not exists`,
no destructive ALTER, RLS pattern matches `0114_outreach_sends.sql`).

### `outreach_sends.type` column

The prompt says 13W-B "Logs to outreach_sends with type='briefing'". The
existing table has no `type` column (`0114_outreach_sends.sql:13-26`).
We add it in this gate so 13W-A's tests can assert on the schema and
13W-B can write to it without a second migration:

```sql
alter table pathfinder.outreach_sends
  add column if not exists type text not null default 'outreach'
  check (type in ('outreach', 'briefing'));

create index if not exists outreach_sends_type_sent_at_idx
  on pathfinder.outreach_sends(type, sent_at desc);
```

Default `'outreach'` so existing rows keep their semantics.

Briefing rows can have `project_id = null` since a brief covers many
projects. The existing column is `not null`. To avoid breaking the
outreach send path, we relax it to nullable and add a CHECK that
enforces `project_id IS NOT NULL` when `type = 'outreach'`:

```sql
alter table pathfinder.outreach_sends
  alter column project_id drop not null;

alter table pathfinder.outreach_sends
  add constraint outreach_sends_project_id_required_for_outreach
  check (type = 'briefing' or project_id is not null);
```

The existing FK `references pathfinder.projects(id) on delete cascade`
already permits null; only the `not null` is dropped. Cascade still
applies for non-null briefing rows (none expected, but harmless).

## Composer (`services/briefer/agent.ts`)

Pure function:

```ts
composeDailyBrief({
  userId: string,
  now: Date,
  prefs?: BriefingPrefs,    // omit ⇒ uses default
  db?: SupabaseClient,      // omit ⇒ supabaseAdmin
  llm?: 'template' | 'sonnet',  // omit ⇒ 'template'
}): Promise<{
  subject: string,
  markdown: string,
  html: string,
  metrics: {
    new_leads_count: number,
    follow_ups_count: number,
    stage_changes_count: number,
    replies_count: number,
    contacts_pending_count: number,
    llm_cost_usd: number,
  },
  sections_rendered: string[],   // which sections actually had content
}>
```

### Section sources (last 24 h, ending at `now`)

| Section            | Source                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Top 5 new leads    | `pathfinder.projects` ordered by `score desc`, filtered by `posted_date >= now - 24h`. Top 5. Title + score + owner + value + lead-detail link. |
| Follow-ups due     | `outreach_sends` where `user_id = $1`, `type = 'outreach'`, `reply_received_at IS NULL`, `sent_at < now - 3d`. Project link.            |
| Deal stage changes | `deal_activities` where `activity_type = 'stage_change'` and `created_at >= now - 24h`, joined to deals where `owner_email = $1`. From → to. |
| Replies received   | `outreach_sends` where `user_id = $1` and `reply_received_at >= now - 24h`. Project link + recipient.                                  |
| Contacts pending   | `lead_contacts` where (per-user filter mirrors lead-detail page's "pending review" semantics). For v1: `status = 'pending'` joined to projects where the operator is the lead owner. If `lead_contacts.status` is absent, gracefully render 0. |

Each section renders its own `## Heading` + bullet list. Sections with
zero rows render `_No <section> in the last 24 hours._` so the brief
shape is stable and the operator can detect a quiet day vs. a broken
query.

### LLM mode (`'sonnet'`)

For 13W-A we ship `'template'` only and the `'sonnet'` branch returns
the template output unchanged with a TODO comment. Reason: the gate
prompt says "optional; can be template-only for v1". We keep the
parameter shape so 13W-C can flip operators in.

### Subject line

`"Pathfinder daily brief — {date} — {N} new leads, {M} follow-ups due"`

Where N and M come from the metrics object. If both are 0:
`"Pathfinder daily brief — {date} — quiet day"`.

### Links

Each lead/project link points at `${BASE_URL}/leads/${projectId}`. We
read `BASE_URL` from `process.env.NEXT_PUBLIC_APP_URL` with fallback
`'https://pathfinder.unicron.systems'` (matches the convention in
`lib/email/outreach-send.ts` callers).

## Files this gate

```
supabase/migrations/0122_briefing_prefs.sql                 (new)
lib/types.ts                                                (extend with BriefingPrefs, DailyBrief)
services/briefer/agent.ts                                   (new)
services/briefer/sections.ts                                (new — per-section query + render)
services/briefer/render.ts                                  (new — markdown + html)
services/briefer/index.ts                                   (new — barrel)
tests/briefer-sections.test.ts                              (new — query + render per section)
tests/briefer-agent.test.ts                                 (new — composeDailyBrief end-to-end)
docs/PLAN-demo-polish-ux-gate13w-brief-schema.md            (this file)
```

## Verification before PR

```
$ pnpm typecheck    → 0 errors
$ pnpm lint         → no warnings or errors
$ pnpm test         → ≥ baseline (currently 1043 passed | 24 skipped at 7B)
                       net +N new tests for briefer (~25 expected)
```

## Hard-halt items to keep clear

Per `MEMORY/demo-polish-ux-sprint-live-status.md` rolling list and the
gate prompt's "Quality gate — verify content before any cron runs to
avoid sending malformed briefs":

- ✅ Schema additive only — no destructive ALTER. The `not null` drop on
  `project_id` is paired with a CHECK constraint that preserves the
  existing semantic (outreach rows still require `project_id`).
- ✅ No auth boundary changes.
- ✅ No HubSpot scope expansion.
- ✅ Houston flagship lead detail untouched.
- ✅ Cross-pollination row count unchanged.
- ✅ `agent_runs` writes untouched.
- ✅ `BRIEFING_CRON_ENABLED` env var defaults off — but that gate is in
  13W-B; 13W-A just lays the schema and pure composer with no cron
  registration.
- ✅ No real email sends from this gate. The composer returns markdown +
  html; nothing in 13W-A reaches an email provider.

## Commit chain plan (13W-A)

```
1. docs+schema: gate 13W-A foundation — PLAN, migration 0122, types
2. feat(briefer): gate 13W-A — section query + render helpers
3. feat(briefer): gate 13W-A — composeDailyBrief end-to-end + tests
```

Auto-merge per gate, then base 13W-B on the merged 13W-A commit.
