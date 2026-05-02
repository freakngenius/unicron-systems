# PROMPT — Demo Polish Sprint

Paste-ready autonomous launch prompt for the demo polish work specified in `SPEC - Demo Polish & Geography Filters.md`. Same auto-merge / auto-revert / observability fallback safeguards as the Zedcor Sprint v3. Three streams in parallel; demo-eve scope.

---

DEMO POLISH SPRINT — AUTONOMOUS MODE

You are running three demo-polish streams in parallel via Task subagents. Same v3 autonomous safeguards (auto-merge with rollback tags, auto-revert on Vercel ERROR or post-deploy smoke fail, cost circuit breaker, live status doc, hard halt conditions). Demo deadline: Tuesday 2026-05-05 15:45 Central. Build window: tonight (Saturday) into Sunday morning at the latest.

## Read first

1. `SPEC - Demo Polish & Geography Filters.md` (primary spec — this is the contract)
2. `00 - TUESDAY DEMO PLAN.md`
3. `PRD - Pathfinder Form-Fit for Zedcor.md`
4. `SPEC - Cross-Pollination Engine.md`
5. `MEMORY/progress.md`, `decisions.md`, `conventions.md`, `learnings.md`, `audit-pathfinder.md`
6. `MEMORY/zedcor-sprint-live-status.md` (carries from earlier sprint)
7. `MEMORY/feedback_kanban_column_rules.md` (kanban semantics)
8. `MEMORY/feedback_multi_vercel_per_repo.md` (verify both Vercel projects independently)
9. `SPEC - Drive-to-Exit Prompt Patterns.md`

