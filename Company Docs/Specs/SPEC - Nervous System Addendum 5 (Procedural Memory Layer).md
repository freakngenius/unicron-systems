# SPEC Addendum 5 - Procedural Memory Layer

**Status:** Draft for engineer + Master Conductor handoff
**Parent SPECs:** SPEC - Unicron Nervous System.md, Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md
**Companions:** Addendum 1 (Kanban Surface Routing), Addendum 2 (Skills + Karpathy + Refero), Addendum 4 (Scenarios + Satisfaction + DTU)
**Date:** 2026-05-14
**Owner:** Kyle Kesterson
**Parent PRD:** PRD - Procedural Memory & Skill Forge.md

This addendum adds a third memory tier (procedural) to the Nervous System by extending the live `nervous_system.skills` table and adding two companion tables. It stores runnable, refusal-gated, decay-aware Skills authored by humans, by Skill Forge (Addendum 6), or imported from an external SKILL.md artifact.

Merge into the parent SPEC at v0.6 after Sprint 9 ships.

---

## 1. Reuse-first principle

`nervous_system.skills` already exists. It was created in Sprint 3 and is seeded with roughly 40 skills across Sprints 3 through 6. The Atrium Library tab and the Now tab skills surface already read it. The Slack Orchestrator and the Atrium skills run endpoints already invoke against it.

This addendum extends that table. It does not replace it, rename it, or migrate off it.

