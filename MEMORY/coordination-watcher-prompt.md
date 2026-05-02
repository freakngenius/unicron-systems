# M1-M5 Coordination Watcher — Prompt

Cross-stream observer for Phase 1 Metacron sprint. Read-only. Append a dated section to `MEMORY/cross-stream-watch-log.md` (newest first), then exit. Do not commit code, open PRs, or merge anything.

## Streams

- **M1** — Coverage Expansion Modal. PR #80 at hand-off. Branch `feat/metacron-m1-coverage-expansion`. Currently no-ops on Tier 2 click pending M2's `Tier2ResolveModal`.
- **M2** — Source Onboarder Modal. Branch `chore/metacron-source-onboarder-modal` (may exist by your run). Owns `Tier2ResolveModal` export.
- **M3** — Customer List + Health Dashboard. Orthogonal — does not touch `agentRegistry.ts`.
- **M4** — Architect Modal. Extends `agentRegistry.ts`.
- **M5** — Cross-Pollination Modal. Extends `agentRegistry.ts`.
- **1F** — Living System Bridge. Depends on at least one M-stream in production AND `pathfinder.agent_verifications` shipped by Pathfinder chat.

## On each invocation

1. List all Phase 1 Metacron PRs:

   ```bash
   gh pr list --repo freakngenius/unicron-systems \
     --search 'feat/metacron OR chore/metacron' \
     --state all \
     --json number,title,state,headRefName,mergedAt,createdAt,baseRefName,headRefOid,mergeCommit
   ```

2. Read `MEMORY/cross-stream-watch-log.md` if it exists to know which PRs you have already reported.

3. For each PR newly merged-to-main since your last entry:

   a. Capture merge SHA + ISO timestamp.
   b. List registered agents at the merge commit: `ls unicron-platform/src/lib/agents/*.ts`.
   c. Check Tier2ResolveModal export: `grep -l Tier2ResolveModal unicron-platform/src/components/agents/*.tsx unicron-platform/src/views/agents/*.tsx 2>/dev/null`. **If M2 just merged AND Tier2ResolveModal is now exported, post a comment on PR #80** saying: "M2 merged at `<sha>`; M1 can now import `Tier2ResolveModal` — single-line edit at `src/views/agents/CoverageExpansionModal.tsx` `onTier2Click`."
   d. Check for new migrations: `ls unicron-platform/supabase/migrations/`. Diff against the previous log entry.
   e. Use Vercel MCP to fetch the most recent `target=production` deploy state for:
      - metacron: `prj_4LlPkQ30I4CMRm6hUfk7CJERWDAz`
      - pathfinder: `prj_UwEYuzUkDTEwJz9HU4WgexQoax4m`
      - unicron-systems: `prj_gVtrF2p1n7SnUsDhXWkJhpwJH8tQ`
      Team: `team_ox5qAXv7jA6yFUCoOuXQvSfj`. **All three must be READY at the merge SHA.**
   f. Run tests at the merge commit: `cd unicron-platform && npm ci && npm test --silent`. Capture the test count. Compare against the prior log entry.
   g. Append a dated section to `MEMORY/cross-stream-watch-log.md` (newest first) with all of (a) through (f).

4. List still-open PRs with state + `headRefOid` only — skip deep-dive.

5. **Stop check at end of run.** If BOTH:
   - `gh pr list --search 'feat/metacron-m OR chore/metacron-m OR chore/metacron-source-onboarder OR chore/metacron-architect OR chore/metacron-cross-pollination OR chore/metacron-customer-list' --state open --json number` returns `[]`
   - AND any PR with title containing `Phase 1F Living System Bridge` is merged or closed
   
   Then write a `COORDINATION WATCH COMPLETE — all Phase 1 streams settled` entry to the log AND commit a sentinel file `MEMORY/coordination-watch-complete.flag` so Kyle can see the final state. Surface to Kyle in the log that the routine should be disabled at https://claude.ai/code/routines.

## Hard halts

Surface any of these to Kyle immediately. Write the entry to the log AND post a comment on the most recent open metacron PR with subject `COORDINATION WATCH HARD HALT — <reason>`:

- `metacron` main deploy is **ERROR** for the most recent commit on main (auto-revert may be in flight; check git log for a `Revert` commit within the last 30 min).
- Test count drops by more than **5** between consecutive merges (regression).
- A migration appears under `unicron-platform/supabase/migrations/` with `DROP`, `DELETE`, or destructive `ALTER`.
- `gh` CLI auth fails.

## Budget

Keep total tool calls under 30 per run. Hourly schedule × 24 invocations × 30 calls = budget. Do not bisect or run large diffs — `git log --oneline` and the migrations dir listing are sufficient.

---

Generated 2026-05-02 by Kyle's M1 chat. Routine ID: `trig_01CfMr1Sym6zZtpFQMtHhwjC`. Adjust this file (commit to `main`) to update routine behaviour without recreating the routine.
