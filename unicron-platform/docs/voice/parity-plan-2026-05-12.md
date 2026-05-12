# Voice Surface Parity Plan — 2026-05-12

Sprint 5 Stream A — Voice Surface Parity Catch-up.
Branch: `voice-surface-parity-v1`.
Worktree: `Phase2-worktrees/voice-surface-parity-v1/`.
Atrium origin/main HEAD: `0ba59bf` (`chore: redeploy unicron-platform + pathfinder to pick up rotated NOTION_TOKEN`).
Prototype HEAD: `d0e84ef` (`github.com/freakngenius/unicron-voice-prototype@main`).
Author: Claude Code (Stream A executor).

---

## TL;DR

The v2 foundation merge (PR #370) was substantially more thorough than the source prompt assumed. Most of the libs, route handlers, and the production schema changes the prompt asks to port are **already on `origin/main`**. The genuine remaining work narrows to:

1. New lib: `reconcileVapiCosts.ts`.
2. New `getVapiAccount` export on `src/lib/voice/vapi.ts`.
3. Four new API routes (reconcile-costs, account, allowlist PATCH endpoint, cron).
4. `VoiceAccountView.tsx` (new) + `CallingModePanel.tsx` (new) + four-tab nav.
5. Cron entry + `HUBSPOT_PRIVATE_APP_TOKEN` env template.
6. Migration file in `unicron-platform/supabase/migrations/` for reproducibility (DB already has all the columns and indexes; `apply_migration` will be a no-op via `IF NOT EXISTS`).

Two prompt assumptions broke and require Kyle's decision before writes proceed (see §3 "Open questions for Kyle"):

- **Atrium's `VoiceAgentsView` is a minimal list view with no edit affordance.** The prompt's instruction to "replace the simple `allowlist_phones` row with `<CallingModePanel />`" has no host UI to slot into. The 2566-LoC prototype edit page was deferred to Phase 9.5 by the foundation merge.
- **Atrium's `VoiceActivityView` is a minimal card list with no CallDetail panel and no events grid.** The prompt's instruction to "add a Cost row to CallDetail meta" and "add a cost column to the events table" assumes structures that do not exist in Atrium.

Both of these can be unblocked with one decision each (inline-expand, modal, defer to 9.5, or build minimal scaffolding now).

---

## 1. Files to create

| Atrium path | Type | Source (prototype) | Notes |
|---|---|---|---|
| `unicron-platform/supabase/migrations/20260512_voice_costs_and_allowlist_modes.sql` | migration | n/a (prototype has no migrations dir) | Idempotent (IF NOT EXISTS); production DB already has every column + every required index by an equivalent name. See §5. |
| `unicron-platform/src/lib/voice/reconcileVapiCosts.ts` | lib | `src/lib/reconcileVapiCosts.ts` | Swap `supabaseAdmin` import for Atrium pattern; flip `./vapi` to `./vapi.js` ESM extension to match repo style. |
| `unicron-platform/api/voice/reconcile-costs.ts` | API | `src/app/api/vapi/reconcile-costs/route.ts` | Vercel serverless shape; `requireVoiceAccess` gate; POST + GET (GET returns status counts). |
| `unicron-platform/api/voice/account.ts` | API | `src/app/api/vapi/account/route.ts` | Vercel serverless; gated by `requireVoiceAccess` (prototype was public, Atrium standardizes on bearer-JWT). 90-day window aggregate + lifetime + by-agent + by-day + top-calls. |
| `unicron-platform/api/voice/sources/[id]/allowlist.ts` | API | `src/app/api/voice-sources/[id]/allowlist/route.ts` | GET / POST / PATCH. PATCH `mode='open'` requires `confirm_open=true` and stamps `open_mode_confirmed_at` / `_by`. |
| `unicron-platform/api/cron/voice/reconcile-costs.ts` | API (cron) | `src/app/api/cron/reconcile-vapi-costs/route.ts` | GET; auth via `x-vercel-cron` header presence OR `Authorization: Bearer ${CRON_SECRET}` OR `x-cron-secret`. Walks up to 200 rows. |
| `unicron-platform/src/atrium/products/voice/VoiceAccountView.tsx` | UI | `src/app/account/page.tsx` | New fourth sub-sub-tab. KPI tiles, reconcile panel, spend by agent, daily, top calls. All fetches via `voiceFetch`. `<div className="atrium-v3">` root. |
| `unicron-platform/src/atrium/products/voice/components/CallingModePanel.tsx` | UI | extracted from `src/app/agents/page.tsx` (CallingModePanel region, ~727–1247) | 3-card mode switcher, Allowlist phone editor with E.164 + bulk paste, HubSpot filter form, Open mode typed-name confirmation modal. **Host UI question — see §3.** |

## 2. Files to modify in place

| Atrium path | Summary of change | Status vs prompt |
|---|---|---|
| `unicron-platform/src/lib/voice/vapi.ts` | Add `getVapiAccount(apiKey)` export hitting `${VAPI_BASE}/org` (or whatever the prototype's account endpoint resolves to). | New: prototype's vapi.ts has no `getVapiAccount`; the account route reads directly from the transcript table. **Open question §3.** |
| `unicron-platform/src/lib/voice/allowlist.ts` | None. | **Already byte-identical to prototype.** `assertAllowlistedForSource` + legacy `assertAllowlisted` both present. |
| `unicron-platform/src/lib/voice/hubspot.ts` | None. | **Already byte-identical to prototype.** `HubspotFilter`, `phoneInHubspotFilter`, `loadHubspotPhones`, `normalizeForCompare`, 60s cache, plus the SDR-outcome helpers — all present. |
| `unicron-platform/api/voice/webhook/vapi.ts` | None. | **Foundation merge already captures `cost_usd`, `cost_breakdown`, `vapi_org_id`, `started_at` on `end-of-call-report` (lines 237–259).** |
| `unicron-platform/api/voice/dispatch.ts` | None. | **Already calls `assertAllowlistedForSource(parsed.to_phone, source)`. Already formats rejection as `` `[${check.mode}] ${check.reason}` `` (line 103). Already uses service-role client.** |
| `unicron-platform/api/voice/sources.ts` | None. | **Zod schema already includes `allowlist_mode`, `hubspot_filter`, `open_mode_confirmed_by`, `open_mode_confirmed_at` (lines 59–66). `ROUTING_FIELDS` already lists all four (line 135).** |
| `unicron-platform/api/voice/transcripts/[id].ts` | None. | **Already uses service-role via `getPathfinderServiceClient`.** |
| `unicron-platform/api/voice/transcripts/[id]/review.ts` | None. | **Already uses service-role via `getPathfinderServiceClient`.** |
| `unicron-platform/api/voice/activity.ts` | None. | **Already selects `cost_usd` and surfaces it in `meta.cost_usd` (lines 53, 71).** |
| `unicron-platform/src/atrium/products/voice/VoiceTab.tsx` | Add `account` branch: render `<VoiceAccountView />` when `sub === "account"`. | Net-new UI wiring. |
| `unicron-platform/src/atrium/products/voice/components/v3primitives.tsx` | Extend `VoiceSubSection` union to include `"account"`. Add fourth tab `{ id: "account", label: "Account", icon: I.CreditCard }` to the tabs array inside `V3VoiceTabs`. | Net-new wiring. |
| `unicron-platform/src/atrium/products/voice/components/icons.tsx` | None. | **`CreditCard`, `Dollar`, `Shield`, `Lock`, `Unlock` icons all already present (lines 85–100).** Atrium has a deliberate "no lucide-react in icons.tsx" convention even though `lucide-react ^1.14.0` is in `package.json`; we honor that. |
| `unicron-platform/src/atrium/products/voice/VoiceAgentsView.tsx` | **Decision needed.** Today it is a flat read-only list with no allowlist row to replace. See §3.A. | Divergent from prompt. |
| `unicron-platform/src/atrium/products/voice/VoiceActivityView.tsx` | **Decision needed.** Today it is a one-line event card list with no CallDetail panel and no events grid. See §3.B. | Divergent from prompt. |
| `unicron-platform/vercel.json` | Add a `crons` array containing `{ "path": "/api/cron/voice/reconcile-costs", "schedule": "0 3 * * *" }`. | The file currently has NO `crons` array at all (just framework / build / install / output / rewrites). |
| `unicron-platform/.env.example` *(or equivalent)* | Add `HUBSPOT_PRIVATE_APP_TOKEN=`. Confirm `CRON_SECRET`, `VAPI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. | Worktree has `unicron-platform/docs/voice/ENV-VARS-REQUIRED.md` as the canonical Atrium env reference; will update that instead of an `.env.example` if no such file exists. |

## 3. Atrium-side divergences requiring human review

### 3.A — `VoiceAgentsView` has no host UI for `CallingModePanel`

Atrium's `VoiceAgentsView.tsx` is a placeholder list view (lines 1–7 self-document this; the full edit UI is deferred to Phase 9.5). It renders one card per agent with name/type/status pill — no allowlist row, no expand, no edit affordance.

The prompt's instruction "Replace the simple `allowlist_phones` row with `<CallingModePanel source={source} onUpdate={...} />`" has nothing to replace.

Options:
1. **Inline-expand**. Each row gets a chevron; click to expand into a panel beneath the row that mounts `CallingModePanel`. Smallest scaffolding, fits the list pattern.
2. **Modal**. A "Calling mode" button on each row opens `CallingModePanel` in a Headless modal. More familiar, more DOM.
3. **Defer to Phase 9.5**. Build `CallingModePanel.tsx` as a standalone component, do not wire it into `VoiceAgentsView` this sprint. Ships the rest of parity without blocking on UI scaffolding.
4. **Separate "Calling mode" sub-sub-tab**. Mount it as its own tab inside the Voice nav; per-agent picker at the top.

Recommendation: **Option 1 (inline-expand)**. It matches the existing v3 list aesthetic, keeps the panel discoverable, and avoids a modal layer Atrium does not have yet.

### 3.B — `VoiceActivityView` has no CallDetail meta and no events grid

The prompt asks for a `$X.XXX` Cost row inside CallDetail meta and a cost column on the events table grid. Atrium's view has neither: there is no CallDetail panel, and the events are rendered as a vertical stack of cards (each card is a 3-column grid for status pill / title+subtitle / relative time).

Options:
1. **Add a cost cell to each card**. Surface cost on the card itself when `meta.cost_usd` is present; format as `$X.XXX`; leave CallDetail to Phase 9.5.
2. **Add the minimal CallDetail panel now** alongside the cost cell, just enough to surface `cost_usd` + `cost_breakdown` + `duration_seconds` + `summary`. This is a small but real scope add.
3. **Defer entirely** until Phase 9.5 builds the full activity timeline.

Recommendation: **Option 1**. It's a single inline cell on each card and matches the rest of the parity work's tone (additive, no new panels).

### 3.C — `vapi.ts` has no `getVapiAccount`

The prototype's `/api/vapi/account` route does NOT call a `getVapiAccount` helper; it queries `voice_call_transcripts` directly and infers `vapi_org_id` from the most recent row. The prompt says "add `getVapiAccount` if needed" — and it is not needed. Recommend: skip adding `getVapiAccount`. The Account route reads transcripts the way the prototype does.

### 3.D — `requireVoiceAccess` on the Account route

Prototype's `/api/vapi/account/route.ts` is intentionally public ("no auth required so the UI can use it"). Atrium's security posture (per spec §4) requires bearer-JWT on every `/api/voice/*` handler. Recommend (and will execute unless overridden): **gate `account.ts` behind `requireVoiceAccess`** to match the rest of the surface. UI uses `voiceFetch` which already attaches the bearer.

### 3.E — `hubspot.ts` location

The prompt notes "the prototype's prior hubspot is NOT the same as Atrium's repo-level hubspot if one exists; keep voice-scoped HubSpot integration isolated under `src/lib/voice/`". Atrium has `src/lib/voice/hubspot.ts` already (foundation merge). There is no repo-level `src/lib/hubspot.ts` to collide with. Nothing to resolve.

## 4. Naming or aliasing conflicts

- **HubSpot env var.** Prototype + Atrium both read `HUBSPOT_PRIVATE_APP_TOKEN`. No alias conflict. Need to add to env template only.
- **Icons.** No conflict — Atrium's `icons.tsx` exports a single `I` object; CreditCard, Dollar, Shield, Lock, Unlock are all already there.
- **`lucide-react`.** Present in `package.json` (`^1.14.0`) but explicitly not used by `icons.tsx` per source comment. Honor convention.
- **Index name collision.** Prompt asks for `voice_call_transcripts_vapi_call_id_idx`. Production already has `voice_call_transcripts_vapi_call_id_key` (UNIQUE index — implicitly satisfies the btree need). The migration's `CREATE INDEX IF NOT EXISTS voice_call_transcripts_vapi_call_id_idx` will create a redundant second btree index. **Recommend skipping** this index (the UNIQUE key serves the lookup path); will include the line with `IF NOT EXISTS` so it is idempotent and harmless if Kyle prefers to keep parity with the prompt verbatim.
- **Index name `voice_call_transcripts_created_at_desc_idx`.** Production has `voice_call_transcripts_created_at_idx` (without `_desc_`) covering `created_at DESC` already. Same shape, different name. The migration's `IF NOT EXISTS` will add a redundant second index. **Recommend skipping**; will leave the line in for parity unless Kyle overrides.
- **`metacron.operator_allowlist`.** Confirmed via Supabase MCP: 4 seeded rows (kyle/keenan/curtis/team @ unicron.systems). Column `added_at` (not `created_at`).

## 5. Migration SQL preview

The production DB already has every column listed below and equivalents of every index. The file is being added for reproducibility (replaying the project from scratch should land here). `apply_migration` will execute every statement as a no-op via `IF NOT EXISTS` guards.

```sql
-- 20260512_voice_costs_and_allowlist_modes.sql
-- Additive: cost capture columns + allowlist-mode columns + supporting indexes.
-- Idempotent: every statement guarded with IF NOT EXISTS or ADD CONSTRAINT ... NOT VALID
-- then VALIDATE so legacy rows do not break.
-- Production state at HEAD 0ba59bf has every column already, applied by a prior
-- ad-hoc migration; this file is the reproducible record.

ALTER TABLE pathfinder.voice_call_transcripts
  ADD COLUMN IF NOT EXISTS cost_usd        numeric(10,4);
ALTER TABLE pathfinder.voice_call_transcripts
  ADD COLUMN IF NOT EXISTS cost_breakdown  jsonb;
ALTER TABLE pathfinder.voice_call_transcripts
  ADD COLUMN IF NOT EXISTS vapi_org_id     text;
ALTER TABLE pathfinder.voice_call_transcripts
  ADD COLUMN IF NOT EXISTS started_at      timestamptz;

CREATE INDEX IF NOT EXISTS voice_call_transcripts_created_at_desc_idx
  ON pathfinder.voice_call_transcripts (created_at DESC);
CREATE INDEX IF NOT EXISTS voice_call_transcripts_source_created_idx
  ON pathfinder.voice_call_transcripts (source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_call_transcripts_vapi_call_id_idx
  ON pathfinder.voice_call_transcripts (vapi_call_id);

ALTER TABLE pathfinder.voice_agent_sources
  ADD COLUMN IF NOT EXISTS allowlist_mode text DEFAULT 'allowlist';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'voice_agent_sources_allowlist_mode_check'
  ) THEN
    ALTER TABLE pathfinder.voice_agent_sources
      ADD CONSTRAINT voice_agent_sources_allowlist_mode_check
      CHECK (allowlist_mode IN ('allowlist','hubspot','open')) NOT VALID;
    ALTER TABLE pathfinder.voice_agent_sources
      VALIDATE CONSTRAINT voice_agent_sources_allowlist_mode_check;
  END IF;
END $$;

ALTER TABLE pathfinder.voice_agent_sources
  ADD COLUMN IF NOT EXISTS hubspot_filter           jsonb;
ALTER TABLE pathfinder.voice_agent_sources
  ADD COLUMN IF NOT EXISTS open_mode_confirmed_by   text;
ALTER TABLE pathfinder.voice_agent_sources
  ADD COLUMN IF NOT EXISTS open_mode_confirmed_at   timestamptz;
```

Production verification (already applied):

```
voice_call_transcripts: cost_usd (numeric), cost_breakdown (jsonb), vapi_org_id (text), started_at (timestamptz) — all present.
voice_agent_sources:    allowlist_mode (text, default 'allowlist'), hubspot_filter (jsonb), open_mode_confirmed_by (text), open_mode_confirmed_at (timestamptz) — all present.
Indexes on voice_call_transcripts: created_at DESC (idx), source_id + created_at DESC (idx), vapi_call_id (unique key) — all present, see Open Questions §4 for the two redundant indexes.
```

## 6. Open questions for Kyle

1. **§3.A** — CallingModePanel host UI in `VoiceAgentsView`. Choose: inline-expand (recommended), modal, defer to 9.5, or new sub-sub-tab.
2. **§3.B** — Cost surfacing in `VoiceActivityView`. Choose: inline cell on each card (recommended), minimal CallDetail panel now, or defer entirely.
3. **§4 / §5** — Redundant indexes (`_desc_idx`, `_vapi_call_id_idx`). Keep the migration verbatim per prompt, or drop the two redundant `CREATE INDEX` lines since equivalents already exist?
4. **§3.D** — Lock `/api/voice/account` behind `requireVoiceAccess` (recommended, aligns with the rest of `/api/voice/*`), or leave it public to match prototype semantics?

Halt mode: I will not begin Phase 3 (writes) until Kyle approves the four answers above on the Internal Org Kanban card or in chat.

---

## Out-of-prompt deltas worth flagging

- The foundation merge brought `getVapiCall` and `listVapiCalls` into `src/lib/voice/vapi.ts` already, so the Phase 4 "ensure exports" step is a no-op.
- The foundation merge brought `assertAllowlistedForSource` into `src/lib/voice/allowlist.ts` alongside the legacy `assertAllowlisted`. No additions needed.
- The foundation merge applied production schema changes via `20260512_voice_atrium_integration.sql` and a separate `20260512_voice_allowlist_rpc.sql`. The Atrium-side migrations directory on disk already has both. The new `20260512_voice_costs_and_allowlist_modes.sql` will land alongside them. If today's date is already in use we suffix `_b`; spot-checked, no collision today.
- `vercel.json` has no `crons` array yet — adding the array is a net-new structural change (not just inserting a sibling).
