# BOILERPLATE — Hard Constraints for Every Claude Code Sprint Prompt

Single source of truth for safety constraints that EVERY paste-ready Claude Code prompt must include. Future sprint prompts copy this section verbatim into their "Hard constraints" block.

Last updated: 2026-05-02 (after the data loss event that wiped 7 uncommitted docs)

---

## Folder structure (current as of 2026-05-02)

Workspace root: `/Users/keka/Dropbox/Projects/Unicron Systems/`

Top-level layout:
- `CLAUDE.md`, `README.md` — only these two files belong at workspace root
- `MEMORY/` — project memory shared by all chats and sessions
- `Pathfinder/` — Pathfinder Next.js app (sister `pathfinder-ashy` Vercel project)
- `unicron-platform/` — Metacron Vite + React app (`metacron` Vercel project)
- `Marketing Site/` — gitignored Phase 2 staging; full move deferred post-Tuesday-demo
- `Pathfinder-worktrees/`, `Phase2-worktrees/` — active git worktrees (gitignored)
- `_demo-snapshot-2026-04-30/` — locked rollback artifact (read-only)
- `_archive/` — for files moved out but preserved per no-deletes rule
- `Company Docs/` — all PRDs, Specs, Prompts, Reports, Plans, Context, Vision, Misc Docs
- `Brand/` — Images, Source PSDs, Manifesto Pages HTMLs, Presentation decks
- `Customers/` — customer-specific data dumps (e.g., `Customers/Zedcor/`)
- Marketing site code at workspace root: `app/`, `components/`, `lib/`, `public/`, `scripts/`, `supabase/`, `tests/`, plus `*.config.*` files, `package.json`, `package-lock.json`, `node_modules/`, `middleware.ts`, etc.

When generating new artifacts:
- PRDs → `Company Docs/PRD/`
- Specs → `Company Docs/Specs/`
- Sprint launch prompts → `Company Docs/Prompts/`
- Build reports / retros → `Company Docs/Reports/`
- Execution playbooks / runbooks → `Company Docs/Plans/`
- Context docs for new chats → `Company Docs/Context/`
- Vision / philosophy docs → `Company Docs/Vision/`
- Customer data → `Customers/<customer-name>/`

Do NOT create:
- New top-level folders without coordination
- Files at workspace root (only `CLAUDE.md` and `README.md` belong there)
- Files inside `_demo-snapshot-*/` or `Snapshots/*/` — locked rollback

---

## Hard constraints (copy this block verbatim into every sprint prompt)

