# PROMPT — Sprint 1: Call Ingest + Customers + Atrium Shell

Dispatched by the Master Conductor. Self-contained.

**Project root:** `/Users/keka/Dropbox/Projects/Unicron Systems/`

**Reference SPECs:**
- `Company Docs/Specs/SPEC - Unicron Nervous System.md`
- `Company Docs/Specs/SPEC - Nervous System Addendum 1 (Kanban Surface Routing).md`
- `Company Docs/Specs/SPEC - Nervous System Addendum 2 (Skills + Karpathy + Refero).md`
- `Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md`

This sprint accomplishes:
1. Provision `nervous_system.customers` table; seed Zedcor; add config hooks for per-team-member ingest sources
2. Reorganize `unicron-knowledge` vault into Karpathy 3-folder pattern (`raw/`, `wiki/`, `outputs/`) with editorial schema at `wiki/_schema.md`
3. Build the call ingest pipeline (Fathom + Plaud) with the typed handoff contract from SPEC section 7.3
4. Build the ingest base library (ledger writes, vault writes, action item creation, kanban writer dispatch, Taboo Keeper validation)
5. Replace the `/api/ingest` Sprint 0 stub with the real handler
6. Provision DNS for `atrium.unicron.systems` subdomain
7. Scaffold Atrium app shell in `unicron-platform` (auth with SSO + magic link, email allowlist gate, feature flag, layout shell, empty home placeholder)
8. Wire kanban writer via Notion MCP for cross-kanban routing per Addendum 1

This sprint does NOT build the Slack Orchestrator (Sprint 2), persistent agents Analyst/Elder (Sprint 3), or any Atrium tab content beyond the empty shell.

---

## Pre-conditions

Verify before starting:
- Sprint 0 verified by Kyle (kanban card in Verified column)
- `unicron-knowledge` repo exists with migrated vault content
- `nervous_system` schema exists with Sprint 0 tables
- `Memory/taboos.md`, `Memory/elder/continuity.md`, `Memory/elder/seven_generations.md` exist in vault
- `/api/ingest` Sprint 0 stub returns 200 in Pathfinder
- Notion MCP, Supabase CLI, Vercel CLI, GitHub MCP all available

If any pre-condition fails, halt and report.

---

## Kanban hygiene — start of sprint

1. Create or locate Internal Org Kanban card titled "Sprint 1 — Call Ingest + Customers + Atrium Shell"
2. Move to **In Process**
3. Set DRI: Kyle Kesterson
4. Set Surface: Architecture
5. Set Source: Sprint Plan
6. Set Verify Criteria: "All Sprint 1 done criteria met. Fathom webhook ingests a real call into ledger + vault + action items + Notion card. /api/ingest returns 200 on real call payload. atrium.unicron.systems resolves and serves auth-gated empty shell. Pathfinder and unicron-platform Vercel deployments healthy."

---

## Parallel streams

Dispatch the following four streams concurrently in separate worktrees per Addendum 2 section 4.

- **Stream A** (worktree `unicron-knowledge-worktrees/sprint1-vault-reorg`): vault reorg into raw/wiki/outputs + write `wiki/_schema.md` + migrate Company Docs content into new structure (Tasks 0a, 0b, 0c)
- **Stream B** (worktree `Pathfinder-worktrees/sprint1-ingest`): ingest base library + call ingest skill + Taboo Keeper integration + customers table migration (Tasks 1, 2, 3, 4, 5)
- **Stream C** (worktree `Pathfinder-worktrees/sprint1-api-ingest`): replace `/api/ingest` stub + Fathom webhook handler + Plaud handler + kanban writer (Tasks 6, 7, 8, 9)
- **Stream D** (worktree `unicron-platform-worktrees/sprint1-atrium-shell`): DNS provisioning + Atrium app shell with auth + email allowlist + feature flag + layout shell (Tasks 10, 11)

Streams B and C share dependencies (B's library is used by C's route); merge B before C in integration. Streams A and D are independent.

