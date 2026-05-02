# PROMPT — Zedcor Demo Sprint (Saturday → Tuesday)

This is the orchestrator megaprompt for one fresh Claude Code session that sets up parallel worktrees for the Zedcor demo build. It does NOT write product code itself. It creates the worktree structure, generates per-stream READMEs, and exits. After this session, you (Kyle) launch 5-6 fresh Claude Code sessions, each pointing at one worktree.

Demo deadline: Tuesday May 5, 2026, 3:45 PM Central. Run-through Monday afternoon. Build window: Saturday 2 + Sunday 3.

Paste everything below the line into a fresh Claude Code session at the workspace root.

---

You are the Zedcor Demo Sprint Orchestrator. Your only job is to set up parallel work streams as git worktrees, generate per-stream READMEs, and exit.

You do NOT write product code. After you finish setup, the human launches 5-6 separate Claude Code sessions manually.

This session should take 30-60 minutes. If it takes longer, something is wrong. Halt and report.

## Read these documents in order before doing ANYTHING

1. `00 - TUESDAY DEMO PLAN.md` (priority list, demo arc, risk register)
2. `PRD - Pathfinder Form-Fit for Zedcor.md` (vision, customer profile, sequencing)
3. `SPEC - Cross-Pollination Engine.md` (highest-leverage demo feature)
4. `SPEC - Zedcor Data Ingestion.md` (foundation for everything else)
5. `MEMORY/progress.md` (current state, last gates)
6. `MEMORY/decisions.md` (D1-D7 decisions)
7. `MEMORY/conventions.md` (file naming, DB conventions)
8. `MEMORY/audit-pathfinder.md` (existing Pathfinder agent + UI surfaces)
9. `MEMORY/learnings.md` (silent-bug class problems, telemetry gotchas)
10. `00 - PARALLEL BUILD MAP.md` (parallel build patterns)
11. `00 - SKILLS & DISCIPLINES.md` (memory, testing, delegation, spec adherence)
12. `SPEC - Drive-to-Exit Prompt Patterns.md` (halt resolution patterns)

Confirm Phase 1 + Phase 2 are merged on main. If `MEMORY/progress.md` shows incomplete state, stop and report.

## Hard constraints

**Time cap:** 60 minutes for setup. If you cross 45 minutes without all 6 worktrees set up, halt and report progress.

**Cost cap:** under $2 for this session. File writes + git commands; LLM calls minimal.

**Do not:**
- Modify any `.md` spec file at workspace root
- Modify `MEMORY/` files except `progress.md` and `todo-next.md` at the very end
- Modify `_demo-snapshot-2026-04-30/`
- Modify the existing chat panel UI in `Pathfinder/components/chat/`
- Modify any code in `Pathfinder/`, `unicron-platform/`, root app, or any existing worktree
- Write product code in any new worktree
- Launch the 5-6 Claude Code sessions yourself

**Always do:**
- Update `MEMORY/progress.md` and `MEMORY/todo-next.md` at session end
- Each stream README references the right specs, MEMORY files, and demo priorities
- Each stream worktree starts on a clean branch off `main`
- Coordination rules between streams are explicit in each README
- Bake the drive-to-exit halt policy into every stream README

## Stream profiles

Build streams sized for 4-12 hours of autonomous Claude Code work each. Roughly the work that fits between Saturday morning and Sunday evening.

### Stream Z-A — Zedcor Data Foundation (BLOCKING for Z-B, Z-C, Z-F)

The foundation: ingest 24 branches with geocoding, ingest 1,863 customer sites with normalization + parent-company resolution, build the in-memory cross-pollination index. Without this, three other streams are blocked.

Worktree: `Phase2-worktrees/zedcor-stream-a-data-foundation`
Branch: `zedcor/a-data-foundation`

