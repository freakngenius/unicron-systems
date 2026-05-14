# PROMPT — Demo Path Repair (Orchestrator Mode, No Halts)

Paste into a fresh Claude Code session. Model: **Opus**. This supersedes the Demo Push prompt for the repair phase.

---

## THE PROBLEM WITH THE LAST RUN

The overnight run shipped 7 PRs and reported "demo path wired end-to-end." But when Kyle clicked through it as a human, every UX seam was broken. The DoD smoke harness reported "3 pass / 8 blocked" — and the BLOCKED steps were never actually exercised, they were skipped because the harness lacked env vars or real sessions. "Blocked" was treated as acceptable. It is not.

**New standard: the demo path is done when a human can click through the entire flow live, in the browser, with no white screens, no invisible buttons, no dead ends, no wrong redirects. Code being "wired" is irrelevant if the human can't use it.**

## OPERATING MODE — ORCHESTRATOR, NOT HALT-AND-ASK

When you hit a blocker:
1. Do NOT halt and ask Kyle.
2. Enter orchestrator planning mode: diagnose root cause, write a plan to solve it, identify the files and changes needed.
3. Dispatch the fix (yourself or a sub-agent in a worktree).
4. Verify the fix by actually exercising the path.
5. Continue.

The ONLY reasons to stop and surface to Kyle:
- A destructive operation would be required (DROP, data loss, schema rename) — surface the SQL, keep working other items.
- A production secret is exposed — halt, surface immediately.
- Production is down (5xx spike) — auto-revert, surface immediately.
- You have completed and verified EVERYTHING and the full demo path works.

Anything else — interpretation calls, scope expansion, missing entry points, broken redirects, ambiguous specs — you decide and proceed. You know the goal. Take the recommended path. No stops until 100% done and verified, or it is 100% failure.

## CONCRETE BROKEN SEAMS — verbatim evidence from Kyle's walkthrough

Fix every one of these. Each is a real bug a human hit.

### 1. White-screen crash after Approve & Deploy
`Uncaught TypeError: Cannot read properties of undefined (reading 'toUpperCase')` at index-Bu4P5Rr0.js:28. After Architect runs and operator approves, the screen goes fully white. Some component uppercases a string that is undefined post-deploy. Grep all `.toUpperCase()` in unicron-platform/src/, find the one in the post-Approve render path (Customer Detail header, Business Summary panel, or org name display), add defensive guards. Same root cause family as the earlier "WHAT REALBERRY IS A $3 6B GETS" bug.

