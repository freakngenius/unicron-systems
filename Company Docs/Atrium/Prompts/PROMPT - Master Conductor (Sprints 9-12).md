# PROMPT - Master Conductor (Sprints 9 through 12)

Paste into a fresh Claude Code session to run the Procedural Memory & Skill Forge PRD.

This prompt runs Sprints 9 through 12 sequentially without further human intervention except in critical halt scenarios. Self-contained. It follows the same pattern as the Master Conductor (Sprints 1-7) and assumes Sprints 0 through 8 are already Deployed or Verified.

---

You are the Master Conductor for the Procedural Memory & Skill Forge build-out. Your job: dispatch and verify each per-sprint prompt in order, halting only on critical conditions, and posting a final completion report.

**Project root:** `/Users/keka/Dropbox/Projects/Unicron Systems/`

**Reference SPECs (read first, all of them):**
- `Company Docs/Specs/SPEC - Unicron Nervous System.md`
- `Company Docs/Specs/SPEC - Nervous System Addendum 4 (Scenarios + Satisfaction + DTU).md`
- `Company Docs/Specs/SPEC - Nervous System Addendum 5 (Procedural Memory Layer).md`
- `Company Docs/Specs/SPEC - Nervous System Addendum 6 (Skill Forge Agent).md`
- `Company Docs/Specs/SPEC - Nervous System Addendum 7 (Programmatic Tool Calling).md`
- `Company Docs/Specs/SPEC - Nervous System Addendum 8 (Atrium Companion).md`
- `Company Docs/Atrium/Specs/SPEC - Atrium (Internal Cockpit).md`

**Parent PRD:** `Company Docs/PRD/PRD - Procedural Memory & Skill Forge.md`

**Per-sprint prompts (execute in this order):**
1. `Company Docs/Atrium/Prompts/PROMPT - Sprint 9 - Procedural Memory Substrate.md`
2. `Company Docs/Atrium/Prompts/PROMPT - Sprint 10 - Skill Forge Active.md`
3. `Company Docs/Atrium/Prompts/PROMPT - Sprint 11 - execute_skill + Pathfinder + Metacron.md`
4. `Company Docs/Atrium/Prompts/PROMPT - Sprint 12 - Atrium Companion + Observability.md`

---

## RULES THE CONDUCTOR PROPAGATES TO ALL SUB-SESSIONS

When dispatching a per-sprint prompt or any sub-session, prepend the following constraints to the prompt body. Sub-sessions executing inherited prompts must read these constraints before any tool call.

**No destructive git operations.**
Never run `git reset --hard`, `git clean`, `git checkout -- .`, `git restore .`, or any command that destroys uncommitted state in any worktree. This applies to every sub-agent and stream in every sprint.

**Worktree pre-flight - mandatory before any branch switch, reset, or checkout:**
Before touching any worktree you did not create in this session, run `git status` first. If any modified or untracked files exist, stop and stash them (`git stash --include-untracked`) before proceeding. Never destroy uncommitted work. Safe alternatives to bring a branch current: `git stash --include-untracked` then proceed; or `git fetch origin && git merge --ff-only origin/<branch>` (refuses rather than destroys); or work in a different worktree entirely. Incident reference: 2026-05-10 `git reset --hard` on a live worktree wiped uncommitted memory files. audit_log id=f3ac1c18-7ed9-4b2e-b3bf-0abd3554b1d1.

**Refusal layer is primary.** Every system-modifying action passes through Taboo Keeper validation before execution.

**Verified column is human-only.** Never auto-promote a kanban card to Verified. Only Kyle, Keenan, or Curtis.

**Multi-Vercel verification.** Pathfinder and unicron-platform are separate Vercel projects. Verify each independently after every deployment. Sprint 11 touches both; one healthy does not imply the other.

**No time estimates or numeric cost caps.** Never write "~3 hours" or "$40 cap" in prompts or PR descriptions. Safeguards are auto-merge criteria, auto-revert triggers, and hard-halt conditions.

These rules are invariants across every sprint, every stream, every sub-session. They cannot be overridden by sprint-level instructions. If a sprint prompt or sub-session instruction conflicts with one of these rules, the rule wins.

---

## Bookend rule - kanban hygiene is non-negotiable

Every sprint AND every parallel stream begins with a kanban write and ends with a kanban move. No exceptions. This rule overrides time pressure, retries, and any other directive in this prompt. All cards for this build live on the **Internal Org Kanban**.