Reference specs: `SPEC - Zedcor Data Ingestion.md` (primary), `SPEC - Cross-Pollination Engine.md` (for the normalization function, since it's shared)

Gates:
- Z-A0: Read source files, confirm row counts, draft schema migrations
- Z-A1: Migrations applied, ingestion script written and tested locally
- Z-A2: Geocoding complete for 24 branches, normalization complete for 1,863 customers, parent-company resolution complete
- Z-A3: Verification queries pass, audit log written, PR up

Done criteria: PR merged. `select count(*) from pathfinder.zedcor_branches where lat is not null` ≥ 24. `select count(*) from pathfinder.zedcor_customer_sites` = 1,863 ± 5.

### Stream Z-B — Cross-Pollination Engine + National Account Detection

Builds the matching engine + national account flagging on top of Z-A's data. Highest-leverage demo feature.

Worktree: `Phase2-worktrees/zedcor-stream-b-cross-pollination`
Branch: `zedcor/b-cross-pollination`

Depends on: Z-A's first commit (data tables in place; can mock-ingest if Z-A is mid-flight)

Reference specs: `SPEC - Cross-Pollination Engine.md` (primary)

Gates:
- Z-B0: Read spec, sketch the 3-layer matching algorithm, sketch the eval set structure
- Z-B1: Normalization function shared with Z-A (single source of truth at `Pathfinder/lib/normalization/customer-name.ts`)
- Z-B2: Matching engine implementation, ranker integration (score boost), false-positive guards
- Z-B3: 50-case eval set hand-labeled, false-positive rate ≤ 5%, latency ≤ 200ms per lead
- Z-B4: National account detection + auto-population from customer sites
- Z-B5: Lead detail UI surface (Relationship Context section), Lead list warm-intro badge, PR up

Done criteria: PR merged. Eval pass rate ≥ 90% on true matches. False-positive rate ≤ 5%. UI surfaces both the Relationship Context section and the warm-intro badge.

### Stream Z-C — GeoMapper Update + Branch Radius Map View

Wires GeoMapper to the new `pathfinder.zedcor_branches` table. Builds the branch radius visualization on the dashboard.

Worktree: `Phase2-worktrees/zedcor-stream-c-geo-map`
Branch: `zedcor/c-geo-map`

Depends on: Z-A's first commit (zedcor_branches table)

Reference specs: `MEMORY/audit-pathfinder.md` GeoMapper section, `SPEC - Backend Architecture.md` Section 5.3

Gates:
- Z-C0: Read existing GeoMapper code, identify hardcoded branch refs
- Z-C1: GeoMapper reads from `pathfinder.zedcor_branches` filtered by customer_org_id
- Z-C2: Branch radius map view in Pathfinder dashboard with 24 pins + 200mi circles
- Z-C3: Three target branches (Nashville, Pittsburgh, LA) visually highlighted
- Z-C4: Lead pins color-coded by nearest branch
- Z-C5: PR up

Done criteria: PR merged. Open Pathfinder dashboard, see all 24 branches with radii. Click a branch, lead list filters. Three target branches visually distinct.

### Stream Z-D — Quality + Rationale Hardening

The non-data-dependent quality work: narratable rationale with hallucination guard, rejected pile with reason, score distribution widget, industry classification, permit info display.

Worktree: `Phase2-worktrees/zedcor-stream-d-quality`
Branch: `zedcor/d-quality`

Depends on: nothing (works on existing pipeline + UI)

Reference specs: `SPEC - Backend Architecture.md` Section 5 (Ranker, Verifier), `MEMORY/audit-pathfinder.md` (Lead Detail page)

Gates:
- Z-D0: Read Ranker + Verifier code, identify rationale generation path
- Z-D1: Generator-Verifier loop for rationale with hallucination flagging (max 2 iterations)
- Z-D2: 20-case rationale eval set, ≥ 90% catch rate on planted hallucinations
- Z-D3: Rejected pile schema (rejection_reason column), API endpoint, UI tab on lead list
- Z-D4: Score distribution widget on dashboard
- Z-D5: Industry classification on enricher output, lead detail surface
- Z-D6: Permit info section on lead detail page
- Z-D7: PR up

Done criteria: PR merged. Top 5 leads in any target branch read aloud cleanly without hallucinations. Rejected pile shows ≥ 3 distinct reason categories with examples. Score distribution renders for trailing 7d.

### Stream Z-E — Outreach Voice + Demo Chat Questions

Tunes outreach drafts to Zedcor voice. Validates the 5 canned chat panel questions.

Worktree: `Phase2-worktrees/zedcor-stream-e-voice`
Branch: `zedcor/e-voice`

Depends on: nothing (existing outreach + chat surfaces)

Reference specs: `MEMORY/audit-pathfinder.md` Outreach Drafter section

Gates:
- Z-E0: Read OutreachDrafter prompt, draft Zedcor voice section
- Z-E1: Per-customer voice config (load Zedcor voice when customer_org_id='zedcor')
- Z-E2: Generate drafts for top 3 leads per target branch, manual review for tone
- Z-E3: Run 5 canned chat questions against the panel, capture clean outputs
- Z-E4: Fix chat agent prompt if any question hallucinates or breaks; re-run until all 5 clean
- Z-E5: Save backup screenshots at `demo-assets/chat-fallback/`
- Z-E6: PR up

Done criteria: PR merged. Outreach drafts read like Zedcor sales reps would speak. All 5 canned questions produce factual, well-formatted responses. Backup screenshots saved.

### Stream Z-F — Three-Branch Pipeline Runs + Demo Coordination

The integrator stream. Pulls everything together, runs the actual demo pipelines, validates demo readiness, captures the run-book.

Worktree: `Phase2-worktrees/zedcor-stream-f-pipelines`
Branch: `zedcor/f-pipelines`

Depends on: Z-A, Z-B, Z-C, Z-D, Z-E all merged or near-merge

Reference specs: `00 - TUESDAY DEMO PLAN.md` (primary)

Gates:
- Z-F0: Wait for Z-A, Z-B, Z-C, Z-D, Z-E to be on main (or in late stages)
- Z-F1: Coverage Expansion goal seeded for Nashville, Pittsburgh, LA (200mi radius, 30-day lookback, target_count=50)
- Z-F2: Full pipeline run (ingest → rank → cross-pollinate → enrich top 10 per branch → verify → draft outreach top 5 per branch)
- Z-F3: Spot-check top 5 per branch manually for hallucinations or factual errors. Fix prompts if needed and re-run.
- Z-F4: Verify gates: ≥ 5 leads scored ≥ 90 per branch. ≥ 1 cross-pollination match per branch. 0 hallucinations in top-5 rationales.
- Z-F5: Demo run-book at `MEMORY/demo-prep/2026-05-04-demo-run-book.md` with: target lead URLs/IDs per branch, expected chat responses, fallback paths if anything breaks
- Z-F6: Monday afternoon: full 15-minute demo run-through with Curtis and Keenan

Done criteria: Run-book written. Three-branch pipelines proven. Monday rehearsal completed. Demo state frozen Monday EOD; no further pipeline runs after that.

## Spawn process

### Step 1 — Verify foundations

Read `MEMORY/progress.md`. Confirm Phase 1 + Phase 2 are complete. If not, stop and report.

### Step 2 — Create the 6 worktrees

```bash
mkdir -p Phase2-worktrees

git worktree add Phase2-worktrees/zedcor-stream-a-data-foundation -b zedcor/a-data-foundation
git worktree add Phase2-worktrees/zedcor-stream-b-cross-pollination -b zedcor/b-cross-pollination
git worktree add Phase2-worktrees/zedcor-stream-c-geo-map -b zedcor/c-geo-map
git worktree add Phase2-worktrees/zedcor-stream-d-quality -b zedcor/d-quality
git worktree add Phase2-worktrees/zedcor-stream-e-voice -b zedcor/e-voice
git worktree add Phase2-worktrees/zedcor-stream-f-pipelines -b zedcor/f-pipelines
```

Verify with `git worktree list`.

### Step 3 — Generate per-stream STREAM-README.md

Each worktree gets a `STREAM-README.md` at its root. Each README MUST include:

1. **Stream identity** (one paragraph including which other streams it depends on and which depend on it)
2. **Read these documents in order** (specific list)
3. **Hard constraints** (cost cap $25 per stream, halt at $20; time cap; do-not-touch list)
4. **Gate execution** (numbered gates with explicit done criteria; PR-up at gate boundaries)
5. **Coordination rules** (shared files, dependencies on other streams; how to handle if a dependency is mid-flight)
6. **Drive-to-exit policy** (halt only on cost cap, production data risk, secrets you can't derive, novel strategic decision; otherwise keep going through gates)
7. **Demo readiness contribution** (what proof of demo-readiness this stream produces)
8. **Out of scope** (defer list per stream)
9. **MEMORY hygiene** (sync rule before any MEMORY write; subheading conventions for multi-stream MEMORY updates)

Use the per-stream content guides above. Adapt for each stream.

For shared resources (the normalization function, the cross-pollination data layer), explicitly document the contract and which stream owns it (Z-A owns normalization function; Z-B is read-only consumer).

### Step 4 — Update MEMORY

In `MEMORY/progress.md`, append:

```
## 2026-05-XX — Zedcor Demo Sprint spawned

6 worktrees created in `Phase2-worktrees/`:
- zedcor-stream-a-data-foundation (branch: zedcor/a-data-foundation) — BLOCKING for B, C, F
- zedcor-stream-b-cross-pollination (branch: zedcor/b-cross-pollination) — depends on A
- zedcor-stream-c-geo-map (branch: zedcor/c-geo-map) — depends on A
- zedcor-stream-d-quality (branch: zedcor/d-quality) — independent
- zedcor-stream-e-voice (branch: zedcor/e-voice) — independent
- zedcor-stream-f-pipelines (branch: zedcor/f-pipelines) — integrator, depends on A/B/C/D/E

Demo deadline: 2026-05-05 15:45 Central (Tuesday).
Build window: Saturday-Sunday-Monday.
Run-through: Monday afternoon.

Each worktree has STREAM-README.md.
Manual launch: human opens 6 Claude Code sessions, one per worktree, in this order:
  Saturday morning: Z-A, Z-D, Z-E in parallel (no cross-deps for these three at start)
  Saturday afternoon (after Z-A's Z-A1 gate): Z-B, Z-C in parallel
  Sunday: Z-F begins integration once others are mid-flight or merged
```

In `MEMORY/todo-next.md`, replace contents with launch instructions and the demo plan reference.

### Step 5 — Exit and report

```
ZEDCOR DEMO SPRINT SPAWN COMPLETE.

Worktrees created: 6
Branches: zedcor/a-data-foundation, zedcor/b-cross-pollination, zedcor/c-geo-map,
          zedcor/d-quality, zedcor/e-voice, zedcor/f-pipelines
STREAM-README.md files generated: 6

Launch order recommendation:
  Phase 1 (Saturday AM): Z-A, Z-D, Z-E in parallel
  Phase 2 (Saturday PM, after Z-A1): Z-B, Z-C in parallel
  Phase 3 (Sunday): Z-F integration

Demo deadline: 2026-05-05 15:45 Central
Build window: 2.5 days remaining
Cost so far: $X.XX
MEMORY updated: progress.md, todo-next.md
Awaiting human action: launch the 6 sessions.
```

## Per-stream launch prompt template

The human will paste this into each worktree's Claude Code session:

```
You are executing a stream of the Zedcor Demo Sprint. Read STREAM-README.md at the root of this worktree, then follow it end-to-end. Use the disciplines from 00 - SKILLS & DISCIPLINES.md and the patterns from SPEC - Drive-to-Exit Prompt Patterns.md.

DRIVE-TO-EXIT mode: work through gates back-to-back. Halt only for:
- Cost cap hit ($20 stop-and-report)
- Production data loss risk
- Secrets you cannot derive (env vars need Kyle)
- Genuinely novel strategic decision

For multi-choice forks (path a/b/c), pick the most empirical and lowest-blast-radius option. Justify in the PR description in one sentence.

Cost cap: $25 per stream. Stop at $20.

Demo deadline: Tuesday 2026-05-05 15:45 Central. The whole sprint is 2.5 days. Move with intention.

Sync from main on every gate boundary before pushing. If MEMORY/ files conflict, keep main's version + append your stream's additions under a "## Stream Z-{X}" subheading.

PR-up at gate boundaries. Each PR independently reviewable + mergeable. Do not chain PRs through git that block each other.

Begin.
```

## Final reminder

Your job is setup, not building. Create the 6 worktrees, write the 6 STREAM-README.md files, update MEMORY, exit.

The streams themselves run in 6 separate Claude Code sessions launched by Kyle.

Begin.
