# Computer Agent — Verifier

**Status:** New
**Layer:** 1
**Coordination pattern:** Generator-Verifier (Anthropic-named pattern)
**Schedule:** Event-driven (triggered by Ranker writes)

## Purpose

Reviews the Ranker's output before it ships to reps. Checks rationale for hallucinated facts, branch attribution accuracy, score sensibility, and customer-reference validity. Implements the explicit quality gate from the original Anthropic coordination pattern set.

## Reads

- `pathfinder.projects` (where `verified IS NULL`)
- `pathfinder.branches` (verify nearest_branch geographic accuracy)
- `pathfinder.customers` (verify any customer references in rationale)

## Writes

- Updates `pathfinder.projects` — `verified (bool), verifier_notes (text), verifier_pass_count (int)`
- `pathfinder.agent_log` — verifier decisions, including pass/fail reasons

## Tools

- Supabase MCP (read/write)
- Claude API (Sonnet) for verification reasoning
- Internal scoring functions from `lib/scoring.ts` for branch-attribution check

## Behavior (per cycle)

1. Pull projects where `verified IS NULL` ordered by `ranked_at`
2. For each project, run four checks:
   - **Rationale accuracy:** does the rationale reference facts that appear in `raw_payload` or related branch/customer data? Flag hallucinations.
   - **Branch attribution:** does `nearest_branch_id` match what `lib/scoring.ts` produces given the project's lat/lon? Flag mismatches.
   - **Score sensibility:** is the score within ±15 of what the documented criteria would produce? Flag outliers.
   - **Customer references:** if rationale mentions a customer by name, verify that customer exists in `pathfinder.customers`. Flag fabrications.
3. If all pass: set `verified=true`. Write log entry.
4. If any fail: set `verified=false`, write specific failure reasons to `verifier_notes`, increment `verifier_pass_count`, return to Ranker for re-rank.
5. Max 2 verification loops per project. On 3rd fail, escalate via `agent_log` entry tagged `requires_human_review`.

## Acceptance

- Every newly-ranked project ends with `verified=true` OR is escalated
- Failure notes are specific and actionable, not generic
- `agent_log` shows verifier decisions visibly distinct from Ranker actions
- Loop count never exceeds 2 without escalation