**Mandatory before writing the migration.** Run this query and write the ALTER TABLE against the verified column names, not against the names in this document:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'nervous_system' AND table_name = 'skills'
ORDER BY ordinal_position;
```

Known live columns as of 2026-05-14 (verify, do not assume): `id`, `name` (unique), `description`, `domain`, `type` (manual | scheduled | triggered), `inputs_schema`, `outputs_schema`, `schedule_cron`, `trigger_event`, `refusal_gate`, `budget_usd_per_run`, `active`, `status` (active | scaffolded | deprecated), `run_endpoint`, `repo`, `skill_md_path`, `created_at`, `updated_at`. The Sprint 3 migration file and the live schema diverged once already (column alignment patches #233 and #234); trust the query output.

---

## 2. Schema extension

### 2.1 Columns added to `nervous_system.skills`

All additive, all nullable or defaulted, so the migration cannot break a live row. Do not rename or drop any existing column.

| Column | Type | Purpose |
|---|---|---|
| `lifecycle_status` | text NOT NULL DEFAULT 'approved' | Approval lifecycle, distinct from the existing `status` column. CHECK in ('proposed','approved','retired','rejected'). Existing seeded rows default to 'approved'. |
| `version` | int NOT NULL DEFAULT 1 | Version number within a name lineage. |
| `parent_skill_id` | uuid REFERENCES nervous_system.skills(id) | Lineage pointer for a new version of an existing Skill. |
| `code_body` | text | Optional executable body for `execute_skill` (Addendum 7). Null for recipe-only Skills. |
| `code_hash` | text | sha256 of `code_body` for diff and audit. |
| `source_run_id` | uuid | The ledger trajectory that birthed this Skill. Null for hand-authored Skills. |
| `evidence` | jsonb NOT NULL DEFAULT '[]'::jsonb | Array of ledger row pointers backing the Skill. |
| `author_kind` | text NOT NULL DEFAULT 'human' | CHECK in ('human','skill_forge','imported'). |
| `author_id` | uuid | `team_members.id` or `agents.id` depending on `author_kind`. |
| `approved_by` | uuid REFERENCES nervous_system.team_members(id) | Human approver. |
| `approved_at` | timestamptz | Approval timestamp. |
| `taboo_check_id` | uuid | Taboo Keeper signoff record. References the live taboo-check audit row. |
| `run_count` | int NOT NULL DEFAULT 0 | Total invocations. |
| `success_count` | int NOT NULL DEFAULT 0 | Successful invocations. |
| `last_run_at` | timestamptz | Last invocation timestamp. Drives decay. |
| `decay_at` | timestamptz | Archive after this timestamp if unused. Set at creation from the decay default. |
| `customer_id` | uuid | NULL means a system Skill. Non-null scopes the Skill to a tenant. References the live customers table. |
| `embedding` | vector(1536) | Semantic search vector. |
| `fts` | tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(name,'') \|\| ' ' \|\| coalesce(description,''))) STORED | Exact-match recall. |

Notes for the engineer:

- The existing `status` column stays as-is and keeps its meaning (visibility and activation: active, scaffolded, deprecated). `lifecycle_status` is the new approval-state column. Do not overload `status`.
- The existing `name` column is the stable human-readable identifier. The original PRD draft called this `slug`. Use `name`. Do not add a `slug` column.
- The existing `inputs_schema` and `outputs_schema` columns are the JSON Schema for invocation args and return shape. Do not add `inputs_schema`/`outputs_schema` again under different names.
- The procedural "recipe" representation aligns to the existing SKILL.md convention from Addendum 2. The `skill_md_path` column already points at the SKILL.md artifact. A Skill's step recipe lives in that SKILL.md. Do not introduce a competing `steps` JSONB column unless the engineer confirms the SKILL.md path cannot carry it; if it must be a column, name it `steps` and document why.
- `version` plus `name` plus `customer_id` should be unique together. Add `UNIQUE (customer_id, name, version)` only if it does not conflict with the existing `name` UNIQUE constraint. If it does conflict, drop the bare `name` UNIQUE and replace with the composite. This is the one allowed constraint change; flag it explicitly in the PR description with before and after.

### 2.2 Indexes added

```sql
CREATE INDEX IF NOT EXISTS skills_fts_idx ON nervous_system.skills USING gin(fts);
CREATE INDEX IF NOT EXISTS skills_embedding_idx ON nervous_system.skills USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS skills_lifecycle_idx ON nervous_system.skills(lifecycle_status, decay_at);
CREATE INDEX IF NOT EXISTS skills_customer_idx ON nervous_system.skills(customer_id, lifecycle_status);
```

### 2.3 `nervous_system.proposed_skills` (net-new)

Skill Forge writes here, never to `skills` directly.

```sql
CREATE TABLE nervous_system.proposed_skills (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_skill     jsonb NOT NULL,            -- full pre-persist Skill payload
  customer_id        uuid,                      -- NULL = proposed system Skill
  source_run_id      uuid NOT NULL,
  trajectory_summary text NOT NULL,
  satisfaction_score numeric(3,2),              -- Addendum 4 judge output
  confidence         text CHECK (confidence IN ('medium','high')),
  taboo_check_id     uuid,                      -- Taboo Keeper dry-run record
  taboo_flags        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status             text NOT NULL CHECK (status IN ('queued','approved','rejected','expired')),
  reviewed_by        uuid REFERENCES nervous_system.team_members(id),
  reviewed_at        timestamptz,
  rejection_reason   text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE INDEX proposed_skills_status_idx ON nervous_system.proposed_skills(status, created_at);
CREATE INDEX proposed_skills_customer_idx ON nervous_system.proposed_skills(customer_id, status);
```

### 2.4 `nervous_system.skill_invocations` (net-new)

One row per `execute_skill` call (Addendum 7).

```sql
CREATE TABLE nervous_system.skill_invocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id       uuid NOT NULL REFERENCES nervous_system.skills(id),
  skill_version  int NOT NULL,
  caller_kind    text NOT NULL CHECK (caller_kind IN ('orchestrator','agent','human','cron')),
  caller_id      uuid,
  customer_id    uuid,
  inputs         jsonb NOT NULL,
  outputs        jsonb,
  status         text NOT NULL CHECK (status IN ('running','succeeded','failed','refused')),
  refusal_reason text,
  cost_cents     int,
  latency_ms     int,
  inngest_run_id text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

CREATE INDEX skill_invocations_skill_idx ON nervous_system.skill_invocations(skill_id, started_at);
CREATE INDEX skill_invocations_customer_idx ON nervous_system.skill_invocations(customer_id, started_at);
```

---

## 3. RLS

Follows the existing `nervous_system` RLS pattern (service role bypasses; reads scoped).

- `nervous_system.skills`: read allowed where `customer_id IS NULL` (system Skill) OR `customer_id = auth_customer_id()`. Writes only via service role. Every write carries a `taboo_check_id` (see section 5).
- `nervous_system.proposed_skills`: read allowed for the Atrium operator allowlist (Kyle, Keenan, Curtis) on system proposals, and for the customer admin of the proposing tenant on per-tenant proposals. Writes only via service role.
- `nervous_system.skill_invocations`: read scoped by `customer_id`. System invocations readable by the operator allowlist. Writes only via service role.

All three tables: `ENABLE ROW LEVEL SECURITY`. Every write logged to `nervous_system.audit_log` per the existing audit pattern.

---

## 4. API surface

Internal HTTP endpoints. Mount under the existing Atrium API route group in `unicron-platform`. Mirror the existing skills run endpoint conventions.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/skills` | List Skills, scoped by tenant, filter by `lifecycle_status` and `status` |
| GET | `/api/skills/:id` | Fetch one Skill with version history (walk `parent_skill_id`) |
| POST | `/api/skills/search` | Hybrid FTS plus vector search with reciprocal rank fusion, returns ranked Skills |
| POST | `/api/skills/:id/invoke` | Run a Skill. In Sprint 9 this is a thin pass-through to the existing tool runner. In Sprint 11 it routes through `execute_skill` (Addendum 7). |
| GET | `/api/proposed-skills` | Queue for human reviewers |
| POST | `/api/proposed-skills/:id/approve` | Promote to `skills`, runs Taboo Keeper first |
| POST | `/api/proposed-skills/:id/reject` | Mark rejected with reason |

---

## 5. Refusal-gate hooks

Every write to `nervous_system.skills` (insert or version-bump) must carry a `taboo_check_id`. A trigger function rejects writes without it. The approve endpoint calls Taboo Keeper before insert. No exceptions, no service-role bypass even for human-authored Skills. This is consistent with the parent SPEC's "refusal layer is primary" invariant and the HARD CONSTRAINTS in CLAUDE.md.

---

## 6. Decay

Nightly Inngest cron `skills_decay_sweep` (register alongside the existing Analyst `decayTick`):

- Skills with `last_run_at < now() - decay_interval` and `lifecycle_status = 'approved'` become `lifecycle_status = 'retired'`.
- Retired Skills stay in the table for audit and lineage. The UI hides them by default.
- Per-tenant default decay interval: 90 days. System Skill default: 180 days. Overridable per Skill at creation via `decay_at`.
- The first sweep emits an audit report to `nervous_system.audit_log` and posts a one-line summary to `#orchestrator-feed`.

---

## 7. Hybrid search

The Slack Orchestrator and Skill Forge both search Skills via `/api/skills/search`:

1. Embed the query, top-K 20 via ivfflat.
2. Run an FTS query against the same query string, top-K 20.
3. Reciprocal-rank-fuse the two result lists.
4. Filter by `lifecycle_status`, `status`, `customer_id`, and decay.

Hybrid is mandatory. Embeddings miss exact procurement-office names; FTS misses semantic neighbors. Both, always.

---

## 8. Migration

- Single SQL migration file. Name it per the live convention: `unicron-platform/supabase/migrations/<YYYYMMDD>_procedural_memory_layer.sql`.
- The migration: runs the `information_schema` check, ALTERs `nervous_system.skills` additively, creates `proposed_skills` and `skill_invocations`, adds indexes, enables RLS, adds the `taboo_check_id` write trigger.
- No data backfill of existing rows beyond setting `lifecycle_status = 'approved'`, `version = 1`, `author_kind = 'human'` defaults, which the column defaults handle automatically.
- Backfill `embedding` and `fts` for existing rows in a follow-up step (FTS is a generated column so it populates automatically; `embedding` needs an async backfill job, non-blocking).
- Seed three system Skills hand-authored by Kyle to validate the surface end-to-end before Skill Forge ships:
  1. `run_zedcor_weekly_digest`
  2. `onboard_county_records_source`
  3. `draft_briefing_for_bd_rep`
  These may already exist as rows in `nervous_system.skills` from prior sprints; if so, update them in place to carry the new procedural columns rather than inserting duplicates.

---

## 9. Acceptance scenarios (Addendum 4 style)

Stored at `vault/wiki/scenarios/procedural-memory/`. Validated by the LLM judge, satisfaction threshold 0.85.

- **S5.1** A human author writes a Skill via the Library tab. It persists only after Taboo Keeper signoff (`taboo_check_id` present).
- **S5.2** A Skill Forge proposal lands in `proposed_skills` and never bypasses to `skills`.
- **S5.3** Hybrid search returns the seeded `run_zedcor_weekly_digest` for both "Zedcor digest" and "weekly summary for Zedcor."
- **S5.4** A retired Skill is invisible to invocation but visible in the audit log and version history.
- **S5.5** A per-tenant Skill cannot be read by another tenant via any endpoint, including search.
- **S5.6** The migration applies cleanly against the live schema and all roughly 40 pre-existing seeded skills remain readable and invocable with `lifecycle_status = 'approved'`.

---

## 10. What this addendum does NOT do

- It does not create the Skill Forge agent. That is Addendum 6.
- It does not implement `execute_skill`. That is Addendum 7. In Sprint 9 the invoke endpoint is a thin pass-through to the existing tool runner.
- It does not add a Metacron per-tenant Skill Library UI. That is Sprint 11, built on this schema.
- It does not change the existing `status` column semantics or the existing Library tab behavior beyond surfacing the new procedural columns.

End Addendum 5.
