# PROMPT — Phase 1 / Stream M5: Cross-Pollination Modal

Paste-ready Claude Code launch prompt. Generated 2026-05-02 post-Phase-0.5 close-out (PR #75 merged at `4f5c3d6`). Boilerplate-baked version. Parallel-safe with M1, M2, M3, M4.

## Goal

Implement the Cross-Pollination Engine agent modal per `SPEC - Agent Console (Metacron).md` §5.4. Operator reviews ambiguous matches between leads and existing customer relationships. Uses Phase 0.5 shell.

## Authoritative spec

`Company Docs/Specs/SPEC - Agent Console (Metacron).md` §5.4 + §4 + §6

## Read first (in order)

1. `Company Docs/Prompts/_BOILERPLATE - Hard Constraints for Claude Code.md`
2. `Company Docs/Specs/SPEC - Agent Console (Metacron).md`
3. `Company Docs/Specs/SPEC - Cross-Pollination Engine.md` (if present)
4. Existing `pathfinder.cross_pollination_matches` table schema (read-only Supabase MCP query)
5. Phase 0.5 outputs
6. Existing Pathfinder cross-pollination cron implementation in `Pathfinder/lib/` (read-only)

## Phase 0.5 baseline

- main HEAD: `4f5c3d6`
- Agent console foundation shipped
- Routing: tab-state inside Agents tab

## Hard constraints

```
## Hard constraints

**File system:**
- DO NOT delete files. Never `rm`, `rm -rf`, `rm -f`, `git clean`, `git clean -fd`, `git checkout -- .`, `git reset --hard`, or wipe uncommitted work.
- Stale files → `_archive/`.
- Build artifacts exempt; source-of-truth never deleted.

**Git workflow:**
- COMMIT after every set of file moves or new files.
- COMMIT before any branch switch, pull, or stash.
- `git mv` for renames; `git stash --include-untracked` for stash.
- Never `git clean`, `git checkout -- <untracked-path>`, `git reset --hard <ref>`.

**Folder structure:**
- New artifacts to canonical paths under `Company Docs/`, `Brand/`, `Customers/`.
- No new top-level folders.
- No files at workspace root.
- Don't touch `_demo-snapshot-*/` or `Snapshots/*/`.

**Cross-app boundaries:**
- Metacron chat owns `unicron-platform/`, `unicron.*` schema, `metacron` Vercel project, Metacron Kanban.
- READ pathfinder.cross_pollination_matches; WRITE only verify/manual-match fields. Don't author new pathfinder schema; surface via `MEMORY/operator-todos/`.

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
7. Multi-Vercel state captured

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

## Endpoints

Cross-pollination is currently cron-driven on the Pathfinder side. Verify whether an HTTP dispatch endpoint exists by grepping `Pathfinder/app/api/`.

- If `POST /api/cross-pollination/run` (or similar) exists: wire it for on-demand dispatch
- If absent: ship modal in **review-only mode** (lists existing matches, allows Verify on ambiguous ones); the on-demand "Run" button surfaces a "Coming soon" tooltip + files an operator-todo for Pathfinder chat

## Bridge

- On Verify (operator approves a match): update `pathfinder.cross_pollination_matches.verified_by_user_id` + `verified_at`. Insert `unicron.agent_dispatches` row (`agent_name='cross-pollination'`, `status='verified'`, `result_payload={match_id, ...}`)
- Manual match: operator types entity name + relationship → write new `pathfinder.cross_pollination_matches` row with `manual=true` flag

## In-scope files

- `unicron-platform/src/views/agents/CrossPollinationModal.tsx` (new) — uses `AgentModalShell`
- `unicron-platform/src/lib/agents/crossPollinationAgent.ts` (new) — registry entry
- `unicron-platform/src/components/agents/cross-pollination/CrossPollinationInputForm.tsx` (new) — lead ID or batch, match confidence threshold slider, customer corpus dropdown
- `unicron-platform/src/components/agents/cross-pollination/MatchReviewPanel.tsx` (new) — matches sorted by confidence; ambiguous (0.7-0.9) highlighted; per-match Verify / Reject; manual-match form
- `unicron-platform/src/lib/crossPollinationClient.ts` (new) — Supabase reads on `pathfinder.cross_pollination_matches`; verify writes
- `unicron-platform/src/lib/contracts/crossPollination.ts` (new)
- `unicron-platform/src/data/mocks.ts` (additive)
- `unicron-platform/src/lib/agentRegistry.ts` (extend — register `cross-pollination`; do NOT modify other entries)
- `unicron-platform/__tests__/agents/cross-pollination/*.test.ts`

## Out of scope

- `pathfinder.*` schema changes (any new fields needed surface as operator-todo)
- Pathfinder cross-pollination engine changes (Pathfinder chat owns)
- Other agent modals
- Phase 0.5 shell

## UX requirements (per SPEC §5.4)

**Input panel:**
- Lead ID (single) or batch (paste IDs / select from recent leads)
- Match confidence threshold slider (default 0.7)
- Customer corpus (default: current org)

**Live panel:**
- Each candidate match streaming: matched entity, layer (exact / fuzzy / parent), confidence, existing relationship metadata (deal stage, last contact, owner)

**Result panel:**
- Matches sorted by confidence desc
- Ambiguous band (0.7-0.9) highlighted + per-match Verify / Reject buttons
- High-confidence (>0.9) auto-verified by default; operator can revoke
- Manual match path: text input for entity name + dropdown for relationship type → adds a manual match

**History grid:** prior dispatches; tile shows lead/batch + verified-match count.

**Mock mode:** full demoable flow.

## Sprint-specific auto-merge criteria

- Modal renders in review-only mode against real `pathfinder.cross_pollination_matches`
- Verify action successfully updates the match row
- Manual match insert succeeds
- `metacron` preview state=READY
- No regression in `pathfinder` or `unicron-systems` deploys

## Sprint-specific hard halts

- `pathfinder.cross_pollination_matches` schema doesn't have `verified_by_user_id` / `verified_at` / `manual` columns (file operator-todo for Pathfinder chat to add; ship modal in degraded read-only mode)
- Anon can't write to the table (need service-role; surface env config)

## Multi-Vercel verification rule

`metacron`, `unicron-systems`, `pathfinder` — all main deploys state=READY post-merge. Auto-revert on any regression.

## Kanban hygiene

CREATE card on Metacron Kanban (`collection://07970e18-984a-4034-b491-cde76b9b1bad`):
- Title: **"Cross-Pollination Modal"**
- At run start: `In Process`
- At end: `Deployed` / `Review` / `Bug Fixes` per outcome. NEVER `Verified`
- On merge, append: `Implemented at <commit-sha> · merged at <ISO timestamp>`

## PR description requirements

- Verbatim test output
- `metacron` deploy URL + state
- Multi-Vercel state (all three)
- Screenshots: input panel, live execution (or empty if no on-demand endpoint), match review panel, manual match form, history grid
- Verbatim sample query output from `pathfinder.cross_pollination_matches`
- Operator-todo path if on-demand endpoint or schema columns are missing

## On completion

Append to `MEMORY/progress.md` under `## Stream M5 (Metacron) — 2026-05-02`:
- Mode shipped (review-only vs full on-demand dispatch)
- Schema gaps surfaced
- Outstanding TODOs
- Kanban card link

Halt and surface only on hard halts or completion.

Begin.