## Integration tasks (run after all streams complete)

- Verify Stream B's library exports compile against Stream C's handler imports
- Run Task 12 (multi-Vercel verification) against the merged result
- Run Task 13 (continuity log + whats-connected.md)
- Final smoke tests across the merged sprint

---

## Tasks

### Task 0a — Vault reorg structure (Stream A)

In `unicron-knowledge-worktrees/sprint1-vault-reorg`:

1. Create top-level directories: `raw/`, `wiki/`, `outputs/`
2. Inside `raw/`: `inbox/`, `calls/`, `slack-threads/`, `emails/`, `articles/` (each with `.gitkeep`); plus `raw/_ingest_log.md` (append-only header only)
3. Inside `wiki/`: `company/`, `memory/orchestrator/`, `memory/analyst/`, `memory/elder/`, `memory/cowork/`, `customers/`, `people/`, `decisions/`, `retros/`, `specs/`, `prds/`, `plans/`, `research/`, `how-to/`, `prompts/` (each with `.gitkeep`)
4. Inside `outputs/`: `reports/`, `decks/`, `briefs/`, `proposals/`, `deliverables/` (each with `.gitkeep`)

### Task 0b — Migrate Sprint 0 content into new structure (Stream A)

Move content from current flat vault layout into new structure. Use `git mv` (preserves history). Per Addendum 2 section 2.2 mapping:

- `Vision/*` → `wiki/company/`
- `Specs/*` → `wiki/specs/`
- `PRD/*` → `wiki/prds/`
- `Plans/*` → `wiki/plans/`
- `Reports/*` → `outputs/reports/`
- `Prompts/*` → `wiki/prompts/`
- `Memory/*` → `wiki/memory/` (subdirs preserved; `Memory/orchestrator/` → `wiki/memory/orchestrator/`, etc.)
- `Memory/elder/continuity.md` → `wiki/memory/elder/continuity.md`
- `Memory/elder/seven_generations.md` → `wiki/memory/elder/seven-generations.md` (rename to kebab-case per schema)
- `Memory/taboos.md` → `wiki/memory/taboos.md`
- `Inbox/*` → `raw/inbox/`
- `Decisions/*` → `wiki/decisions/`
- `Calls/*` → split: raw transcripts → `raw/calls/`, codified summaries → `wiki/customers/<customer>/calls/`
- `Retros/*` → `wiki/retros/`
- `Misc Docs/*` → reviewed individually: operational notes → `wiki/`, transient → `raw/articles/`

After migration, the old top-level folders are empty; remove their `.gitkeep` and the empty folders.

Update all internal cross-references in moved files. Use a script if needed to rewrite paths, then verify with `grep -r "Memory/"` and similar checks.

### Task 0c — Write `wiki/_schema.md` (Stream A)

Author the editorial schema. Sections per Addendum 2 section 2.3:

```markdown
---
type: schema
status: active
last_reviewed: <date>
ttl_days: permanent
reviewers: [Kyle Kesterson, Keenan Hock, Curtis Smith]
---

# Wiki Editorial Schema

The 80% of wiki quality. Defines how the LLM and humans together maintain the codified-knowledge layer.

## Naming conventions
- All filenames kebab-case: `lower-case-with-hyphens.md`
- Folder names kebab-case
- Headers in sentence-case (only first word and proper nouns capitalized)
- Page slugs match filenames

## Frontmatter (required on every page)

[copy frontmatter standard from parent SPEC section 6.3, augmented with Addendum 2 fields]

## When to create vs append
- **Create a new page** when a topic accumulates 3+ raw sources OR 1 substantive decision (continuity log entry)
- **Append** when new content extends but does not contradict existing content
- **Update with marker** when new content contradicts: append a `## Update YYYY-MM-DD` section, do not silently edit

