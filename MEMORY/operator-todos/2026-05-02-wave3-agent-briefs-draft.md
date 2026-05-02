# Wave 3 agent briefs (drafted while Wave 2 runs)

These are the prompts the orchestrator will pass to the three Wave 3 background agents (Z-D, Z-E, Z-F) once both Z-B and Z-C PRs are merged + post-deploy probes green. Drafted ahead of time so dispatch is fast.

Migration number coordination (avoiding collisions with Wave 2):
- Wave 2 Z-B claims `0101_zedcor_cross_pollination`
- Wave 2 Z-C claims `0102_zedcor_geomapper`
- Z-D claims `0103_*` if needed (likely just lead_feedback table for #22 — but #22 is dropped from Wave 3 scope)
- Z-E claims `0104_*` if needed (none expected — chat panel is UI-only)
- Z-F claims `0105_*` if needed (none expected — pipeline runs are operational, not schema)

## Recon findings (run before drafting briefs — saved every agent ~20 min of false starts)

**App routing pattern:** Pathfinder uses `next.config.js` with `basePath: '/pathfinder'`, so all `app/*/page.tsx` files render under `/pathfinder/*`. Pages exist directly under `app/`, NOT under `app/pathfinder/`. **Brief paths in this doc reflect this: e.g., the lead detail page is `app/leads/[projectId]/page.tsx`, not `app/pathfinder/leads/...`.**

**Pre-existing surfaces from prior PRs (do NOT rebuild):**
- `app/leads/[projectId]/page.tsx` + `components/lead/LeadDetail.tsx` + `components/lead/Timeline.tsx` — from PR #34. Z-F #9 (lead detail page) is **mostly already built**; agent's job is verify + enhance with cross-pollination/geomapper data wiring, not a new page.
- `app/pipeline/page.tsx` + `components/pipeline/PipelineKanban.tsx` — from PR #34. CRM kanban surface.
- `components/CrossPollBanner.tsx` — cross-pollination UI banner exists. Z-B agent's matches will populate it.
- `components/ProjectModal.tsx` — existing modal-based lead view.
- `components/dashboard.tsx` is the main shell at `app/page.tsx`.
- `app/api/cron/verifier/route.ts:79,448,460,501` — `check_rationale` with `extractAnchors()`-based fact grounding is already implemented. Z-D #8 hardening is an enhancement to this existing guard, not a new build.

**Chat panel:**
- `lib/chat/{context,outreach-drafter,sonar}.ts` exist. `app/api/chat/` route exists.
- No standalone chat page in `app/`; the chat panel is mounted inside `components/dashboard.tsx` (likely via a side-panel component). Z-E agent should locate via `grep -rn "ChatPanel\|ChatDrawer" components/`.

---

## Z-D agent brief draft

You are implementing Z-D Wave 3 features for the Zedcor demo sprint. Read this brief end to end before starting.

### Context

- Pathfinder Next.js 14 app at `/Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder` (canonical). Your worktree: `/Users/keka/Dropbox/Projects/Unicron Systems/Phase2-worktrees/zedcor-stream-d-quality/Pathfinder` on branch `zedcor/d-quality`. CWD into that.
- Demo Tuesday May 5. Z-A (#1, #5) merged at `050cbe2`. Wave 2 (Z-B #10 cross-pollination, Z-C #6 GeoMapper + #14 + #15) merged at the time you start.
- Read the canonical project rules: `Pathfinder/CLAUDE.md` (worktree-only, branch discipline, filesystem ban, scope discipline). The v3 sprint authorization overrides "never merge your own PR" — orchestrator gates the merge, not you. Open the PR and stop.

### Read first

1. `00 - TUESDAY DEMO PLAN.md` — sections "What Has to Be Ready" and "Risk Register" (rationale-hallucination is the #1 demo risk).
2. `Pathfinder/app/api/cron/{ranker,outreach,slack-alerts,cost-alert,briefing}/route.ts` — the 5 routes for #26 heartbeat.
3. `Pathfinder/app/api/cron/verifier/route.ts` and any `lib/verifier*` — for the #8 rationale guard.

### Scope (in priority order; ship as one PR if it stays under ~700 LoC, else split)

**#26 Empty-queue heartbeat (5 routes)** — HIGHEST priority within Z-D batch. Demo-day optics: dashboards never look dead even when queue empty.
- For ranker (`route.ts:479-481`) and outreach (`route.ts:300-302`): write an `agent_runs` row with `status='empty_queue'`, `records_processed=0`, `records_new=0`, `started_at=now()`, `completed_at=now()` BEFORE the early return.
- For slack-alerts, cost-alert, briefing: PR #49 already adds `openAgentRun` + `closeAgentRun` calls. Verify those write even when `result.scanned=0` / `result.posted=0`. If they early-return on empty work BEFORE openAgentRun, add a heartbeat there too.
- Use the existing `lib/agent-runs.ts` helpers (`openAgentRun`, `closeAgentRun`). Do NOT add a new helper.
- Verification SQL: `select agent_name, status, count(*) from pathfinder.agent_runs where status='empty_queue' and started_at > now() - interval '24 hours' group by agent_name;` — at least one row per cron-driven agent_name 30 minutes after this PR ships.

**#8 Narratable rationale (no-hallucination guard)** — TUESDAY DEMO PLAN.md item 6 + Risk Register #1.
- Find the verifier rationale generator (likely in `lib/verifier.ts` or `lib/agents/`).
- Add a Generator-Verifier loop that flags hallucinated facts — specifically: project owner names, GC names, dollar values, dates that aren't grounded in the source payload (`projects.raw_payload`).
- If hallucination detected and verifier can't iterate to fix: write `rationale = "Owner not yet enriched — awaiting Perplexity research pass"` (per spec) and continue. Don't drop the project.
- Cap iterations at 2-3 per the operating principle.

**#17 Rejected pile with reason** — TUESDAY DEMO PLAN.md item 7. Data already supports it (verifier writes `rationale='Filtered as non-opportunity by classifier'` and `verifier_notes`); UI surface needed.
- Page at `Pathfinder/app/pathfinder/rejected/page.tsx` (or extend existing list with a tab/filter). Server component. Lists projects where `verified=true AND score < 60` with rationale + verifier_notes. Group by reason category (duration < 3 months, outside radius, no security scope, etc.).

**#12 Score distribution summary widget** — TUESDAY DEMO PLAN.md item 12.
- Component renders "X leads ingested in last 7 days. Y above score 90. Z above 80. W below 80." for the three target branches.
- Place in dashboard header or as a card on the existing leads page. Use server component + a single SQL aggregate.

Skip everything else (#11 permit display, #13 score breakdown UI, #19 industry classification, #22 feedback) — defer to post-demo.

### Auto-merge criteria

Same as Wave 1/2: pnpm typecheck clean, pnpm test clean, no destructive ops, PR description has verbatim verification (SQL output for heartbeat, screenshot path for UI).

### Pre-merge tag

```
git fetch origin
git tag -a "pre-merge/zedcor/stream-d/feature-26-8-17-12" origin/main -m "Known-good before Z-D merge"
git push origin "pre-merge/zedcor/stream-d/feature-26-8-17-12"
```

### Slack pings

`SLACK_WEBHOOK_URL` in `.env.production.local`. Post START, PR-OPEN, HALT events.

### Halt conditions

- #8 hallucination guard fires more false-positives than it fixes (>20% rationales blanked) → halt, log misses, post Slack
- #26 produces double-write of agent_runs (heartbeat + real run on same firing) → halt
- Migration application fails → halt verbatim

### Cost cap

Soft: $12. Total Wave 3 budget: $25 across Z-D + Z-E + Z-F.

### Final report

PR number, sub-features shipped, test/typecheck output, sample heartbeat row from production, sample rejected-pile rendering (URL or screenshot path).

---

## Z-E agent brief draft

You are implementing Z-E Wave 3 features. Scope is small.

### Context + Read first

Same context paragraph as Z-D. Worktree: `Phase2-worktrees/zedcor-stream-e-voice-chat/Pathfinder` on branch `zedcor/e-voice-chat`.

Read:
- `00 - TUESDAY DEMO PLAN.md` items 11 and 5-min spine step 5 (the chat demo).
- `Pathfinder/app/pathfinder/chat/page.tsx` (or wherever the chat panel lives — `grep -rn "chat" app/pathfinder` to locate).
- `Pathfinder/lib/chat/` — the chat handler.

### Scope

**#18 Demo-canned chat panel test questions** — TUESDAY DEMO PLAN.md item 11. Add 5 prepared questions surfaced as quick-action buttons in the chat panel:
1. "What are my top 5 leads in {Nashville|Pittsburgh|Los Angeles} this week?"
2. "Which leads match an existing Zedcor customer relationship?"
3. "What leads got rejected in {branch} and why?"
4. "What's the average project value of leads above score 90 in Nashville?"
5. "Show me leads where a national account is involved."

For each, ensure the chat handler routes to the correct lib function and returns a properly formatted markdown table. Run all 5 against production once at the end and capture the rendered output as evidence in the PR.

Skip #21 (outreach voice tuning) — current voice already on-brand per Wave 1 verify-health.

### Auto-merge criteria + halt + cost

Same boilerplate. Cost soft cap: $7.

### Final report

5 question outputs as captured screenshots or markdown.

---

## Z-F agent brief draft

You are implementing Z-F Wave 3 features. This is the integrator stream — final assembly.

### Context + Read first

Same context paragraph as Z-D. Worktree: `Phase2-worktrees/zedcor-stream-f-integrator/Pathfinder` on branch `zedcor/f-integrator`.

Read:
- `00 - TUESDAY DEMO PLAN.md` end-to-end (you're tying it all together).
- `Pathfinder/app/api/cron/ingestor/route.ts` and existing source adapters.

### Scope

**#3 Lead ingestion verify-health** — confirm sam.gov, USAspending, Harris County adapters fire cleanly. Trigger one ingestion run for each.

**#2 Three-branch pipeline runs** — the demo's data refresh step. Run ingestion targeting Nashville (200mi from 36.16, -86.78), Pittsburgh (200mi from 40.44, -79.99), LA (200mi from 34.05, -118.24). After ingestion, kick ranker + verifier. Capture: count of leads per branch, count above score 90, top 5 lead titles per branch.

If targeting requires code changes (e.g., the ingestor doesn't accept lat/lon filter as parameter), add a new endpoint or query param. Migration not expected.

**#9 Lead detail page enhancement (NOT a new build)** — TUESDAY DEMO PLAN.md item 8. Page is **already built** at `app/leads/[projectId]/page.tsx` + `components/lead/LeadDetail.tsx` + `components/lead/Timeline.tsx` from PR #34. Your job is to **wire in the new data sources from Wave 1 + 2**:
- Pull cross-pollination matches from `pathfinder.lead_cross_pollination` (added by Z-B in this wave's previous batch). Render in a "Relationship Context" section per `SPEC - Cross-Pollination Engine.md` § 4.3.
- Pull `nearest_zedcor_branch_id` + `zedcor_distance_miles` from `pathfinder.projects` (added by Z-C). Render distance + branch name.
- Existing `components/CrossPollBanner.tsx` may already be wired to a different source — re-target it to the new `lead_cross_pollination` table or add a parallel banner.
- Do NOT rebuild Timeline, the lead-detail layout, or the activity feed. Those are working from PR #34.

Skip #23 (OCR) — PDFs not received from CTO Kyle. Document deferral in PR body.

#25 (roadmap slide) is already shipped at `Presentation/zedcor-roadmap-slide.md`. Reference it; don't duplicate.

### Auto-merge criteria + halt + cost

Standard. Halt if pipeline runs produce <3 high-quality leads per branch (data-availability issue worth Kyle's review per the operator's authorization). Cost soft cap: $10.

### Final report

PR number, lead counts per branch, sample lead detail page screenshot.

---

## Operator dispatch sequence

1. Wait for Z-B + Z-C agents to report completion
2. Gate-merge Z-B first (cross-pollination is foundation; Z-C may want to read its outputs)
3. Gate-merge Z-C
4. 10-min post-deploy watch
5. Spawn Z-D, Z-E, Z-F worktrees from new origin/main
6. Symlink env files + node_modules
7. Tag pre-Wave-3 known-good
8. Slack ping
9. Dispatch the 3 agents in parallel using the briefs above
10. Wait for completion notifications
11. Gate-merge in order: Z-D first (ships rationale guard which Z-F depends on), then Z-F (integrator depends on Z-D), then Z-E (independent)
12. Final wake-up report
