# PROMPT — Sprint 0: Foundation (Unicron Nervous System)

Paste into a fresh Claude Code session. Self-contained. Do not strip the kanban hygiene blocks.

---

You are operating inside Unicron Systems. This sprint is the foundation for the Unicron Nervous System SPEC. Read the full SPEC before touching anything.

**SPEC:** `/Users/keka/Dropbox/Projects/Unicron Systems/Company Docs/Specs/SPEC - Unicron Nervous System.md`

**Project root:** `/Users/keka/Dropbox/Projects/Unicron Systems/`

**This sprint:** stand up the shared substrate the rest of the Nervous System builds on. Specifically:
1. Create the `unicron-knowledge` GitHub repo and migrate `Company Docs/` content into it as the knowledge vault on git
2. Provision Supabase tables for the ledger, action items, signals, break-off signals, team_members, agents, and audit log, plus pgvector
3. Seed `Memory/taboos.md`, `Memory/elder/continuity.md`, `Memory/elder/seven_generations.md` per SPEC sections 10.1, 11.1, 11.2
4. Scaffold the `/api/ingest` Vercel route in the Pathfinder Next.js app (handler stub returning 200; real ingest skill is Sprint 1)
5. Confirm Inngest project is wired; create a placeholder ingest function that the Sprint 1 ingest skill will populate
6. Verify Pathfinder and unicron-platform Vercel deployments are unaffected

You are NOT building the ingest skill, the Orchestrator Slack app, the persistent agents, the kanban writer, or the verify gate in this sprint. Each is its own future sprint per SPEC section 20.

---

## Pre-requisites (read before starting)

The Internal Org Notion Kanban must exist at https://www.notion.so/futuroso/Nervous-System-358785c67e72801a823ac7860c420af8. If it does not exist, halt immediately and report back to Kyle. Do NOT attempt to create it via Notion API; that step happens via Notion AI separately.

Find its data source id via Notion search. Save it as `INTERNAL_KANBAN_DATA_SOURCE_ID` for kanban hygiene operations during this sprint.

---

## Kanban hygiene — start of sprint

1. Locate or create a card titled "Sprint 0 — Foundation (Nervous System)" on the Internal Org Kanban
2. Move it to the **In Process** column
3. Set DRI: Kyle Kesterson
4. Set Surface: Architecture
5. Set Source: Sprint Plan
6. Set Verify Criteria: "All Sprint 0 done criteria from SPEC section 22 met. Pathfinder and unicron-platform Vercel deployments unaffected. unicron-knowledge repo exists with migrated content. Supabase tables provisioned. /api/ingest route returns 200 on smoke test."

---

## Tasks

### Task 1 — Create unicron-knowledge GitHub repo

1. Use the GitHub MCP or `gh` CLI to create a new private repo named `unicron-knowledge` under the same organization as the existing Pathfinder and unicron-platform repos
2. Clone it locally to `/Users/keka/Dropbox/Projects/Unicron Systems/unicron-knowledge/`
3. Initialize with a `README.md` describing the vault purpose, the frontmatter standard from SPEC section 6.3, and the directory layout from SPEC section 6.1

**Hard halt:** if a local directory at `/Users/keka/Dropbox/Projects/Unicron Systems/unicron-knowledge/` already exists with content, halt and report. Do not overwrite.

### Task 2 — Migrate Company Docs into the vault

Copy (do not move) the contents of `/Users/keka/Dropbox/Projects/Unicron Systems/Company Docs/` into the cloned vault at the matching folder names. The source `Company Docs/` directory remains intact for now; retirement is a future sprint.

Verify: every file in source has a counterpart in destination. If any file is missing in destination, halt and report.

Do NOT use `rm`, `git clean`, `git reset --hard`, or any destructive operation on either source or destination. Use `cp` only.

### Task 3 — Create new vault directories

Inside the cloned `unicron-knowledge/`, create the new top-level directories listed in SPEC section 6.1:
- `Decisions/`
- `Calls/`
- `Retros/`
- `Memory/`
- `Memory/orchestrator/`
- `Memory/analyst/`
- `Memory/elder/`
- `Memory/cowork/`
- `Inbox/`