## Cross-reference policy
- Internal links use `[[wiki/<full-path>]]` form, not bare `[[name]]`
- Every wiki page links to at least one source in `raw/` (immutable)
- Every customer page links to relevant person pages and call records

## Span-level citation format
- Inline: `<sup>[ledger:<uuid>:<span>]</sup>` for evidence from ledger rows
- Inline: `[raw:<path>:<line-range>]` for evidence from raw source files
- Block: `> "exact quote"<br><sup>[ledger:<uuid>:<span>]</sup>` for verbatim citations

## Page lifecycle
- `status: draft` — being written, not yet load-bearing
- `status: active` — current truth
- `status: superseded` — replaced by another page; references it
- `status: archived` — no longer relevant; preserved for history

## Lint rules (Analyst weekly check)
1. Frontmatter present and valid
2. All internal links resolve to existing files
3. Every claim citing evidence has a valid `ledger:` or `raw:` reference
4. No orphan pages (every wiki page reachable from `_master-index.md`)
5. No contradictions detected between pages on the same topic without superseding marker
6. No stale claims (TTL-expired pages still marked active)

## Conflict resolution
- Author conflict (two humans edit same page): standard git merge; Analyst flags conflicting claims for Cowork review
- Source conflict (two raw sources contradict): wiki page captures both, marks confidence per source, Analyst proposes resolution
- LLM-vs-human conflict: human edit wins; LLM may propose subsequent change via PR

## Maintenance primitives (per Addendum 2 section 2.6)
- **Ingest**: continuous, on every `/api/ingest` write
- **Query**: on demand, index-first
- **Lint**: weekly, by Analyst, output to `outputs/reports/wiki-lint-YYYY-WW.md`
```

### Task 0d — Write initial `wiki/_master-index.md` (Stream A)

Bootstrap the master index. Analyst will regenerate nightly from Sprint 3 onward; for Sprint 1, write an initial version reflecting the migrated structure:

```markdown
---
type: master-index
status: active
last_regenerated: <date>
regenerated_by: human (Sprint 1 bootstrap; Analyst takes over from Sprint 3)
---

# Master Index

Lightweight table of contents. Load this first; fetch specific pages on demand.

## Company
- [[wiki/company/manifesto]] — vision and philosophy
- [[wiki/company/paradigm-map]] — biomimetic colony framing
- [Other migrated Vision/ pages]

## Memory
- [[wiki/memory/taboos]] — refusal register
- [[wiki/memory/elder/continuity]] — continuity log
- [[wiki/memory/elder/seven-generations]] — what we will not break

## Specs
- [Each spec from wiki/specs/ with one-line summary]

## Customers
- [[wiki/customers/zedcor/]] — customer-zero, mobile solar surveillance towers

## How-to
- [Stub; populated in Sprint 6 with wiki onboarding pages]
```

### Task 0e — Write initial `wiki/_change-log.md` (Stream A)

```markdown
---
type: change-log
status: active
ttl_days: permanent
---

# Wiki Change Log

Append-only record of wiki edits.

