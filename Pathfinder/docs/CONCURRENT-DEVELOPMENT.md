# Concurrent development — git worktrees + coordination protocol

**Status:** live · **Date:** 2026-04-28 · **Pairs with:** `docs/RUNTIME-ARCHITECTURE.md`, `~/.claude/projects/.../memory/deploy_chain.md`

Multiple Claude Code sessions can drive Pathfinder feature work in parallel without colliding on a shared filesystem. Each session is bound to **one git worktree on one feature branch**. The main checkout (`/Users/keka/Dropbox/Projects/Unicron Systems`) stays human-controlled for review and merging.

---

## Directory map

```
/Users/keka/Dropbox/Projects/Unicron Systems/                ← repo main checkout (human review only)
├── Pathfinder/                                               ← Pathfinder app source
└── Pathfinder-worktrees/                                     ← parallel feature worktrees
    ├── p0-02-outreach-drafter/                               ← feat/p0-02-outreach-drafter
    │   └── Pathfinder/
    │       └── node_modules/   (382 MB, isolated)
    ├── p0-04-slack-bot/                                      ← feat/p0-04-slack-bot
    │   └── Pathfinder/
    └── p0-06-source-expansion/                               ← feat/p0-06-source-expansion
        └── Pathfinder/
```

Each worktree is a **complete repo checkout** sharing the same `.git` directory via git's worktree mechanism. Branches, commits, refs, fetches are shared. **Working files, `node_modules`, build artifacts, and dirty state are isolated** per worktree.

Run `git worktree list` from the main checkout to see the current set:

```
/Users/keka/Dropbox/Projects/Unicron Systems                                              [main checkout]
/Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder-worktrees/p0-02-outreach-drafter  [feat/p0-02-outreach-drafter]
/Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder-worktrees/p0-04-slack-bot         [feat/p0-04-slack-bot]
/Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder-worktrees/p0-06-source-expansion  [feat/p0-06-source-expansion]
```

### Currently off-spec (migrate when convenient)

Two worktrees pre-existed at non-canonical paths with dirty in-progress work and were left in place:

```
/Users/keka/Dropbox/Projects/Unicron Systems-p0-01                              [feat/p0-01-intelligence-chat]
/Users/keka/.config/superpowers/worktrees/unicron-systems/p0-03-hubspot-sync   [feat/p0-03-hubspot-sync]
```

To migrate them into the canonical layout once that worktree's session reaches a clean state:

1. From inside the off-spec worktree: `git stash push -u -m "pre-migration"` (or commit + push if work is ready)
2. From the main checkout: `git worktree remove <off-spec-path>`
3. From the main checkout: `git worktree add ../Pathfinder-worktrees/<short-name> <branch>`
4. `cd ../Pathfinder-worktrees/<short-name>/Pathfinder && pnpm install`
5. If you stashed in step 1, `git stash pop` in the new worktree.

---

## Coordination protocol

### Hard rules

1. **One session, one worktree, one feature branch.** When a Claude Code session is dispatched to feature work, the prompt names the worktree directory it must `cd` into and the branch it must commit to. The session never touches files outside that worktree's tree.

2. **The main checkout (`/Users/keka/Dropbox/Projects/Unicron Systems`) is for human review and merging only.** AI-driven feature work never lands here. Kyle uses this checkout to read PR diffs, run `gh pr merge`, and run the occasional `git pull` to refresh the local view of `main`.

3. **No destructive filesystem operations outside the session's declared file scope.** That means:
   - No `rm -rf` of any path the session didn't create in this turn.
   - No `mv` that relocates files outside the worktree's `Pathfinder/` subtree.
   - No editing files that aren't part of the feature's stated scope.
   - No `git checkout -- .`, `git restore .`, `git clean -fdx`, `git reset --hard` without explicit confirmation that there's no uncommitted work to lose.

4. **Use `git stash` instead of filesystem moves for tidy-up.** If you want to set aside work-in-progress before switching contexts, `git stash push -u -m "<reason>"`. Never `mv` files into a "scratch" folder; never `rm` files to "clean up" before committing.

5. **Per-worktree dependency installs.** Each worktree has its own `node_modules`. Never symlink, never share, never `npm install` from the wrong directory.

6. **Each session works on the branch it was given, end-to-end.** If a session needs to pivot to a new branch (e.g., for a hotfix), it does so explicitly with a fresh `git checkout -b` inside its own worktree, completes the pivot, and returns to its assigned branch before yielding.

### Soft rules

- **Commit early and push often.** Fewer in-flight uncommitted files = fewer worktree migration headaches. Aim for at most a few hours between commits.
- **Pull `main` regularly.** Each worktree shares refs with the others, but `main` only updates when a session runs `git fetch` or `git pull origin main`. Stale `main` → merge surprises later.
- **Name branches by feature scope.** `feat/<short-id>-<topic>` matches the worktree directory name. Don't reuse a branch across two worktrees — git refuses anyway.
- **PR titles and bodies follow the deploy-chain runbook** at `~/.claude/projects/.../memory/deploy_chain.md` (every change → feature branch → PR → human merge → Vercel auto-deploys).

---

## How a Claude Code session uses its worktree

When a session is dispatched to (e.g.) `feat/p0-02-outreach-drafter`:

```bash
cd "/Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder-worktrees/p0-02-outreach-drafter/Pathfinder"
git status                         # confirm clean / on the right branch
# ... do feature work, edit files in this tree only ...
git add <specific-files>           # never `git add -A` from repo root
git commit -m "..."
git push -u origin feat/p0-02-outreach-drafter
gh pr create --head feat/p0-02-outreach-drafter --base main --title "..."
```

Verification commands stay scoped to the worktree:

```bash
pnpm typecheck                     # runs in this worktree's node_modules
pnpm lint
pnpm test
pnpm build
```

The session never `cd`'s into another worktree, the main checkout, or any path outside `Pathfinder-worktrees/<its-name>/`.

---

## Migration + cleanup commands (operator)

```bash
# List all current worktrees
git worktree list

# Remove a worktree (must be clean — git refuses if dirty)
git worktree remove ../Pathfinder-worktrees/<name>

# Force-remove a worktree even if dirty (destroys uncommitted work — confirm first)
git worktree remove --force ../Pathfinder-worktrees/<name>

# Prune metadata for worktrees whose directories were deleted manually
git worktree prune
```

After merging a PR, the worktree's branch is no longer needed. `gh pr merge --delete-branch` handles the remote; the local worktree can stay as a parking spot for the next feature on the same theme, or be removed via `git worktree remove`.
