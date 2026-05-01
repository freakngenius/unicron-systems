# PLAN — P0-02c Contact Resolver (v1: Phase 1 only)

**Branch:** `feat/p0-02c-contact-resolver`
**Worktree:** `Pathfinder-worktrees/p0-02c-contact-resolver/`
**Spec (canonical full vision):** `Pathfinder/agent-specs/11-computer-contact-resolver.md`
**Feature roster:** `Pathfinder/Pathfinder-Feature-Specs.md`
**Dispatch prompt:** `Pathfinder/Pathfinder-P0-02c-Contact-Resolver-Prompt.md`
**Status:** awaiting operator approval — no code until approved

---

## 1. Scope cut — what v1 ships, what defers to v2

This branch ships **Phase 1 only** — autonomous extraction of source-side contacts from `raw_payload`, zero third-party API spend. Phases 2 and 3 (paid enrichment via Apollo / Hunter / Sonar) defer entirely to a follow-up PR.

**Reasoning (operator's call):** see how much usable contact data lands from `raw_payload` alone before spending on third-party enrichment. If Phase 1 covers 60-70% of leads with at least one real contact, that may be enough for the contest demo and we defer Phase 2/3 entirely. If Phase 1 falls short, we add Phase 2 in a follow-up PR — the schema (which keeps `source`, `confidence`, `inferred` columns) already supports it, so no rewrite is needed.

**v1 acceptance:** every verified high-priority project shows at least the contracting-officer contact (for federal sources) in the project modal's Contacts section, sourced from `raw_payload` extraction, within 30 minutes of verification. No third-party API spend.

`agent-specs/11-computer-contact-resolver.md` remains the canonical full vision. Anything in that spec that says "Phase 2" or "Phase 3" is real intent, just deferred.

---

## 2. Architecture (v1)

```
┌─ Phase 1 (cron, free, autonomous) ────────────────────────────────┐
│  /api/cron/contact-resolver  every 10 minutes                     │
│    queue = projects.verified=true  AND no row in project_contacts │
│    for each project:                                              │
│      lib/contacts/extractor.ts → parse raw_payload                │
│      write source-side contacts (source='raw_payload')            │
│      log source_contact_found per row                             │
│    log cycle_close                                                │
└────────────────────────────────────────────────────────────────────┘

┌─ Frontend ────────────────────────────────────────────────────────┐
│  components/ContactsSection.tsx                                   │
│    fetches GET /api/contacts/[project_id]                         │
│    renders rows in a clean list — that's it                       │
│    no enrich button, no enriching state                           │
│  ProjectModal.tsx mounts ContactsSection                          │
└────────────────────────────────────────────────────────────────────┘
```

All shared-state writes go through `pathfinder.project_contacts` — the only new table this v1 creates.

---

## 3. Data model

### 3.1 `pathfinder.project_contacts` (verbatim from spec — schema unchanged from v1 to v2)

```sql
CREATE TABLE pathfinder.project_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    text NOT NULL REFERENCES pathfinder.projects(id) ON DELETE CASCADE,
  contact_role  text NOT NULL CHECK (contact_role IN (
                  'owner','gc','site_super','contracting_officer','decision_maker','other')),
  full_name     text NOT NULL,
  email         text,
  phone         text,
  linkedin_url  text,
  company       text,
  title         text,
  source        text NOT NULL CHECK (source IN (
                  'raw_payload','apollo','hunter','sonar','manual')),
  confidence    integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  inferred      boolean NOT NULL DEFAULT false,
  surfaced_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_contacts_has_channel CHECK (
    email IS NOT NULL OR phone IS NOT NULL OR linkedin_url IS NOT NULL
  )
);

CREATE INDEX idx_project_contacts_project ON pathfinder.project_contacts(project_id);
CREATE INDEX idx_project_contacts_role    ON pathfinder.project_contacts(contact_role);
```

Important: the `source` CHECK and `confidence` / `inferred` columns are kept exactly as the full spec defines them, even though v1 only writes `source = 'raw_payload'` rows. v2 writes `'apollo'`, `'hunter'`, `'sonar'` rows without any migration. The `project_contacts_has_channel` CHECK enforces the spec rule "never write a contact without (email OR phone OR linkedin_url)" at the schema level.

### 3.2 `lib/types.ts` additions (additive only)

```ts
export type ContactRole =
  | 'owner' | 'gc' | 'site_super' | 'contracting_officer' | 'decision_maker' | 'other';
export type ContactSource = 'raw_payload' | 'apollo' | 'hunter' | 'sonar' | 'manual';

export interface ProjectContact {
  id: string;
  project_id: string;
  contact_role: ContactRole;
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  company: string | null;
  title: string | null;
  source: ContactSource;
  confidence: number;
  inferred: boolean;
  surfaced_at: string;
}
```

Plus add `'contact-resolver'` to the `AgentName` union and the matching `project_contacts` entry in `PathfinderDatabase.pathfinder.Tables`. No `EnrichmentUsage` type in v1 — that ships with v2.

### 3.3 Migration file

`supabase/migrations/0013_project_contacts.sql` — single migration, single table. The `enrichment_usage` table does NOT ship in v1.

---

## 4. Phase 1 — extractor + cron (autonomous, free)

### 4.1 `lib/contacts/extractor.ts` — pure functions

Two extractors keyed off `Project.source`:

**`extractFromUSAspending(payload)`** — pulls:
- `awarding_agency.toptier_agency.name` → `company`
- `awarding_agency.subtier_agency.name` / `awarding_agency.office_agency.name` → contracting office name (used as `title` when present)
- `recipient_name` → awarded contractor company name

USAspending public records typically do NOT name a contracting officer. So Phase 1 from USAspending generally produces:
- `full_name = recipient_name` (the awarded contractor — usually a company, not a person)
- `contact_role = 'gc'`
- `source = 'raw_payload'`, `confidence = 80`, `inferred = false`
- channel: only if `raw_payload` happens to carry one; usually skipped

**Decision: skip USAspending rows that have no channel.** The schema CHECK enforces this anyway. v1 USAspending coverage will be low — that's fine, that's what v2 (Hunter on the recipient domain) is designed to fix.

**`extractFromSamGov(payload)`** — pulls `pointOfContact` array (already partially parsed in `lib/outreach.ts:extractContactFromRawPayload`):
- For each entry: `fullName`, `title`, `email`, `phone`
- `contact_role = 'contracting_officer'` for all SAM.gov POCs (per spec)
- `source = 'raw_payload'`, `confidence = 90`, `inferred = false`
- Skip entries with no channel or no full_name

**`extractContacts(project)`** — dispatcher, returns `{ contacts, skipped }` where `contacts` is `Array<Omit<ProjectContact, 'id' | 'surfaced_at'>>` ready for insert and `skipped` is `Array<{ reason: 'no_channel' | 'no_name' | 'malformed_email'; name: string | null }>`. Returns `{ contacts: [], skipped: [] }` for unrecognised sources. The skipped list is purely diagnostic (not persisted) and is logged per cycle by the cron handler — see §4.2.

**`isValidEmail(s)`** — regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Used to drop malformed source entries before insert; rejected emails go into `skipped` with `reason: 'malformed_email'`.

### 4.2 `app/api/cron/contact-resolver/route.ts`

Mirrors `app/api/cron/outreach/route.ts` exactly for auth, overlap protection, agent_runs row, agent_log lines. Delta:

- Queue pull: `projects WHERE verified = true AND id NOT IN (SELECT project_id FROM project_contacts)` — same NOT-EXISTS pattern outreach uses (two queries, filter in TS).
- Per-project step: `extractContacts(project)` → batched insert of `contacts`, then one `extract_skip` log per `skipped` entry (event shape: `{ project_id, reason, name }`).
- `agent_name = 'contact-resolver'`.
- Event types: `extract_start` (cycle start, queue depth), `source_contact_found` (per inserted contact), `extract_skip` (per rejected candidate, see §4.1), `error`, `cycle_close` (aggregate stats: `processed`, `contacts_written`, `skipped_no_channel`, `skipped_no_name`, `skipped_malformed_email`).
- `QUEUE_LIMIT = 50` (Phase 1 is fast — pure JSON parse + validation).
- `CYCLE_TIMEOUT_MS = 8 * 60_000` (well under the Vercel 10-minute interval).
- `maxDuration = 60`.

### 4.3 `vercel.json` — ADD entry, do not replace

Append one line to the existing `crons` array:

```json
{ "path": "/api/cron/contact-resolver", "schedule": "*/10 * * * *" }
```

Per CLAUDE.md "Add entries; do not replace existing ones" — keeps concurrent worktrees mergeable.

---

## 5. Frontend — ContactsSection only

### 5.1 GET `/api/contacts/[project_id]/route.ts`

`ContactsSection` needs a way to fetch the contacts on mount. Options considered:

- **A. GET endpoint at `/api/contacts/[project_id]`** ← chosen. Tiny, self-contained, naturally extends to v2 (when EnrichButton ships, it lives at the sibling `enrich/[project_id]` POST and re-uses the same fetch flow on success).
- B. Augment the existing `/api/projects` payload with contacts. Cleaner network at first glance, but bloats the projects list payload (every card carries every project's contacts) and pulls a non-scoped file into the diff.
- C. Server-side render contacts into the project page. Doesn't fit the existing dashboard shape (everything is client-rendered from cached projects).

Endpoint shape:
```ts
// GET /api/contacts/[project_id]
// Auth: middleware.ts basic-auth (covers all routes)
// Reads pathfinder.project_contacts WHERE project_id = $1
// Returns { contacts: ProjectContact[] } ordered by confidence DESC, surfaced_at DESC
```

> **Note for operator:** the dispatch prompt did NOT scope this file. v1 needs it because the section can't render without it. Flagging here for visibility — drop in §10 if you'd rather pass contacts down via the projects payload.

### 5.2 `components/ContactsSection.tsx`

- Props: `{ projectId: string }`
- State: `{ contacts: ProjectContact[]; status: 'loading' | 'idle' | 'error' }`
- On mount: `fetch('/api/contacts/' + projectId)` → set contacts, set status `idle`
- Renders inside the existing `Section` helper from `ProjectModal.tsx` (same look as the Rationale / Verifier / Source record sections)
- Each contact row: name (bold), role (small uppercase label), title (subtle secondary), one channel icon per available channel (✉ email, in LinkedIn, ☎ phone), confidence badge ("90") in mono. Inferred contacts get a subtle "inferred" tag (will matter once v2 ships; harmless in v1 since all rows are `inferred=false`).
- Empty state: "No contacts surfaced yet — extraction runs after verification." (No CTA button — that's v2.)
- Error state: "Failed to load contacts." with a small retry link.

**No `EnrichButton`. No "Get more contacts" affordance. No enriching/enriched state machine. v1 is read-only.**

### 5.3 ProjectModal.tsx integration

Mount `<ContactsSection projectId={project.id} />` in the body, between the existing "Recommended outreach" section and "Source record" section. Order matches user mental model: rationale → verifier → outreach hook → contacts to act on → source.

### 5.4 ProjectList.tsx — UNTOUCHED in v1

No compact card-level affordance. Card-level enrichment trigger ships with v2's `EnrichButton`.

---

## 6. `prompts/computer-contact-resolver.md`

Canonical agent prompt — mirrors `agent-specs/11-computer-contact-resolver.md` rewritten as a runnable system prompt. Sections:
- Purpose
- Reads (full vision: `projects`, `raw_payload`, Apollo/Hunter/Sonar)
- Writes (`project_contacts`, `enrichment_usage` — both listed even though v1 only creates `project_contacts`)
- **Phase 1** — extraction rules (the part that runs in v1)
- **Phase 2 — DEFERRED to v2.** Block describes intent so the prompt is forward-compatible; v2 PR flips the deferral note off.
- **Phase 3 — DEFERRED to v2.**
- Constraints (the email/phone/linkedin presence rule, name-required rule, email regex)

Same source-of-truth pattern as `prompts/outreach-drafter.md` — markdown is the human-readable canonical; v2 will import the relevant sections as TS constants when wiring Sonar.

---

## 7. Tests (`__tests__/contacts.test.ts`)

Pure-function coverage over the v1 surface only:

| Module           | Test cases                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `isValidEmail`   | Pass: `a@b.com`. Fail: `''`, `a@b`, `a@`, `@b.com`, `a b@c.com`                                            |
| `extractFromSamGov` | empty payload → `[]`; one-POC payload → 1 row; multi-POC payload → N rows; entry with no channel → skipped; entry with no full_name → skipped; malformed email → skipped |
| `extractFromUSAspending` | empty payload → `[]`; payload with `recipient_name` and no channel → skipped (per the no-channel rule); payload with `recipient_name` plus a channel → 1 row with `contact_role='gc'` |
| `extractContacts` (dispatcher) | dispatches by `project.source`; unrecognised source → `[]` |

Sample fixtures: `__tests__/fixtures/usaspending-sample.json` and `__tests__/fixtures/sam-gov-sample.json` — pulled from real (sanitized) payloads in `pathfinder.projects.raw_payload` (one row of each source). The test reads them via `fs.readFileSync` at test setup — same approach as other Pathfinder fixture-based tests.

No tests for budget / rate-limit / debounce / resolver / endpoint — those modules don't exist in v1.

---

## 8. End-to-end manual test (before push)

Run inside the worktree against the dev Supabase:

1. `npm run typecheck && npm run test && npm run build` — all green.
2. Apply migration locally (or via Supabase MCP): `0013_project_contacts.sql`. Confirm table exists.
3. Start dev server, hit `GET /api/cron/contact-resolver?secret=$CRON_SECRET` → expect contacts written for all currently-verified projects without contacts.
4. `SELECT count(*) FROM pathfinder.project_contacts WHERE source = 'raw_payload';` should be > 0; for SAM.gov projects with `pointOfContact`, count should match the array length.
5. With basic-auth cookie set in browser, open a verified SAM.gov-sourced project in the modal → confirm Contacts section renders contracting-officer contact(s) cleanly.
6. Open a verified USAspending project → confirm Contacts section renders empty state (or `recipient_name` row if a channel is present in the payload — rare).
7. Note the Phase 1 hit rate (rows with ≥1 contact / total verified rows). This number drives the v2 go/no-go decision.

---

## 9. Build sequence (v1)

| # | Task                                                              | Output                                                                   |
| - | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1 | THIS PLAN                                                          | `docs/PLAN-P0-02C-CONTACT-RESOLVER.md` (you are here) — needs approval   |
| 2 | Migration + types                                                  | `supabase/migrations/0013_project_contacts.sql`, `lib/types.ts` deltas   |
| 3 | Phase 1 extractor + tests                                          | `lib/contacts/extractor.ts`, `__tests__/contacts.test.ts`, fixtures      |
| 4 | Phase 1 cron handler                                                | `app/api/cron/contact-resolver/route.ts`, `vercel.json` append           |
| 5 | GET endpoint                                                       | `app/api/contacts/[project_id]/route.ts`                                 |
| 6 | ContactsSection                                                    | `components/ContactsSection.tsx`                                         |
| 7 | Mount in ProjectModal                                               | edits to `components/ProjectModal.tsx`                                  |
| 8 | Canonical prompt doc                                                | `prompts/computer-contact-resolver.md`                                  |
| 9 | E2E manual test (§8)                                                | green run captured in PR description with hit-rate number                |
| 10 | Push, open PR                                                       | PR description: v1-only scope, hit rate, v2 follow-up referenced         |

---

## 10. v2 deferred — what ships in the follow-up PR

Everything below is real intent (per `agent-specs/11-computer-contact-resolver.md`), just on hold until we see Phase 1 hit rate.

**New schema:**
- `pathfinder.enrichment_usage(id, user_id, service, credits_used, project_id, month, created_at)` — event-log shape, indexes on `(month, service)`, `(project_id, created_at DESC)`, `(service, created_at DESC)`. Backs all rate/cap/budget queries from one table.

**New libs:**
- `lib/contacts/apollo.ts` — env-gated by `APOLLO_API_KEY`. `searchDecisionMakers({ companyName, domain? })` calls `POST https://api.apollo.io/v1/mixed_people/search`. Caps at 3, filters to construction-adjacent titles.
- `lib/contacts/hunter.ts` — env-gated by `HUNTER_API_KEY`. `domainSearch({ domain })` calls `GET https://api.hunter.io/v2/domain-search`. Caps at 3, filters to senior+executive.
- `lib/contacts/sonar.ts` — env-gated by `PERPLEXITY_API_KEY`. Web-grounded prompt (sourced from §6's prompt doc). Caps at 2 contacts, `confidence = 60`, `inferred = true` typically.
- `lib/contacts/budget.ts` — defaults: Apollo 180/mo, Hunter 45/mo, Sonar 100/mo, env-overridable. DB-backed rate-limit (5/min/service), per-project debounce (30s), per-project 30-day cap.
- `lib/contacts/resolver.ts` — orchestration. Service priority: Apollo > Hunter > skip; Phase 3 only if Phase 2 wrote `< 2` contacts and Sonar key set.

**New endpoints:**
- `POST /api/contacts/enrich/[project_id]` — user-triggered. 200 with enriched contacts; 429 (debounced/rate-limited/project-capped); 402 (monthly budget exhausted); 503 (no service configured).

**New UI:**
- `components/EnrichButton.tsx` — optimistic states (idle / enriching / enriched), tooltip with credit cost, error toasts mapped to status codes.
- ContactsSection gets the enriching/enriched states wired in.
- `components/ProjectList.tsx` — compact card-level "Get more contacts" affordance. After click: spinner inline, on success card shows "X contacts" badge, clicking badge opens modal at contacts section.

**Operator coordination (covered by `Pathfinder/Pathfinder-P0-02c-Contact-Resolver-Prompt.md` § "External service setup steps for Kyle"):**
- Pick Apollo ($49/mo) or Hunter (free, 50/mo) for Phase 2; Sonar ($50/mo+) for Phase 3.
- Add the relevant `*_API_KEY` env vars in Vercel before merging the v2 PR.

**Outreach Drafter integration:** still deferred (separate small PR). P0-02 will switch from `lib/outreach.ts:extractContactFromRawPayload` to a SELECT against `pathfinder.project_contacts`. That follow-up depends on v1 (this branch) shipping; it does not depend on v2.

---

## 11. Operator decisions (resolved)

1. **GET `/api/contacts/[project_id]` endpoint inclusion** — APPROVED. Read-only, session-checked via existing middleware basic-auth, no third-party API spend.
2. **USAspending no-channel rows** — APPROVED skip. Schema CHECK enforces `(email OR phone OR linkedin_url)`; a contact with no channel isn't actionable.
3. **Skip-event logging** — added per operator request. Every rejected candidate logs `{ event_type: 'extract_skip', event_data: { project_id, reason: 'no_channel' | 'no_name' | 'malformed_email', name: '<extracted name or null>' } }`. Diagnostic data informs the v2 go/no-go: if a high % of USAspending records carry a name with no email, Phase 2 (Hunter/Apollo) is high-value; if low %, Phase 2 is unnecessary noise. The cycle-close event aggregates counts.

---

## 12. What gets written + touched (final v1 file list)

| Status   | Path                                                          |
| -------- | ------------------------------------------------------------- |
| New      | `supabase/migrations/0013_project_contacts.sql`               |
| New      | `app/api/cron/contact-resolver/route.ts`                      |
| New      | `app/api/contacts/[project_id]/route.ts` *(see §5.1 / §11.1)* |
| New      | `lib/contacts/extractor.ts`                                   |
| New      | `prompts/computer-contact-resolver.md`                        |
| New      | `components/ContactsSection.tsx`                              |
| New      | `__tests__/contacts.test.ts`                                  |
| New      | `__tests__/fixtures/usaspending-sample.json`                  |
| New      | `__tests__/fixtures/sam-gov-sample.json`                      |
| Edit     | `lib/types.ts` (additive: `ProjectContact`, `ContactRole`, `ContactSource`, agent enum) |
| Edit     | `vercel.json` (append one cron entry — do not replace)        |
| Edit     | `components/ProjectModal.tsx` (mount `<ContactsSection />`)    |
| Edit     | `docs/PLAN-P0-02C-CONTACT-RESOLVER.md` (this plan)            |

**Files explicitly NOT in v1 (defer to v2 PR):**

- `lib/contacts/apollo.ts`, `hunter.ts`, `sonar.ts`, `budget.ts`, `resolver.ts`
- `app/api/contacts/enrich/[project_id]/route.ts`
- `components/EnrichButton.tsx`
- `pathfinder.enrichment_usage` table (and its migration)
- Compact "Get more contacts" affordance in `components/ProjectList.tsx`

---

## Awaiting approval

Reply approve / changes / questions and I'll start with step 2 (migration + types).
