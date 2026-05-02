# PLAN — Cleanup Sweep (post-sprint)

Batch of file/folder housekeeping deferred until active Claude Code sprints settle. Cowork executes this directly via bash + file tools.

When Kyle says "run the cleanup sweep" — read this doc, execute the steps in order, verify each, report results.

Last updated: 2026-05-02 (rewritten after data loss)

---

## Pre-flight (must be true before starting)

1. Connector Framework Sprint — completed or fully halted
2. Demo Polish Sprint — completed or fully halted
3. Zedcor Demo cleanup pass — completed
4. No active Claude Code session reading workspace files at the moment
5. Kyle has merged any pending PRs or accepted the work-in-progress state
6. Phase 1 folder reorg already committed (Company Docs/, Brand/, Customers/ tracked in git)

If any of these are false, halt and surface to Kyle. Don't run the sweep mid-flight.

---

## Step 1 — Rename `_demo-snapshot-2026-04-30/`

Target structure: `Snapshots/2026-04-30/` (new top-level Snapshots folder; supports multiple snapshots over time).

```bash
cd "/Users/keka/Dropbox/Projects/Unicron Systems"
mkdir -p Snapshots
git mv _demo-snapshot-2026-04-30 "Snapshots/2026-04-30"
```

(Note: per `feedback_no_deletes.md`, use `git mv` not `mv`. Commit immediately after the move so the rename is tracked.)

Verify: `ls Snapshots/` should show `2026-04-30/`. Top level should no longer have `_demo-snapshot-2026-04-30/`.

## Step 2 — Update `.gitignore`

Change the snapshot ignore pattern from underscored-prefix to the new Snapshots folder.

Open `.gitignore`, find:
```
# demo snapshots — read-only file-system rollback artifacts (see _demo-snapshot-*/README.md)
# Each snapshot is captured by a corresponding git tag (e.g. demo-snapshot-2026-04-30); the
# tag is the canonical record, the on-disk copy is the rollback artifact.
/_demo-snapshot-*/
```

Replace with:
```
# demo snapshots — read-only file-system rollback artifacts (see Snapshots/*/README.md)
# Each snapshot is captured by a corresponding git tag (e.g. demo-snapshot-2026-04-30); the
# tag is the canonical record, the on-disk copy is the rollback artifact.
/Snapshots/
```

## Step 3 — Update CLAUDE.md and other doc references

CLAUDE.md has multiple references to `_demo-snapshot-2026-04-30/` as off-limits. Use sed to find-replace:

```bash
sed -i 's|_demo-snapshot-2026-04-30/|Snapshots/2026-04-30/|g' CLAUDE.md
sed -i 's|_demo-snapshot-2026-04-30|Snapshots/2026-04-30|g' CLAUDE.md
```

Verify with grep — should return zero matches:
```bash
grep "_demo-snapshot" CLAUDE.md
```

## Step 4 — Sweep MEMORY/ and Company Docs/ for stale refs

```bash
grep -rln "_demo-snapshot-2026-04-30" MEMORY "Company Docs" 2>/dev/null
```

For each file returned, run the same sed replacement:
```bash
sed -i 's|_demo-snapshot-2026-04-30/|Snapshots/2026-04-30/|g' <file>
sed -i 's|_demo-snapshot-2026-04-30|Snapshots/2026-04-30|g' <file>
```

## Step 5 — Resolve `Product/` orphan

The folder contains only a protected `.env.local` (sandbox can't delete; macOS Finder can).

Surface to Kyle as a manual step:
- Option A: open Finder, navigate to `Product/`, archive `.env.local` to `Customers/_archive/old-env.local` if stale, then `rm -d Product` from terminal.
- Option B: leave as-is; cosmetic only.

Per `feedback_no_deletes.md`, do NOT attempt deletion from the sweep. Archive only. The `.env.local` may have residual env values Kyle wants to inspect first.

## Step 6 — Resolve duplicate Source/icon.psd at root

A 85MB `Source/icon.psd` may still exist at workspace root after the Phase 1 reorg, alongside the canonical `Brand/Source/icon.psd`.

Verify with `cmp -s "Source/icon.psd" "Brand/Source/icon.psd"`. If identical, archive the root copy:

```bash
mkdir -p _archive
git mv Source/icon.psd _archive/icon.psd.duplicate-from-root
```

Then `rmdir Source` (only succeeds if empty). Per `feedback_no_deletes.md`, do not delete; archive instead.

## Step 7 — Resolve empty `Presentation/` at root

After Phase 1, `Presentation/` at root may be empty. The canonical content is in `Brand/Presentation/`.

If empty, `rmdir Presentation` (succeeds if truly empty) is acceptable per the rule's exception (regeneratable build-like artifacts; an empty dir is not source-of-truth content).

If anything survived in there, archive instead:
```bash
mkdir -p _archive
git mv Presentation/* _archive/presentation-leftover/
```

## Step 8 — Verify post-sweep state

Run these checks:

```bash
cd "/Users/keka/Dropbox/Projects/Unicron Systems"

echo "===Top level folders===" && ls -d */ 

echo "===No stale snapshot refs===" && \
  grep -rln "_demo-snapshot" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=Pathfinder --exclude-dir=unicron-platform 2>/dev/null

echo "===Snapshots/ exists with content===" && \
  ls "Snapshots/2026-04-30/" | head -5

echo "===gitignore pattern updated===" && \
  grep -A 1 "demo snapshots" .gitignore
```

Expected:
- Top level: Brand, Company Docs, Customers, MEMORY, Marketing Site (gitignored), Pathfinder, Pathfinder-worktrees, Phase2-worktrees, Snapshots, _archive (if used), unicron-platform
- Zero stale refs (excluding node_modules, .git, Pathfinder/, unicron-platform/ which may have unrelated matches)
- Snapshots/2026-04-30/ has the expected snapshot contents
- gitignore shows `/Snapshots/` not `/_demo-snapshot-*/`

## Step 9 — Update memory rule

Append a one-line note to `MEMORY/learnings.md` (under a new subheading `## Cleanup sweep — 2026-05-XX`):

> Demo snapshot folder renamed from `_demo-snapshot-2026-04-30/` to `Snapshots/2026-04-30/` for cleaner organization. New snapshots go under `Snapshots/<date>/`. Off-limits rule unchanged: snapshot folders are read-only rollback artifacts, never modified.

## Step 10 — Commit + push

```bash
git add -A
git commit -m "chore(workspace): cleanup sweep — Snapshots/ rename + duplicate archive"
git push
```

## Step 11 — Final report to Kyle

One-line summary:
> Cleanup sweep complete. _demo-snapshot-2026-04-30/ → Snapshots/2026-04-30/. .gitignore updated. CLAUDE.md + N other doc references updated. Source/ duplicate archived. Product/ orphan flagged for manual cleanup.

---

## Out of scope for this sweep

- Marketing Site/ Phase 2 refactor (separate operation)
- Any code changes (this is purely housekeeping)
- Active sprint files (don't touch in-flight worktrees)
- The actual `.env.local` deletion in `Product/` (Kyle decides manually)
- File deletion of any kind (per `feedback_no_deletes.md`)

## Trigger phrase

When Kyle says "run the cleanup sweep" or "execute PLAN - Cleanup Sweep", Cowork reads this doc and runs Steps 1-11 in order. Verifies each step before proceeding. Halts on any unexpected error.