```
## Hard constraints

**File system:**
- DO NOT delete files. Per `feedback_no_deletes.md` — never `rm`, `rm -rf`, `rm -f`, `git clean`, `git clean -fd`, `git checkout -- .`, `git reset --hard`, or any operation that wipes uncommitted work.
- If a file appears stale or duplicate, MOVE it to `_archive/<descriptive-name>` rather than delete.
- Build artifacts (`.next/`, `dist/`, `node_modules/`, `test-results/`, `coverage/`, `.DS_Store`) are exempt — those can be cleaned/regenerated.
- Source-of-truth content (docs, code, configs, customer data, MEMORY files) is NEVER deleted.

**Git workflow:**
- COMMIT after every set of file moves or new files. Don't leave uncommitted work between gates.
- COMMIT before any branch switch, pull, or stash. Untracked + uncommitted work gets wiped by `git checkout`.
- Use `git mv` (not `mv`) for renames so git tracks them as renames, not delete+add.
- If state needs to be set aside, use `git stash --include-untracked` (never plain `git stash`).
- Never `git clean`, never `git checkout -- <untracked-path>`, never `git reset --hard <ref>`.

**Folder structure:**
- New artifacts go to the canonical paths under `Company Docs/`, `Brand/`, or `Customers/`. See folder layout above.
- Do NOT create new top-level folders without coordination.
- Do NOT create files at workspace root (only CLAUDE.md and README.md belong there).
- Do NOT touch `_demo-snapshot-*/` or `Snapshots/*/` — locked rollback artifacts.

**Cross-app boundaries:**
- Pathfinder chat owns: `Pathfinder/`, `pathfinder.*` schema, `pathfinder-ashy` Vercel project, Pathfinder Kanban.
- Metacron chat owns: `unicron-platform/`, `unicron.*` schema, `metacron` Vercel project, Metacron Kanban.
- Marketing site code at workspace root: cross-cutting; coordinate before changes.
- Don't write to the other chat's territory. Surface dependencies via `MEMORY/operator-todos/`.

**Kanban hygiene** (per `feedback_kanban_auto_update.md`):
- At start of each gate: card → "In Process" via `notion-update-page`
- At end: card → "Deployed" (shipped + merged + deployed), "Review" (PR open awaiting human merge), "Bug Fixes" (parked needing fix), or "Not Yet Started" (deferred)
- Never to "Verified" — Kyle-only
- Append `Implemented at <commit-sha> · merged at <ISO timestamp>` footer to card content on merge

**Auto-merge criteria (ALL must be true):**
1. CI green (lint, typecheck, test, spec-references-check)
2. Local pre-flight: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test` from Pathfinder/ AND repo root (or `npm ci && npm run build` for unicron-platform / Marketing Site, which use npm)
3. No merge conflicts (`gh pr view --json mergeable` = MERGEABLE)
4. PR body has verbatim evidence of the gate's verification
5. Stream-specific eval/smoke per spec acceptance criteria
6. Additive migrations only (no DROP, no destructive ALTER)
7. Multi-Vercel state captured before merge (Pathfinder + metacron + unicron-systems projects)

**Auto-revert triggers (revert immediately if any):**
- Vercel deploy ERROR for the merge commit on YOUR project (Pathfinder agents revert on Pathfinder; Metacron on metacron). Pre-existing unicron-systems ERROR (Issue #48 era) is acceptable; only revert on regression from your project.
- Smoke test fails post-deploy
- Previously-200 routes return 5xx
- `pathfinder.llm_calls` writes go to zero in 15 min (telemetry regression)
- Inngest function dropped from registry
- Cost spike >3x baseline

**Auto-revert procedure:**
```
git checkout main && git pull origin main
git revert <merge-sha> --no-edit
git push origin main
```

**Hard halt conditions (wake Kyle):**
1. Production-data destruction risk
2. Auth boundary changes (middleware.ts, RLS policies, basic-auth)
3. Customer-facing commitment (billing, external messaging, modifying customer data submitted by them)
4. 3 consecutive auto-reverts (systemic issue)
5. Vercel error you cannot trace via `get_deployment_build_logs`
6. Eval threshold breach where the fix isn't obvious from misses
7. Schema collision with already-applied migrations on live Supabase
8. Token leak indicator in logs (regex match on common token formats)
9. Cross-tenant data leakage in audit log
10. Customer-facing message sent to wrong channel/user

**No numeric estimates** (per `feedback_prompts_no_estimates_or_caps.md`):
- No time estimates ("~3 hours", "1-2 weeks")
- No cost caps ("$40 budget", "halt at $20")
- Track cost in wake-up report; halt only on the explicit hard-halt list above

**Tone for Kyle's review** (per `feedback_token_rigor.md`):
- Tight, no fluff in chat reports
- Verbatim evidence in PR descriptions
- Surface escalations via Slack webhook (or fallback to `MEMORY/<sprint>-notifications.md`)
```

---

## How to use this boilerplate

1. When generating a new Claude Code sprint prompt, copy the "Hard constraints" block above verbatim into the prompt.
2. Add sprint-specific gates and stream definitions on top of the boilerplate.
3. Reference this file by relative path in the prompt's "Read first" list: `Company Docs/Prompts/_BOILERPLATE - Hard Constraints for Claude Code.md` (so the Claude Code session can pull the latest constraints if this file evolves).

If a constraint here changes, update this file. Future prompts inherit the new behavior automatically by referencing it.