Pre-flight: confirm Pathfinder Vercel deploy READY on main HEAD. Confirm marketing-site state (expected ERROR per Issue #48; do not auto-revert if marketing-site is the ONLY thing that goes from ERROR to ERROR — that's pre-existing). Halt if Pathfinder is not green.

## Hard auto-merge criteria (ALL must be true)

1. CI green (lint, typecheck, test, spec-references-check)
2. Local pre-flight: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test` from Pathfinder/ AND from repo root
3. No merge conflicts (`gh pr view --json mergeable` = MERGEABLE)
4. PR body has verbatim evidence (SQL output, log line, screenshot reference, or test output)
5. Stream-specific eval / smoke per the SPEC's Acceptance criteria section
6. Additive migrations only
7. Cost cap: total < $20, per-stream < $8
8. Multi-Vercel state captured before merge (Pathfinder + marketing-site)

## Auto-revert triggers

Same as Zedcor Sprint v3 protocol. Monitor 10 min post-merge. Revert on:
1. Vercel deploy ERROR (only Pathfinder; marketing-site pre-existing ERROR is acceptable)
2. Smoke test fails
3. Previously-200 routes return 5xx
4. `pathfinder.llm_calls` writes go to zero in 15 min
5. Inngest function dropped from registry
6. Cost spike >3x baseline

## Pre-merge tagging

```
git fetch origin
git tag -a "pre-merge/demo-polish/${stream}/${gate}" origin/main -m "Known-good before #${PR}"
git push origin --tags
```

## Cost circuit breaker

- $10: warning ping
- $15: pause new features; finish in-flight only
- $20: hard halt; ping; wake Kyle

## Three streams (parallel via Task subagents)

### Stream P1 — Geography filtering

**Worktree:** `Phase2-worktrees/demo-polish-p1-geo`
**Branch:** `demo-polish/p1-geography`

**Scope per SPEC Section 2:**
- Migration: additive columns on `pathfinder.projects` (country, rejection_reason, rejected_at, geo_unknown, geo_inference_confidence) + new table `pathfinder.org_geo_config` with default Zedcor row
- Ingest-time country filter for sam.gov, USAspending, news adapters (Harris is US-only, no filter needed)
- Coordinate enforcement: text-extraction fallback via Haiku (lightweight) when lat/lon null
- Distance gating: reject when nearest_zedcor_branch_distance > org's max_supported_distance (default 250mi)
- Ranker update to write rejection_reason instead of dropping
- Backfill migration: re-evaluate the existing 416 projects, set rejection_reason for any that now fail filters

**Acceptance:**
- Romania project (`Earthwork Services at Mihail Kogălniceanu Airbase`) has rejection_reason = 'out_of_country'
- `select count(*) from pathfinder.projects where rejection_reason = 'out_of_country';` ≥ 1
- `select count(*) from pathfinder.projects where rejection_reason = 'no_branch_coverage';` ≥ some plausible number (likely 50-200)
- `select count(*) from pathfinder.projects where geo_unknown = true;` < 50 (vs 136 currently)
- Default lead list view (no filters): zero foreign-country projects visible

**Smoke post-deploy:**
1. `select rejection_reason, count(*) from pathfinder.projects where rejection_reason is not null group by rejection_reason;`
2. Open Pathfinder dashboard, confirm Romania project is no longer in the default lead list
3. Trigger an ingestor cron run; confirm new projects flow through with country tagging

### Stream P2 — Lead list Sort + Filter UI

**Worktree:** `Phase2-worktrees/demo-polish-p2-list-ui`
**Branch:** `demo-polish/p2-list-ui`

**Scope per SPEC Section 3:**
- Replace "ALL BRANCHES · RANKED" header with "ALL BRANCHES · {count}" or "WITHIN RANGE · {count}"
- Sort dropdown component: SCORE | DISTANCE | POSTED | MOST RECENT
- Direction toggle button: ↑ ASC / ↓ DESC
- Filter section:
  - 3-state toggle: WITHIN RANGE / OUTSIDE RANGE / ALL
  - Score floor slider: 0-90 in increments of 10
- Remove the Atlanta/Chicago/Phoenix/Seattle preset chip row
- URL query string state persistence: `?sort=score&dir=desc&range=within&min_score=80`
- Empty state: "No leads match. Try widening your range or lowering score floor."

**Acceptance:**
- Default load: SCORE descending, range=ALL, min_score=0 (matches current behavior visually but with new controls)
- Setting WITHIN RANGE: list narrows to projects within max_supported_distance of any branch
- Score slider at 80: only projects with score ≥ 80 appear
- URL reflects current filter state
- No preset chip row visible

**Smoke post-deploy:**
1. Open `/pathfinder/`
2. Toggle WITHIN RANGE; confirm list shrinks to expected count
3. Slide score floor to 80; confirm fewer items
4. Combine: WITHIN + score ≥ 80; confirm intersection
5. Reload page with the URL query string; confirm filter state restored

### Stream P3 — Header layout + Cross-pollination on detail

**Worktree:** `Phase2-worktrees/demo-polish-p3-header-xpoll`
**Branch:** `demo-polish/p3-header-xpoll`

**Scope per SPEC Sections 4 + 5:**

**Header fix (Section 4):**
- Reorder header: [Logo] [Chat] [CONFIDENTIAL] [New Opportunities · N] [User]
- Position CONFIDENTIAL between Chat and New Opportunities (no overlap)
- Style: badge with light red/amber bg, monospace small caps text, hover tooltip
- Fix New Opportunities counter query: `select count(*) from pathfinder.projects where ingested_at > now() - interval '24 hours';` (currently mis-filtering)

**Cross-pollination on detail (Section 5):**
- Add Relationship Context section to lead detail page when at least one cross-pollination match exists
- Render: matched entity, match type/confidence, existing relationship metadata (active sites, primary branch, most recent), recommended next step
- Multi-match support: one block per matched customer, ordered by recency
- Outreach Drafter receives cross-pollination context as input; prompt augmented with relationship details
- Regenerate top 3 outreach drafts per target branch (Nashville/Pittsburgh/LA) using new context

**Acceptance:**
- CONFIDENTIAL badge no longer overlaps Chat
- New Opportunities counter shows realistic value (≥100 last 24h based on current ingestion)
- At least 3 demo leads (across the three target branches) have visible Relationship Context section
- Recommended Outreach for those leads explicitly references the existing customer relationship in the opening sentence
- Outreach feels organic; not template-stamped

**Smoke post-deploy:**
1. Open `/pathfinder/`
2. Confirm header layout matches spec (CONFIDENTIAL between Chat and counter)
3. Confirm New Opportunities counter ≥ 100
4. Open a lead with a known cross-pollination match (query: `select p.id from pathfinder.projects p join pathfinder.lead_cross_pollination c on c.lead_id = p.id limit 1;`)
5. Confirm Relationship Context section renders
6. Confirm Recommended Outreach references the relationship

## Live status doc

`MEMORY/demo-polish-sprint-live-status.md` updated at every gate. Same format as Zedcor Sprint v3 live-status.

## Notification protocol

SLACK_WEBHOOK_URL preferred; fallback to `MEMORY/demo-polish-sprint-notifications.md`. Pings on:
- Sprint started
- Each stream merged
- Auto-revert events
- Cost threshold crossed
- Hard halt
- Sprint complete

## Hard halt conditions

Same as Zedcor Sprint v3:
1. Production-data destruction risk
2. Auth boundary changes
3. Customer-facing commitment
4. $20 cost halt (was $40 for Zedcor sprint; this is smaller scope)
5. 3 consecutive auto-reverts
6. Vercel error you can't trace
7. Geography filter rejects > 80% of total projects (sign of misconfiguration; pause for human review)
8. Cross-pollination Outreach generation regresses below current quality (regenerated drafts read worse than current ones)

## Phase 0 — Spawn worktrees

```bash
mkdir -p Phase2-worktrees
git fetch origin
git worktree add Phase2-worktrees/demo-polish-p1-geo -b demo-polish/p1-geography origin/main
git worktree add Phase2-worktrees/demo-polish-p2-list-ui -b demo-polish/p2-list-ui origin/main
git worktree add Phase2-worktrees/demo-polish-p3-header-xpoll -b demo-polish/p3-header-xpoll origin/main
```

Generate STREAM-README.md in each per the per-stream scope above.

## Wave dispatch

Single wave; all three streams launch in parallel via Task subagents. They're independent:
- P1 touches schema + adapters + ranker (backend)
- P2 touches the Pathfinder dashboard lead-list component (frontend)
- P3 touches the dashboard header + lead-detail page + outreach-drafter prompt

Possible touch overlap on the dashboard:
- P2 and P3 both modify Pathfinder dashboard components. Coordinate via PR description: P2 owns `components/lead-list/`, P3 owns `components/header/` + `components/lead-detail/`. Outreach drafter prompt change in P3 is in `lib/agents/outreach-drafter/prompt.ts`.

If a merge conflict arises: PR opened later rebases on the merged earlier PR. Auto-revert applies if rebase introduces breakage.

## Per-feature workflow

For each gate within each stream:
1. Re-read the relevant SPEC section
2. Implement with reference to the SPEC's data model + acceptance criteria
3. Local pre-flight (lint + typecheck + test from Pathfinder/ AND repo root)
4. Stream-specific smoke test
5. Tag pre-merge known-good
6. Push, open PR with verbatim evidence
7. CI must pass
8. Auto-merge if all criteria met
9. Monitor Vercel deploy 10 min
10. Post-deploy smoke
11. If smoke fails: auto-revert, log, continue
12. If smoke passes: live-status update, Slack ping, advance

## Wake-up report

`MEMORY/demo-polish-sprint-wake-up-report-2026-05-XX.md` covering:
- Verdict per stream
- Demo-readiness check against the SPEC's Acceptance section
- Per-stream cost breakdown
- Both Vercel project states at completion
- Reverts + root causes (no fixes attempted overnight)
- Recommendation: ready for Monday rehearsal? OR more work needed?

## Final instructions

- Do NOT touch unicron-platform/ source code
- Do NOT modify Issue #48 marketing-site work
- Do NOT bypass auto-merge criteria
- Do NOT update Notion Kanban "Verified" column — that's Kyle's call only (per `feedback_kanban_column_rules.md`); on merge + deploy the cards move to "Deployed" only
- Do NOT regenerate the live demo dataset until all three streams have merged AND smoke-tested clean — premature regeneration risks losing the current 416-project corpus before filters are validated
- After all three streams merge, re-run the three-branch pipelines (Nashville, Pittsburgh, LA) with the new filters to refresh demo data; this is Z-F-style integrator work and should run as a single coordinated step

When ready, post start ping: "Demo Polish Sprint started <timestamp>. 3 streams in parallel. Auto-merge mode ON. Cost cap $20. Live status at MEMORY/demo-polish-sprint-live-status.md."

Then begin Phase 0.
