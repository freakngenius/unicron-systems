# PROMPT — Phase 1 / Stream M4: Architect Modal (3 sub-modes)

Paste-ready Claude Code launch prompt. Generated 2026-05-02 post-Phase-0.5 close-out (PR #75 merged at `4f5c3d6`). Boilerplate-baked version. Parallel-safe with M1, M2, M3, M5.

## Goal

Implement the Architect agent modal per `SPEC - Agent Console (Metacron).md` §5.3 with three sub-modes: Decomposition (new vertical), Tuning (weekly per-org), Discovery (continuous source finding). Uses Phase 0.5 shell.

## Authoritative spec

`Company Docs/Specs/SPEC - Agent Console (Metacron).md` §5.3 + §4 + §6

## Read first (in order)

1. `Company Docs/Prompts/_BOILERPLATE - Hard Constraints for Claude Code.md`
2. `Company Docs/Specs/SPEC - Agent Console (Metacron).md`
3. `Company Docs/Specs/SPEC - Architect Agent.md` (if present)
4. `MEMORY/audit-unicron-platform.md` — Stream C ↔ Stream D Architect contract
5. Existing `unicron-platform/src/views/ArchitectInbox.tsx` (do NOT modify — read for context)
6. Existing `unicron-platform/src/lib/architectClient.ts` and `architectAdapters.ts` (do NOT modify — both stable per audit; this sprint adds NEW code paths only)
7. Phase 0.5 outputs

## Phase 0.5 baseline

- main HEAD: `4f5c3d6`
- Agent console foundation shipped
- Routing: tab-state inside Agents tab

## Hard constraints

```
## Hard constraints

**File system:**
- DO NOT delete files. Never `rm`, `rm -rf`, `rm -f`, `git clean`, `git clean -fd`, `git checkout -- .`, `git reset --hard`, or any operation that wipes uncommitted work.
- If a file appears stale, MOVE to `_archive/`.
- Build artifacts exempt; source-of-truth content never deleted.

**Git workflow:**
- COMMIT after every set of file moves or new files.
- COMMIT before any branch switch, pull, or stash.
- Use `git mv` for renames.
- `git stash --include-untracked` if state needs setting aside.
- Never `git clean`, `git checkout -- <untracked-path>`, `git reset --hard <ref>`.

**Folder structure:**
- New artifacts to canonical paths.
- No new top-level folders.
- No files at workspace root.
- Don't touch `_demo-snapshot-*/` or `Snapshots/*/`.

**Cross-app boundaries:**
- Metacron chat owns: `unicron-platform/`, `unicron.*` schema, `metacron` Vercel project, Metacron Kanban.
- Don't write to Pathfinder territory. Use `MEMORY/operator-todos/` for cross-chat coordination.

**Kanban hygiene:**
- Start: → "In Process". End: → "Deployed" / "Review" / "Bug Fixes". Never "Verified".
- Append `Implemented at <commit-sha> · merged at <ISO timestamp>` on merge.

**Auto-merge criteria:**
1. CI green
2. Local: `npm ci && npm run typecheck && npm test` from unicron-platform/
3. PR mergeable
4. Verbatim evidence in PR body
5. Stream-specific smoke
6. Additive migrations only
7. Multi-Vercel state captured (all three projects READY)

**Auto-revert triggers:**
- Vercel deploy ERROR on metacron
- Smoke test fails post-deploy
- Previously-200 routes 5xx
- `pathfinder.llm_calls` writes zero in 15 min
- Cost spike >3x baseline

**Auto-revert procedure:**
git checkout main && git pull origin main
git revert <merge-sha> --no-edit
git push origin main

**Hard halts:**
1. Production-data destruction
2. Auth boundary changes
3. Customer-facing commitment
4. 3 consecutive auto-reverts
5. Untraceable Vercel error
6. Schema collision
7. Token leak indicator

**No numeric estimates.** Tight tone, verbatim PR evidence.
```

## Endpoints (Stream D shipped)

- `POST /api/architect/decompose`
- `POST /api/architect/tune`
- `POST /api/architect/discover`

All Bearer-authenticated via `VITE_ARCHITECT_API_TOKEN`.

## Bridge

- On Dispatch (any sub-mode): insert `unicron.agent_dispatches` (`agent_name='architect'`, `input_payload={ mode: 'decomposition'|'tuning'|'discovery', ...inputs }`, `status='running'`), then POST corresponding endpoint.
- During run: Stream D returns `reasoning: string[]` at completion (no SSE). Append each reasoning line as a separate `agent_dispatch_events` row at completion time (live panel renders type-on animation off the array).
- On Verify: write `verified_by_user_id` + `verified_at`. Mode-specific side-effects:
  - Decomposition: write proposal rows to `architect_proposals` (already done by Stream D), surface to Architect Inbox view
  - Tuning: write proposed weight updates to `unicron.tuning_proposals` (table TBD; if absent file operator-todo)
  - Discovery: candidates feed Coverage Expansion or operator inbox

## In-scope files

- `unicron-platform/src/views/agents/ArchitectModal.tsx` (new) — sub-mode tabs (Decomposition / Tuning / Discovery), uses `AgentModalShell`
- `unicron-platform/src/lib/agents/architectAgent.ts` (new) — registry entry with three form schemas
- `unicron-platform/src/components/agents/architect/DecompositionForm.tsx` (new)
- `unicron-platform/src/components/agents/architect/DecompositionResult.tsx` (new) — structured architecture proposal renderer
- `unicron-platform/src/components/agents/architect/TuningForm.tsx` (new)
- `unicron-platform/src/components/agents/architect/TuningResult.tsx` (new) — weight-update table with per-row Verify
- `unicron-platform/src/components/agents/architect/DiscoveryForm.tsx` (new)
- `unicron-platform/src/components/agents/architect/DiscoveryResult.tsx` (new) — ranked source candidates with feed-to-coverage button
- `unicron-platform/src/lib/agentRegistry.ts` (extend — register `architect`; do NOT modify other registry entries)
- `unicron-platform/src/data/mocks.ts` (additive — `architectDecompositionMock`, `architectTuningMock`, `architectDiscoveryMock`)
- `unicron-platform/__tests__/agents/architect/*.test.ts` (new — one suite per sub-mode + cross-mode history grid)

## Out of scope

- `ArchitectInbox.tsx`, `architectClient.ts`, `architectAdapters.ts` (do NOT modify)
- Other agent modals
- Phase 0.5 shell
- `pathfinder.agent_verifications` writes (Phase 1F)

## UX requirements (per SPEC §5.3)

### Mode A: Decomposition
- **Input:** buyer pain prompt (textarea, free text); optional vertical_id, customer_org_id, existing_vertical_id, constraints, trigger
- **Live:** Architect's reasoning chain renders as type-on lines; tool calls visible inline
- **Result:** structured architecture proposal (agents needed, sources to onboard, scoring weights, success criteria)
- **Verify:** spawns dependent jobs (TODO: emit dispatch fan-out events for Coverage Expansion + Source Onboarder; if those auto-spawns aren't ready, leave a placeholder + operator-todo)

### Mode B: Tuning
- **Input:** org_id, lookback window for behavior data
- **Live:** which agents tuned, what weights changed, why
- **Result:** list of proposed weight updates with confidence; per-row Verify checkbox
- **Verify:** approve each individually or batch

### Mode C: Discovery
- **Input:** vertical_id, optional geographic focus
- **Live:** search reasoning, source candidates surfacing
- **Result:** ranked source candidates with confidence + expected impact
- **Verify:** feed to Coverage Expansion (writes to `unicron.coverage_goals` queue) or to operator inbox

History grid: shows runs across all three sub-modes; tile color-coded by mode.

## Sprint-specific auto-merge criteria

- All three sub-modes render and dispatch correctly in mock mode
- Real-mode dispatch creates `unicron.agent_dispatches` and POSTs to corresponding endpoint
- `metacron` preview state=READY
- No regression in `pathfinder` or `unicron-systems` deploys
- Existing Architect Inbox + architectClient tests still pass

## Sprint-specific hard halts

- `unicron.tuning_proposals` table absent and Stream D doesn't expose where Tuning writes results (surface for Kyle)
- Decomposition fan-out endpoints don't exist (place TODO + operator-todo, ship without auto-fan-out)

## Multi-Vercel verification rule

`metacron`, `unicron-systems`, `pathfinder` — all main deploys state=READY post-merge. Auto-revert on any regression.

## Kanban hygiene

CREATE card on Metacron Kanban (`collection://07970e18-984a-4034-b491-cde76b9b1bad`):
- Title: **"Architect Modal (decomposition + tuning + discovery)"**
- At run start: `In Process`
- At end: `Deployed` / `Review` / `Bug Fixes` per outcome. NEVER `Verified`
- On merge, append: `Implemented at <commit-sha> · merged at <ISO timestamp>`

## PR description requirements

- Verbatim test output
- `metacron` deploy URL + state
- Multi-Vercel state (all three)
- Screenshots: each sub-mode (input + live + result), history grid filtered by mode
- Verbatim curl response from each of the three Architect endpoints
- Verbatim `unicron.agent_dispatches` row for one dispatch in each mode
- Confirmation existing Architect Inbox unchanged

## On completion

Append to `MEMORY/progress.md` under `## Stream M4 (Metacron) — 2026-05-02`:
- Files created
- Sub-mode coverage status (any deferred to Phase 2)
- Outstanding TODOs (decomposition fan-out, tuning side-effects)
- Kanban card link

Halt and surface only on hard halts or completion.

Begin.