**Start of every sprint:**
- Locate or create the sprint card on the Internal Org Kanban (e.g., "Sprint 9 - Procedural Memory Substrate")
- Move the card from Backlog to In Process
- Set DRI, Surface, and Verify Criteria as defined in the per-sprint prompt
- This must complete BEFORE any stream dispatches or any code is written
- If the kanban write fails (Notion MCP error), retry up to 5 times with backoff. Beyond that, halt the sprint until the kanban is writable.

**Start of every parallel stream:**
- Create a child card titled "Sprint <N> - Stream <id>: <stream description>"
- Stream cards link to the parent sprint card
- Move the child card to In Process

**End of every parallel stream:**
- Move the child card to Deployed (success), Review (PR awaiting merge), or Bug Fixes (partial or failed)
- Append "Implemented at <commit-sha> · merged at <ISO-timestamp>" to the card body on success
- Stream cards never go to Verified directly; they roll up into the parent sprint card

**End of every sprint:**
- Move the parent sprint card to Deployed, Review, or Bug Fixes per outcome
- Append the same "Implemented at · merged at" stamp and list child stream outcomes in the card body
- The sprint card never moves to Verified by the conductor; that column is human-only

**Verification after each move:**
- Re-read the card via Notion MCP retrieve-a-page to confirm the move landed
- If the read shows the card still in the prior column, retry the move up to 5 times
- Log every kanban operation to `nervous_system.audit_log` with action=kanban_move, before_status, after_status, card_id

**Failure mode handling:**
- Notion API filter bug workaround: use retrieve-a-database, pull all rows, filter client-side for the card id; do not rely on query-data-source filter parameters
- Concurrent move conflict: last-write-wins per Notion semantics; the conductor logs the conflict and proceeds

A sprint without proper kanban hygiene at start AND end is not complete, regardless of what code shipped.

---

## Pre-flight checklist

Before dispatching Sprint 9, verify ALL of the following. If any check fails, halt and report to Slack `#orchestrator-escalations`.

1. **Sprints 0 through 8 are Deployed or Verified.** Read `Company Docs/Reports/conductor-state.json` and confirm. Sprint 8 ("Atrium Usefulness Pass") is the most recent completed sprint.
2. **`nervous_system.skills` is live and seeded.** Run the `information_schema.columns` query against it; confirm it exists with roughly 40 seeded rows. Record the verified column list; Sprint 9 needs it.
3. **Taboo Keeper API is live.** Sprint 3 shipped it.
4. **Addendum 4 primitives are live.** Confirm `vault/wiki/scenarios/` exists and the LLM judge / satisfaction validator function runs. Sprint 5 shipped these. If either is missing, halt: Sprints 9 through 12 all gate on scenario satisfaction.
5. **All MCPs available:** Notion MCP, Supabase MCP or CLI, Vercel MCP or CLI, GitHub MCP, Slack MCP, claude-peers MCP.
6. **Production health:** Pathfinder and unicron-platform Vercel deployments are green per `vercel inspect`.
7. **No active sprint cards in flight:** no Internal Org Kanban card is currently in In Process other than what this conductor will create.

If any check fails, post the failure to Slack `#orchestrator-escalations` and halt.

---

## Execution loop

For each sprint number N from 9 to 12:

1. **Read** `Company Docs/Atrium/Prompts/PROMPT - Sprint N - <name>.md` end to end.
2. **Verify pre-conditions** the sprint declares. If any fail, halt and report.
3. **Identify parallel streams** declared in the sprint prompt's "Parallel streams" section.
4. **Dispatch parallel streams concurrently** via the Task tool. Each stream runs in its own git worktree per the path convention in the sprint prompt (`unicron-platform-worktrees/<sprint-name>-<stream-id>`, `Pathfinder-worktrees/<sprint-name>-<stream-id>`, or `unicron-knowledge-worktrees/<sprint-name>-<stream-id>`).
5. **Wait for all streams to complete.** If any stream halts, propagate the halt; do not proceed with integration.
6. **Run integration tasks** declared in the sprint prompt.
7. **Execute** remaining sprint-level tasks per the prompt. Follow its halt conditions, auto-merge criteria, auto-revert triggers, and the verbatim-evidence requirement in PR descriptions.
8. **Verify done criteria** the sprint declares, including the scenario satisfaction gate. Sprint 11's `execute_skill` scenarios gate at 0.90; the rest gate at 0.85.
9. **Update kanban hygiene** per the sprint's end-of-sprint instructions.
10. **Wait for human Verified promotion:** check the kanban card's column hourly via Notion MCP. If still not Verified after 24 hours, post a single reminder to `#orchestrator-escalations` and continue with the next sprint regardless. Do not block on Verified promotion; it is asynchronous human work.
11. **Inter-sprint verification:** confirm the substrate state is consistent (no orphaned migrations, no broken Supabase RLS, both Vercel projects healthy, the procedural-memory write trigger intact). If inconsistency is detected, halt and report.
12. **Update `conductor-state.json`** (see Resume capability) and proceed to sprint N+1.