## YYYY-MM-DD — Sprint 1 vault reorg
- **Type:** restructure
- **Source:** human (Sprint 1 Stream A)
- **Summary:** Migrated flat Company Docs/ structure into Karpathy 3-folder pattern (raw/wiki/outputs). Wrote initial `_schema.md`, `_master-index.md`, `_change-log.md`. All prior content preserved; rename and relocation only.
```

### Task 1 — Provision `nervous_system.customers` table

Create migration. Schema:

```sql
CREATE TABLE IF NOT EXISTS nervous_system.customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  status text not null default 'cold' check (status in ('cold','discovery','proposal','contract','onboarding','active','churned')),
  primary_contact_team_member_id uuid references nervous_system.team_members(id),
  notes text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  last_touched timestamptz default now(),
  ttl_days integer default 365
);
```

Seed row:
- Zedcor: status=`active`, primary_contact_team_member_id = Kyle's id, notes = "Mobile solar surveillance towers; ~24 branches; construction security. Customer-zero for Pathfinder."

Add `customer_id uuid references nervous_system.customers(id)` nullable column to `nervous_system.ledger` and `nervous_system.action_items` (so call records and action items can attach to a customer when relevant).

Apply migration via Supabase CLI: `supabase migration new add_customers_table`, then `supabase db push`.

### Task 2 — Add per-team-member ingest config

Extend `nervous_system.team_members.config jsonb` shape (or add a sibling table if cleaner):

```json
{
  "ingest_accounts": {
    "plaud_account_id": null,
    "fathom_user_id": null,
    "slack_user_id": null,
    "gmail_address": null,
    "apple_notes_api_key": null,
    "voice_memo_api_key": null
  },
  "default_kanban_workspace": "internal"
}
```

Update Sprint 0 seed rows for Kyle, Keenan, Curtis with empty `ingest_accounts` shape (values populated as services are configured). Curtis's config gets the same shape as Kyle's and Keenan's — equal-tier ingest.

### Task 3 — Build Taboo Keeper validation function

Module: `Pathfinder/lib/taboo-keeper.ts`

Contract:
```typescript
export async function validateAction(action: {
  action_type: string,
  target: string,
  payload: unknown,
  requested_by: { type: 'human' | 'agent', id: string, name: string }
}): Promise<{
  verdict: 'pass' | 'bounce',
  reason?: string,
  matched_taboo?: string
}>
```

Implementation:
- Fetch `Memory/taboos.md` from `unicron-knowledge` repo. Cache in memory; refresh when file mtime changes (poll every 5 minutes via GitHub API, or use raw GitHub URL).
- Send action + taboos register to Anthropic with a tight system prompt asking for verdict
- Latency budget: under 2 seconds; if exceeded, return `pass` with `warning: 'taboo_keeper_timeout'` to avoid blocking the pipeline
- Log every call to `nervous_system.audit_log`

### Task 4 — Build ingest base library

Module: `Pathfinder/lib/ingest/base.ts`

Functions:
- `writeLedgerRow(row): Promise<{ id: uuid }>` — inserts into `nervous_system.ledger`, generates embedding via Anthropic embeddings API, stores
- `writeVaultDoc(path, content, frontmatter): Promise<{ commit_sha: string }>` — commits markdown file to `unicron-knowledge` via GitHub API; uses bot user with scoped token
- `createActionItem(item): Promise<{ id: uuid }>` — inserts into `nervous_system.action_items`
- `dispatchKanbanCard(action_item_id): Promise<{ kanban_card_id: string }>` — calls Notion MCP to create card in correct database per `kanban_workspace`, updates `action_items.kanban_card_id`
- `validateWithTabooKeeper(action): Promise<{ pass: boolean, reason?: string }>` — wraps Task 3 function

All functions take typed inputs (Zod schemas), return typed outputs. Errors propagate; ingest pipeline catches and routes to escalations.

### Task 5 — Build call ingest skill

Module: `Pathfinder/lib/ingest/skills/ingest-call.ts`

Input schema (per SPEC section 7.3):
```typescript
{
  source_type: 'call',
  source_id: string,  // Plaud recording id or Fathom recording id
  source_url: string | null,
  raw_content: string,  // transcript
  participants: { team_member_id?: string, name?: string, email?: string }[],
  captured_at: string,  // ISO timestamp
  captured_by: { type: 'human' | 'agent', id: string },
  metadata?: { customer_name?: string, duration_seconds?: number, recorder?: 'plaud' | 'fathom' }
}
```

Logic:
1. Parse participants; map names to `team_members` rows where possible
2. If `metadata.customer_name` is present, look up `customers` table; attach `customer_id` to ledger row
3. Send transcript + context to Anthropic with structured-output system prompt to extract:
   - One-paragraph summary
   - Decisions: array of `{text, evidence_quote, confidence}`
   - Action items: array of `{title, description, proposed_dri, proposed_due, priority, requested_by, requested_of}`
   - Insights: array of `{text, confidence, candidate_for_memory}`
4. If transcript yields no extractable content, return `{ status: 'NO_SIGNAL', reason: 'transcript empty or non-substantive' }`
5. If confidence on extraction is below threshold (configurable, default 0.5), return `{ status: 'ABSTAIN', reason: '...' }`
6. Otherwise return `{ status: 'records', ledger_row, vault_doc, action_items, signals }`

The pipeline (in `/api/ingest`) takes the skill output, validates via Taboo Keeper, then writes via base library functions.

### Task 6 — Replace `/api/ingest` Sprint 0 stub

Path: `Pathfinder/app/api/ingest/route.ts` (in a Pathfinder-worktrees worktree per Pathfinder CLAUDE.md)

Method: POST. Auth: header `x-unicron-api-key` matches env `UNICRON_INGEST_API_KEY`. Validates input shape. Routes by `source_type`:
- `call` → `ingest-call.ts`
- Other source_types: log "not yet implemented" (Sprint 2 onward), return 202 with note

For `call`:
1. Run `ingest-call.ts` skill on payload
2. If skill returns `NO_SIGNAL` or `ABSTAIN`, log to audit_log, return 200 with the status echoed
3. If `records`, validate the proposed writes via Taboo Keeper:
   - Validate ledger row write
   - Validate each vault doc write
   - Validate each action item creation
4. If Taboo Keeper bounces any, halt the pipeline for this call, return 200 with status=`bounced` and the reason; post to `#orchestrator-escalations` via Slack MCP
5. If all pass, write everything via base library
6. Return 200 with `{ status: 'records', ledger_id, vault_doc_path, action_item_ids }`