Each new directory gets a `.gitkeep` file so empty directories track in git.

### Task 4 — Migrate MEMORY into the vault

Copy contents of `/Users/keka/Dropbox/Projects/Unicron Systems/MEMORY/` into the vault's `Memory/` directory at the matching subdirectory structure. Source `MEMORY/` directory remains intact (referenced by tooling per project memory).

### Task 5 — Seed Memory/taboos.md

Create `unicron-knowledge/Memory/taboos.md` with frontmatter and the initial register from SPEC section 10.1. Use this exact content:

```markdown
---
type: taboo
status: active
last_reviewed: 2026-05-05
reviewers: [Kyle Kesterson, Keenan Hock]
ttl_days: permanent
---

# Unicron Taboos

Refusal register. Human-edited only. Agents read; agents do not write. PRs to this file require explicit Kyle or Keenan approval and a continuity log entry from the Elder.

## Domain refusals
- We will not build for industries that deepen extraction of human attention, labor, or dignity.
- We will not optimize for time-on-site, engagement loops, or attention capture.
- We will not take contracts with militaries, weapons systems, or autonomous targeting.
- We will not enable training on or output of content that harms children.

## Operational refusals
- We will not enclose commons we benefit from.
- We will not take actions on behalf of a user without their ability to veto.
- We will not deploy agents without time-horizon review on irreversible decisions.
- We will not hide the refusal layer from users or competitors.

## Process refusals
- We will not promote work to Verified without a human reviewer.
- We will not auto-merge PRs without verbatim evidence in the PR description.
- We will not write production code from Cowork chats.
- We will not delete uncommitted work or run `git clean`, `git reset --hard`, or `rm -rf` on workspace folders.
```

### Task 6 — Seed Memory/elder/continuity.md

Create `unicron-knowledge/Memory/elder/continuity.md` with this initial entry:

```markdown
---
type: continuity
status: active
ttl_days: permanent
last_touched: 2026-05-05
---

# Unicron Continuity Log

Append-only. The Elder reads this file before advising any planning Cowork session. Entries are never edited or deleted; superseding entries point back to predecessors.

## 2026-05-05 — Nervous System SPEC v0.1 ratified
- **Type:** architectural_decision
- **Made_by:** Kyle Kesterson, Keenan Hock
- **Made_to:** the company itself
- **Substance:** Unicron Systems commits to running on the Nervous System architecture defined in SPEC v0.1. Multi-tenant from day zero. Refusal layer (Taboo Keeper) public and structural. Continuity log (Elder) preserves prior commitments. Decay on every artifact. Knowledge vault on git. R3 architectural hooks in schema; cap-table mechanics deferred to a separate Kyle-and-Keenan conversation.
- **Evidence:** specs/SPEC - Unicron Nervous System.md (in this vault, migrated from /Users/keka/Dropbox/Projects/Unicron Systems/Company Docs/Specs/)
- **Active_until:** indefinite
- **Supersedes:** none
```

### Task 7 — Seed Memory/elder/seven_generations.md

Create `unicron-knowledge/Memory/elder/seven_generations.md`:

```markdown
---
type: seven_generations
status: active
ttl_days: permanent
last_touched: 2026-05-05
reviewers: [Kyle Kesterson, Keenan Hock]
---

# Seven Generations

What this organism will not break. Who is downstream of our decisions. What flows back.

## What we will not break
- Commitments to existing customers (current: Zedcor; future: any tenant onboarded under the Pathfinder or Metacron contract terms)
- Public statements made by Kyle or Keenan on behalf of Unicron
- Architectural decisions ratified in the continuity log without superseding entries
- Contributor relationships with advisors and warm network (current: Curtis Smith)

## Who is downstream
- Future team members who join Unicron and inherit the company they did not design
- Future customers whose data feeds the cross-pollination engine
- Practitioners whose playbooks our agents learn from
- The agent fleet itself, whose accumulated memory is a public good across customer cohorts

## What flows back (R3 architectural hooks; mechanics TBD)
- Contributor share for warm-network introductions and discovery participation
- Equity or revenue participation for practitioner data that compounds the platform
- Open patterns and tooling that revert to shared infrastructure (R5; founder decision)

## Open decisions routed to Kyle and Keenan
- R3 cap-table mechanics: contributor_share_pct values, share_basis definitions, when a relationship triggers active=true on reciprocity_hooks
- R5 commons reversion: which substrate elements are public, which stay private moat
- Restorative vertical filter for Pathfinder customer selection

This file is versioned (edited via PR). Edits require continuity log entry.
```