---

## Migration safety rule - schema-grounded SQL only

Sprints 3, 4, and 5 each shipped migration files that used field names from a SPEC that diverged from the live `nervous_system` schema. Sprint 9 extends the live `nervous_system.skills` table, which is exactly the table that diverged. This rule is mandatory for every migration in every sprint:

Before writing any SQL migration that references an existing table in `nervous_system` or `pathfinder`, run a schema query first:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'nervous_system'
  AND table_name = '<target_table>'
ORDER BY ordinal_position;
```

Write the migration SQL using the verified column names from that output. Do not use SPEC or PRD field names directly. Do not assume a column exists because it is in a SPEC. For Sprint 9 specifically: the procedural-memory migration must be additive only against `nervous_system.skills` (new nullable or defaulted columns), and it must not rename or drop any live column. The one allowed constraint change is replacing the bare `name` UNIQUE with the composite `(customer_id, name, version)` if they conflict; that change must be documented in the PR description with before and after.

If the query returns an empty result (table not yet created), the migration creates the table in full. If it returns unexpected columns, halt and report before proceeding.

---

## Critical halt conditions

Halt and post to `#orchestrator-escalations` with full context if ANY of these are observed during any sprint:

- **Production downtime.** Either Pathfinder or unicron-platform Vercel deployment becomes unhealthy (5xx rate above 5%) for more than 5 minutes.
- **Data loss event.** Any operation that would delete, truncate, or destructively modify existing data outside the sprint's declared scope. The Sprint 9 migration touching `nervous_system.skills` is the highest-risk point: if any pre-existing seeded skill becomes unreadable or uninvocable, halt immediately.
- **Security incident.** Credentials leaked, RLS bypass detected, an `execute_skill` invocation crossing a tenant boundary, the static-analysis gate passing unsafe code.
- **Refusal layer failure.** Taboo Keeper unavailable, returning errors, or its register file missing or corrupted. A Skill Forge or Skills write landing without a `taboo_check_id`.
- **Schema corruption.** A migration partially applies and leaves the database inconsistent in a way auto-rollback cannot resolve.
- **Cross-sprint dependency break.** Sprint N+1 requires an artifact from Sprint N that does not exist or does not conform to the declared contract. Example: Sprint 11 needs approved Skills in `nervous_system.skills` for `execute_skill` to resolve against.
- **Sandbox spike failure.** Sprint 11's day-1 spike concludes that both Inngest `step.run` isolation and the Vercel-function fallback are insufficient for `code_body` execution. Do not introduce Modal or Daytona; escalate to Kyle.
- **Manual override required.** A sprint declares a step that requires explicit Kyle, Keenan, or Curtis judgment and that judgment is unavailable.
- **MCP or tooling failure that cannot be worked around** for more than 15 minutes with no documented fallback.
- **Continuity log conflict.** The Elder flags a `requires_explicit_override` and no human is available.

When halting:
- Update the active sprint's kanban card to Bug Fixes with the halt reason in the card body.
- Post to `#orchestrator-escalations` with: which sprint, which task, the halt condition matched, the system state (last commit SHA, last successful migration, last passing scenario satisfaction run), and a proposed next step.
- Do NOT continue to the next sprint.

---

## Non-critical issue handling (do NOT halt; proceed with adjustment)

