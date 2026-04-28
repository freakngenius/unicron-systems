# Computer Agent — Eval (Ground-Truth Tester)

**Status:** New
**Layer:** 3
**Coordination pattern:** Generator-Verifier (system tests itself against ground truth)
**Schedule:** Weekly · Sunday 06:00 UTC

## Purpose

Continuously tests the system against the 5 ground-truth missed-project examples Kyle Doenz commits during the discovery call. Reports retroactively: would Pathfinder have caught each project? At what stage? How many days before the security RFP was issued? Tracks system improvement over time as tuning is applied. Produces the partner-approval evidence and the contest submission's traction proof.

## Reads

- `pathfinder.eval_ground_truth` — seed table with 5 missed-project examples (configured in agent prompt; populated from Kyle Doenz's call notes once provided)
- `pathfinder.projects` (full historical record, including raw_payload and ingested_at)
- `pathfinder.agent_log` (system behavior history)

## Writes

- `pathfinder.eval_runs` — `id, ground_truth_id, would_have_caught (bool), days_before_rfp (int), score_at_detection, confidence (high|med|low), notes, run_at`
- Weekly eval summary appended to `pathfinder.briefings` (org-level)
- `pathfinder.agent_log`

## Tools

- Supabase MCP (read/write)
- Claude API (Sonnet) for retrospective reasoning
- USASpending and SAM.gov APIs for historical award data verification

## Behavior (per cycle)

1. For each ground-truth example, simulate retrospectively:
   - Given the project's known properties (location, value, type, RFP date), reconstruct what public signals would have been visible in the 90 days before the RFP issued
   - Determine whether the Ingestor's source set would have surfaced that signal
   - Determine whether the Ranker's current scoring config would have surfaced it as high-priority
   - Compute days-before-RFP if surfaced
2. Generate retrospective: "Pathfinder would have caught Project X 78 days before the RFP, scored 84 (high-priority)"
3. Track week-over-week improvement: as tuning is applied, eval performance should improve
4. Output the eval table and trend chart for the Friday Briefing's org-level digest

## Constraints

- Never use ground-truth examples in the live ranking pipeline (they're test data, not production signal)
- Confidence labels are conservative — flag "low" when retrospective reasoning is hand-wavy

## Acceptance

- Weekly eval run produces explicit days-before-RFP numbers for all 5 ground truths
- Improvement trend visible over rolling 4-week window
- Briefing agent picks up the eval summary and includes it in the Friday org brief
- Dashboard surfaces a small "Eval Health" indicator showing current ground-truth catch rate