### Task 8 — Provision Supabase tables

Use the Supabase MCP. Create migration files under the existing `supabase/migrations/` directory in the appropriate project. Follow the existing migration naming convention.

Create these tables exactly as defined in SPEC sections 4.1, 4.2, 5.1, 5.2, 5.3, 5.4 (including the `reciprocity_hooks` jsonb column on `team_members` and `agents`):
- `team_members`
- `agents`
- `ledger` (with pgvector embedding column)
- `action_items`
- `signals`
- `break_off_signals`
- `audit_log` (per SPEC section 18.3; minimal schema: id, table_name, action, actor_id, payload jsonb, created_at)

Use `CREATE TABLE IF NOT EXISTS` and `CREATE EXTENSION IF NOT EXISTS vector` to make the migration idempotent.

**Hard halt:** if any of these table names already exist with conflicting schemas, halt and report. Do not migrate destructively.

Apply RLS policies per SPEC section 18.2.

Create the `semantic_search` RPC per SPEC section 5.5 (basic version: takes query_text and limit, returns ranked ledger rows). The embedding generation trigger can be a placeholder for now; Sprint 1 wires the real embedding call.

### Task 9 — Seed team_members and agents

Insert seed rows:

team_members:
- Kyle Kesterson, kyle@freakngenius.com, founder, default_kanban_surface=pathfinder, active=true
- Keenan Hock, [email TBD - leave null], cofounder, default_kanban_surface=discovery, active=true
- Curtis Smith, [email TBD - leave null], advisor, default_kanban_surface=discovery, active=true

agents:
- Orchestrator (archetype=orchestrator, active=false until Sprint 2 builds the Slack app, budget shape with 0 spent and a placeholder limit)
- Analyst (archetype=analyst, active=false until Sprint 3)
- Elder (archetype=elder, active=true from this sprint; can be queried via continuity log even before its agent runtime exists)
- Taboo Keeper (archetype=taboo_keeper, active=true from this sprint; reads taboos.md)

For each, set `reciprocity_hooks` to `{"contributor_share_pct": 0, "share_target": null, "share_basis": null, "active": false}`.

### Task 10 — Scaffold /api/ingest in Pathfinder

Inside `Pathfinder/app/api/ingest/route.ts`, create a handler stub:
- Method: POST
- Auth: requires header `x-unicron-api-key` matching an env var `UNICRON_INGEST_API_KEY`
- Validates input shape per SPEC section 7.3 (source_type, source_id, source_url, raw_content, participants, captured_at, captured_by) using Zod
- Returns 200 with `{status: "received", echo: <input>, note: "Ingest skill not yet implemented; Sprint 1"}`
- Returns 401 if api key missing or invalid
- Returns 400 if input fails validation

Add `UNICRON_INGEST_API_KEY` to Pathfinder's environment config (Vercel + .env.local example). Do not generate the actual secret value; set it to `placeholder_set_in_vercel_dashboard` in code and instruct Kyle in the PR description to set the real value in Vercel.

### Task 11 — Inngest placeholder function

Confirm the Inngest project linked to Pathfinder is operational. Create a placeholder function `ingest-router` that listens on event `unicron/ingest.received` and currently does nothing except log the event payload. Sprint 1 will wire this to the real ingest skill.

### Task 12 — Verify Pathfinder and unicron-platform unaffected

Run multi-Vercel verification:
- `cd Pathfinder && npm run build` succeeds
- `cd unicron-platform && npm run build` succeeds
- Smoke test the deployed `/api/ingest` route on the Pathfinder preview deployment with a sample payload; expect 200

