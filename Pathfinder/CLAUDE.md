# Pathfinder — Claude Code session protocol

This file is loaded automatically at the start of every Claude Code session that opens the Pathfinder project. It is the source of truth for how AI feature work is organized, scoped, and coordinated across concurrent sessions. Read it once, follow it always.

If you are a feature session dispatched with a specific scope, follow the rules below first; defer to the dispatch prompt only for the scope itself, not the protocol.

---

## Worktree-only rule

Every AI feature session works in its assigned worktree under

```
/Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder-worktrees/<branch-slug>/
```

never in the main Pathfinder directory. The main directory (`/Users/keka/Dropbox/Projects/Unicron Systems/Pathfinder`) is for human review and merging. If a session finds itself running git commands in the main directory, that is a configuration error — **stop and report**.

The directory layout is documented in `docs/CONCURRENT-DEVELOPMENT.md`. Run `git worktree list` to confirm which branch your worktree tracks before you start.

---

## Branch discipline

- **Pull latest `main` and rebase your branch before significant work.** `git fetch origin && git rebase origin/main` from inside your worktree.
- **Never commit to `main` directly.** All changes flow through a feature branch, a PR, and a human merge. The deploy chain depends on this — Vercel auto-deploys from `main`, and unreviewed code reaching production has already burned us once.
- **Never merge your own PR.** Open the PR, hand off, wait. Humans review and merge.
- **Push at logical checkpoints, not just at the end.** A reasonable rhythm is: every passing test cycle, every working feature slice, every reviewable diff. Long-running uncommitted work is the most fragile state in the system.
- **If your assigned branch already exists with prior work, stop and report** rather than overwriting. `git log origin/<branch>..HEAD` and `git log HEAD..origin/<branch>` tell you what's where; never `--force` without explicit operator approval.

---

## Scope discipline

- **Stay inside the file scope declared in your feature prompt.** If the prompt says "modify `app/api/cron/foo/route.ts` and `lib/foo.ts`," those are your files. Editing anything else is out of scope.
- **If you find you need to modify files outside scope, stop and ask the user.** Don't expand the diff silently. Don't assume related cleanups are welcome. The cost of a clarifying question is small; the cost of an unexpected diff in someone else's review is large.
- **Trust git's three-way merge for shared files** like `vercel.json`, `lib/types.ts`, `lib/ingest/index.ts`, and `lib/notifications.ts`. **Add entries; do not replace existing ones.** Multiple branches will all add cron entries to `vercel.json`; the merge resolves cleanly when each branch only appends. Branches that rewrite the file produce conflicts.

---

## Filesystem operations ban

- **Never `mv`, `rm`, `cp`, or any destructive filesystem operation outside your declared file scope.** This is the rule that takes precedence over every "helpful cleanup" instinct you have.
- **Never use `2>/dev/null`** to silence errors on filesystem operations. If a command fails, you need to know. Stderr is signal, not noise.
- **For tidy-up during typecheck or test runs, use `git stash push -u -m "<reason>"` and `git stash pop`.** Never filesystem moves.
- This rule was added because a prior session destroyed peer work via a silently-failing `mv` to `/tmp`. The cleanup that doesn't appear in `git log` is the cleanup that hurts the most.

---

## Standard skills to invoke

These are the skills every Pathfinder feature session should run. The exact invocation is in each skill's docs; the order below is the default flow.

1. **`using-superpowers`** at session start — establishes the skills system and surfaces what's available.
2. **`writing-plans`** before any code — produce a written plan and write it to `docs/PLAN-<branch-slug>.md` in your worktree. Confirm the plan with the operator before touching code.
3. **`subagent-driven-development`** for parallel work within your branch — when the plan has 2+ independent tasks, dispatch them as parallel subagents.
4. **`verification-before-completion`** before reporting a task complete — typecheck, lint, test, build all green, with the actual command output captured. Evidence before assertions.
5. **`requesting-code-review`** after each subagent ships — self-review pass with the technical-rigor lens, before opening the PR.

`finishing-a-development-branch` is the right skill when implementation is complete and you're deciding how to close out the work (merge, PR, cleanup).

---

## Reference docs

The following are canonical and should be read (or re-read) when their topic is relevant. Specs are read-only unless your scope explicitly says otherwise.

- **`Pathfinder-Feature-Specs.md`** — canonical feature priorities and specs. Source of truth for what each P0 / P1 / P2 feature does and why it matters.
- **`Pathfinder-Claude-Code-Branch-Prompts.md`** — feature-by-feature branch templates. The prompts dispatched into each worktree are derived from this file.
- **`docs/RUNTIME-ARCHITECTURE.md`** — which agents run on Vercel cron vs Perplexity Spaces, the deferred-source list, the deploy chain. Read when adding or modifying an agent.
- **`docs/CONCURRENT-DEVELOPMENT.md`** — worktree layout and coordination protocol. Companion to this file with the operator-side commands and the off-spec migration steps.
- **`docs/PLAN-AGENTS.md`** — the layer-gated plan for the 8-agent expansion. Already executed through Layer 1; later layers may still ship via the plan.
- **`prompts/`** — canonical Computer agent system prompts. Read-only for feature sessions. Modifications go through the agent-spec author flow.
- **`agent-specs/`** — per-agent operational specs. Read-only.

---

## Deploy chain (summary)

The full rule lives in the operator memory. Short version:

```
feature branch → push to origin → open PR → human merge to main → Vercel auto-deploys
```

Hard prohibitions: no `vercel deploy --prod` from CLI, no direct push to `main`, no Vercel API or MCP calls that bypass the git trigger. Allowed exceptions: `vercel env add|rm|pull` for secrets management (no deploy), explicit hot-fix during a live demo (must be logged in the next PR).

---

## What every feature prompt assumes

Future feature prompts will reference this file rather than restating these rules. Sessions that do not follow them are operating outside protocol. If your dispatch prompt looks like it conflicts with this file, ask the operator before proceeding — it is more likely the prompt was abbreviated than that the protocol changed.

When in doubt: stop, read, ask. Cheaper than rolling back a destructive commit.