### Task 7 — Wire Fathom webhook

Fathom webhook URL: `<vercel-pathfinder-domain>/api/ingest` with appropriate headers.
- Configure Fathom account (Kyle's, Keenan's, Curtis's once accounts are linked) to POST on recording complete
- Webhook payload mapped to ingest input schema by a thin handler at `Pathfinder/app/api/ingest/fathom/route.ts` that translates Fathom's payload shape and forwards to `/api/ingest`
- Document the Fathom configuration steps in `unicron-knowledge/Memory/wiki/whats-connected.md` (or stub the file for Sprint 6 wiki to flesh out)

### Task 8 — Plaud handler (best-effort)

Plaud's API for transcripts may or may not be public. Two paths:
- If public webhook or API is available, configure parallel to Fathom
- If not, build a polling-based ingester:
  - Cron on Vercel: poll Plaud's web export for each team_member's account daily at 09:00 PT
  - Pull new transcripts since last poll
  - Forward to `/api/ingest`

If neither path is feasible without significant work, halt the Plaud sub-task with reason "Plaud integration deferred; Fathom is the primary recorder for Sprint 1. Sprint 5 or later revisits."

Document the Plaud status in `whats-connected.md` (stub or update).

### Task 9 — Build kanban writer

Module: `Pathfinder/lib/kanban-writer.ts`

Function: `dispatchKanbanCard(action_item_id)`
1. Read action_item from `nervous_system.action_items`
2. Determine `kanban_workspace` per Addendum 1 routing algorithm if not already set:
   - Explicit override → use it
   - Customer-tenant signal → product kanban
   - Product-code signal → product kanban
   - Architecture signal → Internal Org `Surface=Architecture`
   - Conversation source → Internal Org with matching Surface
   - Default → Internal Org `Surface=Other`, surface to escalations
3. Look up the Notion database id for that kanban (env vars: `NOTION_DB_PATHFINDER_KANBAN`, `NOTION_DB_METACRON_KANBAN`, `NOTION_DB_INTERNAL_KANBAN`; ids set by Kyle in Vercel dashboard)
4. Call Notion MCP to create card with field mapping per SPEC section 13.2
5. Update `action_items.kanban_card_id` with returned Notion page id
6. Return the kanban_card_id

### Task 10 — Provision DNS for atrium.unicron.systems

1. Add CNAME record: `atrium.unicron.systems` → `cname.vercel-dns.com` (or the specific target Vercel returns)
2. Add the domain to the `unicron-platform` Vercel project via Vercel CLI: `vercel domains add atrium.unicron.systems --scope <team-or-user>`
3. Wait for SSL provisioning (poll Vercel API until status=`active`)
4. Verify: `curl https://atrium.unicron.systems` returns Vercel's default response (200 or 404 from unicron-platform; either is acceptable proof of routing)

If DNS provider for unicron.systems is not Vercel-managed, this requires Kyle's manual DNS entry. In that case, halt with instructions: "Add CNAME record `atrium.unicron.systems` → `cname.vercel-dns.com` in your DNS provider. Then re-dispatch this sprint." Wait for Kyle's confirmation in Slack `#orchestrator-escalations`.

### Task 11 — Scaffold Atrium app shell in unicron-platform

In `unicron-platform/`:
1. Add a route handler that detects `host === 'atrium.unicron.systems'` and serves Atrium; otherwise serves the existing Metacron operator console. Use Vite's environment-aware routing or a top-level `<App>` switch on `window.location.hostname`.
2. Install Supabase Auth UI components if not already
3. Implement sign-in screen at `/atrium/login` (or `/login` when host is atrium):
   - Two options: "Continue with Google" (Supabase Google OAuth) and email magic link
   - On callback, check authenticated user's email against `ATRIUM_EMAIL_ALLOWLIST` env var
   - If not in allowlist, sign out, show "Access denied. Contact Kyle if you should have access." page
   - If in allowlist, look up `nervous_system.team_members` row by email; create one if missing (only for emails in allowlist); set session
4. Implement layout shell:
   - Top header: Atrium logo (placeholder text "Atrium"), status pulse skeleton (4 grey dots), user avatar with sign-out
   - Left nav: 8 tabs (Now, People, Work, Money, Marketing, Products, System, Library) all rendering "Coming in Sprint X" placeholder
   - Default route: `/` shows Now tab placeholder: "Welcome, [name]. Atrium is being built. Today: [date]."
5. Add env vars to Vercel for unicron-platform:
   - `ATRIUM_ENABLED=true`
   - `ATRIUM_EMAIL_ALLOWLIST=kyle@unicron.systems,keenan@unicron.systems,curtis@unicron.systems,team@unicron.systems`
6. Feature flag: when `ATRIUM_ENABLED !== 'true'`, the host check returns 404 for atrium.unicron.systems (fail-closed)

### Task 12 — Multi-Vercel verification

Run via Vercel CLI:
- `vercel inspect --scope <team>` for Pathfinder; expect green
- `vercel inspect --scope <team>` for unicron-platform; expect green
- `curl https://atrium.unicron.systems/atrium/login` returns the sign-in page
- Smoke-test `/api/ingest` with a sample call payload; expect 200 with `records` status (use a small fake transcript)
- Verify the smoke-test call resulted in a ledger row, vault doc, action item, and Notion card; assert all four exist

### Task 13 — Document and continuity-log

1. Append to `unicron-knowledge/Memory/elder/continuity.md`:

```markdown
## 2026-MM-DD — Sprint 1 ratified
- **Type:** architectural_decision
- **Made_by:** Master Conductor (autonomous), per Kyle's Sprint 0 verification
- **Made_to:** the company itself
- **Substance:** Sprint 1 of the Nervous System / Atrium build-out completed. Call ingest pipeline operational (Fathom primary; Plaud per status). nervous_system.customers table provisioned and seeded with Zedcor. atrium.unicron.systems serves auth-gated empty shell with email allowlist (kyle, keenan, curtis, team @unicron.systems). Kanban writer routes action items per Addendum 1.
- **Evidence:** PR <url>, commit <sha>, kanban card <link>
- **Active_until:** indefinite
- **Supersedes:** none
```

2. Stub `unicron-knowledge/Memory/wiki/whats-connected.md` (or update if Sprint 6 already started):
   - Section: Recorders. Fathom: status, who's connected. Plaud: status, who's connected.
   - Section: Atrium. Domain, auth methods, allowlisted emails.
   - Section: Notion kanbans. Three databases with ids and surfaces.

---

## Hard halt conditions

- Pre-conditions fail
- Migration cannot apply (schema conflict, missing extension)
- DNS provisioning requires manual Kyle step (halt with instructions, wait for confirmation)
- Notion MCP fails to create cards consistently (3+ attempts on different cards)
- Taboo Keeper unavailable for more than 15 minutes
- Pathfinder or unicron-platform fails to build
- Atrium auth flow fails the smoke test (allowlisted email cannot sign in, or non-allowlisted email is admitted)
- Smoke-test ingest call does not result in all four artifacts (ledger row, vault doc, action item, Notion card)

---

## Auto-merge criteria

PR auto-merges only if ALL of:
- All migrations applied cleanly
- All Task 4-9 modules pass type-check and unit tests (write minimal unit tests for taboo-keeper, ingest-call, kanban-writer)
- `/api/ingest` smoke test returns 200 with records and all four artifacts created
- `atrium.unicron.systems` returns the sign-in page
- Allowlisted-email smoke test signs in successfully; non-allowlisted-email smoke test is rejected
- Pathfinder Vercel deployment succeeds
- unicron-platform Vercel deployment succeeds
- PR description contains verbatim evidence (per Sprint 0 PR description requirements; same 8-item list adapted for Sprint 1 specifics)

---

## Auto-revert triggers

Revert and notify if observed within 30 minutes of merge:
- Either Vercel project becomes unhealthy
- `/api/ingest` returns 5xx on real Fathom webhook traffic
- Existing Pathfinder customer-facing routes regress

---

## Kanban hygiene — end of sprint

- All criteria met AND PR merged → **Deployed**, append `Implemented at <commit-sha> · merged at <ISO timestamp>` to card body
- Criteria met but PR awaiting review → **Review**
- One or more criteria failed → **Bug Fixes**, document failure in card body
- Hard halt triggered → back to **Backlog** with halt reason

Do NOT promote to Verified.

---

## Done criteria

1. `nervous_system.customers` exists, Zedcor seeded
2. Per-team-member ingest config shape is in `team_members.config`; Kyle, Keenan, Curtis all have the shape
3. Taboo Keeper function is callable and validates against `Memory/taboos.md`
4. Ingest base library functions all typed and tested
5. Call ingest skill returns one of `records | NO_SIGNAL | ABSTAIN` for a real Fathom webhook payload
6. `/api/ingest` real handler operational; smoke test produces all four artifacts
7. Fathom webhook configured for at least one team_member account; tested with a real call
8. Plaud handler either operational or documented as deferred with reason
9. Kanban writer routes per Addendum 1 across all three kanbans
10. `atrium.unicron.systems` resolves and serves the sign-in page
11. SSO (Google) and magic link both work
12. Email allowlist enforced (allowlisted in, non-allowlisted out)
13. Atrium shell renders 8-tab layout with placeholders
14. Pathfinder and unicron-platform both deploy healthy
15. Continuity log entry appended
16. `whats-connected.md` stubbed or updated with Sprint 1 state

---

## Out of scope

Defer to later sprints:
- Slack Orchestrator app (Sprint 2)
- Persistent agent runtime for Analyst, Elder (Sprint 3)
- Atrium tab content (Home, People, Work, Money, Marketing, Products, System, Library) — Sprints 2 through 7 fill these
- Voice memo and Apple Notes ingest (Sprint 4)
- Email ingest (Sprint 5)
- Wiki content authoring (Sprint 6)
- PWA wrapping (Sprint 7)

Begin.