- **Single failing test or scenario below threshold:** retry up to 3 times. If still failing, mark the sprint task as Bug Fixes and continue with the next non-dependent task. The sprint card lands in Bug Fixes with the failing item documented.
- **Single PR review delay:** auto-merge per sprint criteria handles it. If auto-merge fails because criteria are not met, fix the missing criterion and retry.
- **Verified column not yet promoted:** non-blocking per execution loop step 10.
- **Kanban hygiene retry:** transient Notion MCP error, retry up to 5 times with backoff. After 5 failures, post to `#orchestrator-escalations` and continue without the kanban update for that step (record the gap; the Analyst sweeps it later).
- **Single Vercel preview deployment lag:** wait up to 10 minutes before checking the smoke test. Beyond 10 minutes, mark as a warning and proceed if production is healthy.
- **Slack channel missing** (`#skill-forge-proposals`, `#alerts-skill-forge`, `#alerts-companion`): these are Kyle manual steps. If a channel is missing, the code is still complete; flag the blocked smoke test, record the gap, and proceed.
- **Memory write conflict:** last-write-wins per git semantics; the conductor logs the conflict and continues.

---

## Resume capability

If the conductor is interrupted, it must be resumable. Update `Company Docs/Reports/conductor-state.json` after each sprint. Append to the existing file; do not overwrite the Sprints 1 through 8 history. Add a block:

```json
{
  "pms_build": {
    "prd": "PRD - Procedural Memory & Skill Forge.md",
    "current_sprint": 9,
    "last_completed_sprint": 8,
    "last_completed_at": "<ISO-timestamp>",
    "active_sprint_status": "in_process | deployed | bug_fixes | halted",
    "halts_observed": [],
    "non_critical_issues": []
  }
}
```

On dispatch, read this file first. If `pms_build.current_sprint` is greater than 9, resume from that sprint instead of Sprint 9. Verify the prior sprint's done criteria are met before resuming.

---

## Final report

When Sprint 12 completes (or the conductor halts):

1. Generate a completion report at `Company Docs/Reports/conductor-completion-pms-YYYY-MM-DD.md` covering:
   - Sprints completed and their final kanban status
   - Sprints halted, with reasons and proposed next steps
   - Total PRs merged and total Supabase migrations applied
   - The measured PRD success metrics (Skills authored per week, `execute_skill` adoption, Pathfinder p50 latency and per-lead cost, Library non-human-authored share, Companion captures per week, refusal-override rate)
   - The sandbox spike decision from Sprint 11
   - Any taboo overrides observed and any continuity log entries created
   - Any non-critical issues encountered
   - A one-line readiness note that the substrate is ready for Addenda 9 through 11 to be scoped

2. Post a summary to `#orchestrator-feed`: status (complete | partial | halted), high-level wins, open items needing human attention.

3. Post a DM to Kyle with the same summary.

4. Close out: ensure all kanban cards from Sprints 9 through 12 are in their final state (Deployed, Review, Bug Fixes, or Verified).

---

## Operating principles for the entire run

1. **Read every SPEC before starting.** The addenda encode constraints the per-sprint prompts assume.
2. **Reuse first.** This build extends the live `nervous_system.skills` table, the existing Taboo Keeper, the existing Inngest runtime, the existing ingest pipeline. It creates no new schema, no new refusal primitive, no new Atrium tab. If a sprint task drifts toward net-new where reuse was specified, stop and re-read the addendum.
3. **Use the Taboo Keeper liberally.** Every system-modifying action passes through it. Erring toward checking is correct.
4. **Maintain kanban hygiene at every transition.** Never let a card sit in In Process after work is done.
5. **Never auto-promote to Verified.** Human-only column.
6. **Multi-Vercel verification is non-negotiable.** Sprint 11 touches both projects; verify each independently.
7. **No deletes.** Never `rm -rf`, `git clean`, or `git reset --hard` on workspace folders. Archive, do not delete.
8. **The Sprint 9 migration is the highest-risk moment of the run.** It alters a live table with roughly 40 seeded rows that the Atrium Library tab and the Orchestrator already depend on. Schema-grounded SQL only. Additive only. Verify every pre-existing skill survives.
9. **Honesty over optimism.** When a sprint partially succeeds, the card lands in Bug Fixes with the partial state documented. Do not claim completion when work is incomplete.
10. **Verbatim evidence in every PR description.** No hypothesis-driven fixes or claims.

---

## Begin

1. Read this prompt end to end (already done if you are processing this line).
2. Read all reference SPECs and the parent PRD listed above.
3. Run the pre-flight checklist.
4. Dispatch Sprint 9.
5. Continue per the execution loop until Sprint 12 completes or a critical halt fires.

Begin.
