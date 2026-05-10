# Skill: multi-fork-sprint

**Invocation:** `/multi-fork-sprint`

## What it does

Launches N parallel implementation candidates for a given sprint task, scores them via a configurable judge (LLM Council or hard metric), keeps the top K winners, and archives losers with explanation.

Each fork runs as a separate Claude Code agent in its own git worktree (per the `using-git-worktrees` skill). After all forks complete, `runMultiFork()` from `unicron-platform/lib/sprint-fork.ts` scores and prunes.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `sprint_id` | yes | — | Unique identifier for this sprint fork run |
| `n_forks` | no | 3 | Number of parallel forks to run (max: 5) |
| `k_winners` | no | 1 | Number of winners to keep |
| `judge` | no | `llm-council` | Scoring method: `llm-council` or `hard-metric` |
| `judge_criteria` | no | [] | Array of criteria strings for LLM Council scoring |
| `task_description` | no | — | What each fork should implement |

## Usage

Invoke from a Cowork chat after defining the sprint task. The skill:

1. Declares the scoring function before launch (criteria or metric)
2. Generates N parallel Claude Code prompts (one per fork)
3. Dispatches each via `Task` tool in its own worktree
4. Collects `ForkCandidate` objects (diff_summary + self_evaluation) from each
5. Calls `runMultiFork(config, candidates)` to score and prune
6. Returns winner ID and archives losers to `vault/Memory/sprint_forks/{sprint_id}/`
7. Logs the winning pattern as a `PATTERN` signal in `nervous_system.ledger`

## Example

"Run a multi-fork sprint with 3 candidates to implement the customer health card component. Use llm-council judge with criteria: [correctness, UX quality, performance]."

```
/multi-fork-sprint sprint_id=health-card-v1 n_forks=3 judge=llm-council judge_criteria=["correctness","UX quality","performance"]
```

## Integration

- Scoring: `unicron-platform/lib/sprint-fork.ts` → `runMultiFork()`
- LLM Council judge: `unicron-platform/lib/agents/llm-council.ts` (Stream B) — dynamically imported; falls back to ordinal scoring if not yet merged
- Worktree management: `using-git-worktrees` skill
- Loser archive: `vault/Memory/sprint_forks/{sprint_id}/{fork_id}/summary.md`
- Reinforcement: PATTERN signal written to `nervous_system.ledger`

## Activation rule

Default: kicked in only when Cowork explicitly requests it. Not every sprint forks. Use when a problem has multiple plausible approaches and the cost of picking wrong exceeds the cost of running N candidates.
