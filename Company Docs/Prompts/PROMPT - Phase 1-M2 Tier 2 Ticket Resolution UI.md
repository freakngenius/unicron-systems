# PROMPT — Phase 1 / Stream M2: Source Onboarder Modal

Paste-ready Claude Code launch prompt. Generated 2026-05-02 post-Phase-0.5 close-out (PR #75 merged at `4f5c3d6`). Boilerplate-baked version. Absorbs the prior "Tier 2 Ticket Resolution UI" sprint scope into the Source Onboarder agent modal — both surfaces share one workflow. Parallel-safe with M1, M3, M4, M5.

## Goal

Implement the Source Onboarder agent modal per `SPEC - Agent Console (Metacron).md` §5.2. Uses Phase 0.5 shell. Refactors existing standalone `AddSourcePanel.tsx` into the modal pattern. Adds Tier 2 escalation review flow. Adds history grid. Exports `Tier2ResolveModal` for M1 (Coverage Expansion) and other future agents to reuse.

## Authoritative spec

`Company Docs/Specs/SPEC - Agent Console (Metacron).md` §5.2 + §4 + §6

## Read first (in order)

1. `Company Docs/Prompts/_BOILERPLATE - Hard Constraints for Claude Code.md`
2. `Company Docs/Specs/SPEC - Agent Console (Metacron).md` (§5.2 the focus)
3. `Company Docs/Specs/SPEC - Source Onboarder Agent.md` (if present)
4. `Company Docs/Context/00 - METACRON CONTEXT.md`
5. `MEMORY/audit-unicron-platform.md` — Stream C ↔ Stream E Source Onboarder + Tier 2 contracts sections
6. Existing `unicron-platform/src/views/AddSourcePanel.tsx` (refactor target — archive, not delete, after migration)
7. Existing `unicron-platform/src/lib/sourceOnboarderClient.ts`
8. Phase 0.5 outputs (shell components + agent registry)

## Phase 0.5 baseline

- main HEAD: `4f5c3d6`
- Agent console foundation shipped (see M1 prompt for the full inventory)
- Routing: tab-state inside Agents tab; no react-router

## Hard constraints

```
## Hard constraints

**File system:**
- DO NOT delete files. Per `feedback_no_deletes.md` — never `rm`, `rm -rf`, `rm -f`, `git clean`, `git clean -fd`, `git checkout -- .`, `git reset --hard`, or any operation that wipes uncommitted work.
- If a file appears stale or duplicate, MOVE it to `_archive/<descriptive-name>` rather than delete.
- Build artifacts (`.next/`, `dist/`, `node_modules/`, `test-results/`, `coverage/`, `.DS_Store`) are exempt — those can be cleaned/regenerated.
- Source-of-truth content (docs, code, configs, customer data, MEMORY files) is NEVER deleted.

**Git workflow:**
- COMMIT after every set of file moves or new files. Don't leave uncommitted work between gates.
- COMMIT before any branch switch, pull, or stash.
- Use `git mv` (not `mv`) for renames.
- If state needs to be set aside, use `git stash --include-untracked` (never plain `git stash`).
- Never `git clean`, never `git checkout -- <untracked-path>`, never `git reset --hard <ref>`.

**Folder structure:**
- New artifacts go to canonical paths under `Company Docs/`, `Brand/`, or `Customers/`.
- Do NOT create new top-level folders without coordination.
- Do NOT create files at workspace root.
- Do NOT touch `_demo-snapshot-*/` or `Snapshots/*/`.

**Cross-app boundaries:**
- Metacron chat owns: `unicron-platform/`, `unicron.*` schema, `metacron` Vercel project, Metacron Kanban.
- Don't write to Pathfinder territory. Surface dependencies via `MEMORY/operator-todos/`.

**Kanban hygiene:**
- At start: card → "In Process" via `notion-update-page`
- At end: card → "Deployed" / "Review" / "Bug Fixes" / "Not Yet Started" per outcome
- Never to "Verified" — Kyle-only
- Append `Implemented at <commit-sha> · merged at <ISO timestamp>` on merge

**Auto-merge criteria (ALL must be true):**
1. CI green (lint, typecheck, test)
2. Local pre-flight: `npm ci && npm run typecheck && npm test` from `unicron-platform/`
3. PR mergeable
4. PR body has verbatim evidence
5. Stream-specific smoke per spec acceptance
6. Additive migrations only
7. Multi-Vercel state captured (metacron + unicron-systems + pathfinder all READY)

**Auto-revert triggers:**
- Vercel deploy ERROR for the merge commit on metacron
- Smoke test fails post-deploy
- Previously-200 routes return 5xx
- `pathfinder.llm_calls` writes go to zero in 15 min
- Cost spike >3x baseline

**Auto-revert procedure:**
git checkout main && git pull origin main
git revert <merge-sha> --no-edit
git push origin main

**Hard halts:**
1. Production-data destruction risk
2. Auth boundary changes
3. Customer-facing commitment
4. 3 consecutive auto-reverts
5. Vercel error you can't trace
6. Schema collision
7. Token leak indicator

**No numeric estimates** — no time estimates, no cost caps.

**Tone:** tight, verbatim evidence in PR descriptions.
```

## Endpoints to wire (Stream E shipped)

- `POST /api/sources/onboard?sync=1` — single-phase onboard (default async without `?sync=1`)
- `GET /api/sources/sessions/[id]` — poll `reasoning_log` for live execution
- `GET /api/architect/inbox?category=source-discovery` — Tier 2 ticket list
- `POST /api/architect/inbox/[id]/resolve` — modes: `manual` / `dismiss` / `resume`

## Bridge: dispatches ↔ sessions ↔ tickets

- On Dispatch: insert `unicron.agent_dispatches` (`agent_name='source-onboarder'`, `status='running'`), then `POST /api/sources/onboard?sync=1`. Store `session_id` in `result_payload`.
- During run: poll sessions endpoint, append each `reasoning_log` line to `agent_dispatch_events`.
- On result `status='live'`: dispatch `status='awaiting_review'` (operator commits) or auto `status='verified'` (Tier 1 auto-verify per SPEC §6).
- On result `status='human-assist'`: dispatch `status='awaiting_review'`. Modal surfaces inline link to ticket → `Tier2ResolveModal`. Resolve action POSTs to inbox endpoint and updates the dispatch.
- On result `status='declined'`: dispatch `status='rejected'` with reason.

## In-scope files

- `unicron-platform/src/views/agents/SourceOnboarderModal.tsx` (new) — replaces `AddSourcePanel.tsx`; uses `AgentModalShell`
- `unicron-platform/src/lib/agents/sourceOnboarderAgent.ts` (new) — registry entry
- `unicron-platform/src/components/agents/source-onboarder/SourceOnboarderInputForm.tsx` (new) — URL or description, hint dropdown (`socrata` / `rest` / `rss` / `json-dump`), jurisdiction, test flag
- `unicron-platform/src/components/agents/source-onboarder/SourceOnboarderResultPanel.tsx` (new) — adapter code preview, sample events, Tier 1-vs-Tier 2 decision with reasoning, Commit button
- `unicron-platform/src/components/agents/Tier2ResolveModal.tsx` (new — exported for M1 + future agents to reuse) — notes textarea, manual_overrides JSON editor, manual / dismiss / resume actions
- `unicron-platform/src/lib/inboxClient.ts` (new — separate from `agentConsoleClient.ts` and `architectClient.ts`) — typed wrapper for inbox list + resolve
- `unicron-platform/src/lib/contracts/inbox.ts` (new) — wire types
- `unicron-platform/src/data/mocks.ts` (additive — `sourceOnboarderDispatchesMock`, `inboxTicketsMock`)
- `unicron-platform/src/lib/agentRegistry.ts` (extend — register `source-onboarder`; do NOT modify other entries)
- ARCHIVE `unicron-platform/src/views/AddSourcePanel.tsx` to `unicron-platform/src/views/_archive/AddSourcePanel.tsx` (do not delete; per `feedback_no_deletes.md`). Update any orphan imports to point at the new modal.
- `unicron-platform/__tests__/agents/source-onboarder/*.test.ts` (new — Tier 1 happy path, Tier 2 escalation + resolve flow, mock vs real mode)

## Out of scope

- `architectClient.ts` and `architectAdapters.ts` (do NOT modify; M4 reads but doesn't change them)
- Coverage modal (M1 owns)
- Architect modal (M4 owns)
- Cross-Pollination modal (M5 owns)
- `pathfinder.agent_verifications` writes (Phase 1F)
- Edit-mode for adapter code (preview-only this PR; Edit is a follow-up sprint)

## UX requirements (per SPEC §5.2)

**Input panel:**
- Source URL or candidate description (textarea, either-or)
- Source type hint (auto-detect default)
- Owner / jurisdiction (optional)
- Test flag (run end-to-end without committing)

**Live panel:**
- Investigation steps streamed: "Fetching robots.txt → identifying schema → generating adapter → testing first event → committing..."
- Adapter code preview (live, syntax-highlighted, read-only)
- First sample event preview (when available)

**Result panel:**
- Generated adapter code (read-only)
- First-N sample events
- Tier 1 onboarded vs Tier 2 escalated (or declined) decision with reasoning
- Commit button (Tier 1 only) or "Open Tier 2 ticket" link (escalation path)

**Tier 2 path:**
- Result panel surfaces inline: "This source needs your help — open ticket"
- Click → `Tier2ResolveModal` opens (notes textarea required for manual + dismiss; manual_overrides JSON editor for `manual` mode)
- Submit → `POST /api/architect/inbox/[id]/resolve` → updates dispatch row + closes modal

**History grid:** prior onboarding dispatches; tiles show source name, decision (Tier 1 / Tier 2 / declined), cost, verification state.

**Mock mode** (`VITE_SOURCE_ONBOARDER_ENABLED=false` and/or `VITE_ARCHITECT_API_ENABLED=false`): full demoable flow for both Tier 1 and Tier 2 paths.

## Sprint-specific auto-merge criteria

- Modal renders end-to-end in mock mode for Tier 1, Tier 2, and declined paths
- Real-mode Tier 1 onboard creates `unicron.agent_dispatches` row + POSTs to `/api/sources/onboard?sync=1`
- Real-mode Tier 2 escalation surfaces ticket; resolve action POSTs to inbox endpoint and updates dispatch
- `metacron` Vercel preview deploy state=READY
- Existing Architect Inbox proposals (Stream D slice) still render unchanged
- Old `AddSourcePanel` route returns either 404 or redirects to `/agents/source-onboarder` (or its tab-state equivalent)

## Sprint-specific hard halts

- Resolve requires service-role auth that anon doesn't have (surface env config request)
- Stream E endpoint contract drift from audit doc

## Multi-Vercel verification rule

`metacron`, `unicron-systems`, `pathfinder` — most recent main deploy state=READY. Auto-revert on any regression.

## Kanban hygiene

TWO cards on Metacron Kanban (`collection://07970e18-984a-4034-b491-cde76b9b1bad`):
- **"Source Onboarder Modal"** — CREATE new card. At run start: `In Process`. At end: `Deployed` / `Review` / `Bug Fixes`.
- **"Tier 2 ticket resolution UI"** — existing card. At run start: `In Process`. At end: same outcomes (its scope is fully absorbed into the Source Onboarder modal).

Existing "Add Source UI (Stream E consumer, single-phase)" card (currently Deployed): append note `Refactored into Source Onboarder Modal at <commit-sha>` and leave in Deployed.

NEVER `Verified`. On merge, append to BOTH cards: `Implemented at <commit-sha> · merged at <ISO timestamp>`.

## PR description requirements

- Verbatim test output
- `metacron` deploy URL + state
- Multi-Vercel state (metacron + unicron-systems + pathfinder)
- Screenshots: input panel, live execution, Tier 1 result with Commit, Tier 2 result with escalation link, `Tier2ResolveModal` for each mode (manual / dismiss / resume), history grid
- Verbatim curl response from `/api/sources/onboard?sync=1`, `/api/sources/sessions/[id]`, `/api/architect/inbox?category=source-discovery`, `/api/architect/inbox/[id]/resolve`
- Verbatim `unicron.agent_dispatches` row + sample `agent_dispatch_events` rows
- Confirmation Architect Inbox (Stream D slice) renders unchanged

## On completion

Append to `MEMORY/progress.md` under `## Stream M2 (Metacron) — 2026-05-02`:
- Files created + archived
- Test count delta
- Resolve permission status (anon vs service-role) and any env todos
- `Tier2ResolveModal` export contract for M1 + future agents to consume
- Kanban card movements (both cards)

Halt and surface only on hard halts or completion.

Begin.