### 2. Buttons invisible — white on white
The "LET ARCHITECT DESIGN IT →" button on the Onboarding screen renders white text on white background. Same for other primary CTAs. Primary buttons must be bg=--v3-blue (#6081BE) text=white. Secondary buttons bg=white text=--v3-ink (#0B1530) border=--v3-line. Grep button components, fix every primary/secondary CTA across Metacron.

### 3. Architect Inbox has no way to START a decomposition
The Architect Inbox screen shows existing proposals but there is NO entry point to kick off a NEW decomposition, and the proposal tiles are not clickable (can't open, can't approve). Two fixes:
   a. Add a prominent "+ New Decomposition" / "Start New System" button at the top of Architect Inbox that opens the Architect onboarding flow.
   b. Make every proposal tile clickable — clicking opens the proposal detail with the blueprint (business_summary, decomposition, ui_plan) and an Approve & Deploy action.

### 4. Customers tab shows raw UUIDs, not names
The Customers tab renders org cards with raw UUIDs (6CD87740-7C72-...) instead of customer names. No visible status badge progression. Fix: render the org's `name` field as the card title. Render the status badge (setting_up / first_run / ranking / ready_to_view / etc.) prominently. UUID can be a small secondary detail or removed from the card face entirely.

### 5. Customer Detail "Open Pathfinder" button is generic + routes WRONG
Button says "OPEN PATHFINDER FOR CUSTOMER" (generic) — should say "OPEN PATHFINDER FOR [org name]". And clicking it routes to `https://atrium.unicron.systems/#` — a dead anchor on the Atrium root. It MUST route to the customer's unique Pathfinder URL: `pathfinder.unicron.systems/[slug]` (or `unicron.systems/pathfinder/[slug]`), carrying the operator session. This is THE core demo payoff and it's broken.

### 6. Operator auth too narrow / redirect broken
Clicking "Open Pathfinder" only accepts team@unicron.systems. The email magic-link confirm redirects to `atrium.unicron.systems/#` instead of the customer Pathfinder URL. Fix: (a) operator allowlist must include kyle@unicron.systems, kyle@demystified.ai, keenan@, curtis@ — whatever operator emails Kyle uses; check pathfinder.operator_allowlist table and add missing. (b) The auth callback must honor the `next` / redirect param so after confirm the operator lands on the intended `/pathfinder/[slug]`, not the Atrium root.

### 7. Customer Detail dashboard all zeros / no sources
Lead Volume 0, all metrics 0%, Active Sources (0), Recent Errors (0). For an org that was supposedly onboarded ("LIVE" badge), there is no data. Either: (a) the agent dispatch never actually ran for this org, (b) the dispatch ran but produced nothing because no real adapter exists for the org's architecture.sources, or (c) the dashboard queries aren't scoped right. Diagnose which. If (a): fix the org.created → ingestOrgFunction wiring. If (b): the org's architecture names sources with no adapter — the dashboard must show those sources in a "pending / tier-2 / onboarding" state, NOT show "0 sources enabled" as if nothing was configured. If (c): fix the query scoping.

## THE DEMO PATH — what must work end to end, clicked by a human

A human operator, signed in, must be able to:

1. Land in Metacron, see a clear "Start New System" / "New Decomposition" entry point.
2. Click it, enter a customer profile in the Architect ("what signals do you want to capture").
3. Click "LET ARCHITECT DESIGN IT" (visible, working button) — Architect runs, returns a blueprint preview with business_summary + decomposition + ui_plan, all rendered legibly.
4. Click "Approve & Deploy" (visible, working button) — NO white screen. Lands on a confirmation or the new customer's detail view.
5. Go to Customers tab — see the new org as a NAMED card with a status badge advancing setting_up → first_run → ranking → ready_to_view.
6. Open the new org's Customer Detail — see the org name, status, and either real data OR honest "sources onboarding / first run in progress" states (never silent zeros pretending nothing was configured).
7. Click "Open Pathfinder for [name]" — land on `pathfinder.unicron.systems/[slug]`, the customer's UNIQUE URL, with operator session intact. The tailored Pathfinder renders per the org's ui_plan.
8. See real leads (or honest empty-state if the org's sources are still onboarding — but the page must render, not crash, not redirect to a dead anchor).
9. Verify a lead → activity surface updates.

Every step must work by clicking. No DevTools required. No env-var fiddling. No "blocked" steps.

## DEFINITION OF DONE — re-read at every cycle

`Company Docs/Metacron/SPEC - Definition of Done - End-to-End Operational.md` is the pinned truth. The 11-step synthetic smoke must pass AND the human-clickable demo path above must work. Both. Re-read this SPEC at the start of every cycle and after any compaction.

## CYCLE STRUCTURE

1. Read DoD SPEC. List `list_skills`. Snapshot state (git, schema, Vercel, kanban).
2. Pick the highest-leverage broken seam from the list above (start with #1 and #2 — crash + invisible buttons block everything else).
3. Orchestrator-plan the fix: root cause, files, change, test approach.
4. Implement in a worktree. TDD where it makes sense; for UI bugs, the test is "does the path work when clicked."
5. Self-verify by ACTUALLY EXERCISING THE PATH. Use a headless browser (Playwright) to click through the actual demo path steps. If Playwright isn't set up, set it up — it is now required, not deferred. The verifier must click buttons, follow redirects, assert no white screens, assert no console errors, assert the right URL is reached.
6. /codex review if quota available; if not, do a rigorous self-review pass and note codex is skipped.
7. Open PR. Multi-Vercel verify both projects. Auto-merge after CI + multi-Vercel green.
8. Move kanban card to Deployed.
9. Re-run the full human-path verification (headless click-through of all 9 demo steps).
10. If any step fails → orchestrator-plan the next fix → loop. Do NOT stop.

## SELF-VERIFICATION IS THE REAL GATE

After every merge, run the full 9-step headless click-through. Capture screenshots at each step. The run is only done when:
- All 9 demo-path steps pass clicked-through with screenshots proving each
- The 11-step DoD synthetic smoke passes
- Zero white screens, zero invisible buttons, zero dead-anchor redirects, zero console errors on the path
- A fresh synthetic org goes from Architect prompt → unique Pathfinder URL with the page rendering

Until all of that is true, keep cycling. Stopping before that = 100% failure.

## REPORTING

Post a one-line status every 30 min: which seam fixed, which in progress, headless-path step count passing (X/9). No permission requests. Just progress.

## BEGIN

Read the DoD SPEC. list_skills. Snapshot. Start with seam #1 (white-screen crash) and #2 (invisible buttons) — they block everything downstream. Orchestrator-plan, fix, verify by clicking, loop. Do not stop until all 9 demo-path steps pass headless click-through and the DoD smoke is green.

No halts. You know the goal. Take the recommended path. Finish it.