Both projects deploy independently. Confirm each via Vercel MCP. Do not conflate.

---

## Hard halt conditions

Halt and report immediately if any of the following:
- Internal Org Kanban does not exist on the Notion page
- Local `unicron-knowledge` directory exists with content before this sprint runs
- Any source file in `Company Docs/` has no counterpart in destination after migration
- Any Supabase table conflicts with existing schema (different columns, different types)
- Pathfinder or unicron-platform fails to build after the changes
- The `/api/ingest` smoke test returns anything other than 200 with the expected payload echo
- Any tooling needed to complete the sprint is missing or unreachable (GitHub MCP, Supabase MCP, Notion MCP, Vercel MCP)

On halt: do not retry, do not work around, do not proceed to subsequent tasks. Post the halt reason to the PR description (or to Slack `#orchestrator-escalations` if PR not yet open) and stop.

---

## Auto-merge criteria

PR auto-merges only if ALL the following are true:
- All migrations applied cleanly (verifiable via `supabase migration list`)
- `unicron-knowledge` repo created and visible in GitHub
- Vault contains every file from `Company Docs/` plus the new directories and seeded files
- All seed memory files (taboos, continuity, seven_generations) present with the exact content above
- `/api/ingest` route returns 200 on smoke test with valid payload, 401 on missing key, 400 on invalid input
- Pathfinder Vercel deployment succeeds
- unicron-platform Vercel deployment succeeds
- PR description contains verbatim evidence (see below)

Any failure: do not auto-merge. Mark PR as Draft with the failing criterion in the description.

---

## Auto-revert triggers

Revert and notify if observed within 30 minutes of merge:
- Pathfinder production deployment becomes unhealthy (5xx rate above baseline)
- unicron-platform production deployment becomes unhealthy
- Any Supabase query against existing tables (`pathfinder.*` or `unicron.*` schemas other than the new tables) returns errors

Revert mechanism: `git revert <merge_commit>`, push, redeploy. Do not `git reset --hard` or rewrite history.

---

## PR description requirements (verbatim evidence)

The PR description MUST include, in this order:
1. Link to the SPEC: `Company Docs/Specs/SPEC - Unicron Nervous System.md`
2. List of every file created or modified, with line counts
3. Output of `supabase migration list` after applying migrations
4. URL of the new `unicron-knowledge` GitHub repo
5. Diff of `Pathfinder/app/api/ingest/route.ts` (verbatim)
6. Sample curl invocation of `/api/ingest` and the verbatim 200 response
7. Pathfinder Vercel deployment URL and status
8. unicron-platform Vercel deployment URL and status
9. Confirmation that source `Company Docs/` and `MEMORY/` directories are intact (not deleted)
10. Notion link to the Sprint 0 kanban card

No hypothesis-driven claims. Every statement must be verifiable from the evidence in the PR description.

---

## Kanban hygiene — end of sprint

Based on actual outcome:
- All auto-merge criteria met AND PR merged: move card to **Deployed**. Append to card content: `Implemented at <commit-sha> · merged at <ISO timestamp>`
- All auto-merge criteria met but PR awaiting review: move card to **Review**
- One or more criteria failed: move card to **Bug Fixes**, write the specific failure in card body
- Hard halt triggered: move card back to **Backlog**, write the halt reason in card body

Do NOT move the card to **Verified**. That column is human-only; only Kyle moves cards there.

---

## Out of scope for this sprint

Do not start any of the following in Sprint 0:
- Real ingest skill implementations (Sprint 1)
- Slack app for the Orchestrator (Sprint 2)
- Persistent Analyst or Elder runtime (Sprint 3)
- iOS shortcuts for voice memo or Apple Notes (Sprint 4)
- Email ingest, multi-fork sprint contract, full bounded peer attention (Sprint 5)
- Retiring the source `Company Docs/` and `MEMORY/` directories (future sprint after Sprint 0 stabilizes)
- Any change to Pathfinder or Metacron customer-facing features

Begin.
