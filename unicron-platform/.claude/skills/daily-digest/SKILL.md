---
name: daily-digest
description: Generate and post the Analyst daily digest — yesterday's calls, action items, PRs, and decay stats
domain: memory
type: scheduled
inputs: []
outputs:
  - type: vault_doc
    location: wiki/memory/analyst/YYYY-MM-DD.md
  - type: slack_message
    location: "#orchestrator-feed"
schedule_cron: "TZ=America/Los_Angeles 0 6 * * *"
refusal_gate: no
budget_usd_per_run: 0.10
---

# daily-digest

Generate and post the Analyst daily digest every morning at 06:00 PT. Covers yesterday's calls, action items, open PRs, and decay stats from the nightly decay tick.

## Execution

1. Compute `yesterday_start` and `yesterday_end` in PT timezone.
2. Query `nervous_system.ledger` for rows with `created_at` between those bounds.
3. Query `nervous_system.action_items` for items with `status IN ('open', 'in_progress')` and `due_at <= today`.
4. Query GitHub API for PRs in `freakngenius/unicron-systems` merged or opened yesterday.
5. Read `wiki/memory/analyst/YYYY-MM-DD.md` (decay tick output) for archived counts.
6. Compose digest in the wiki format below and write to `wiki/memory/analyst/YYYY-MM-DD.md`.
7. Post Slack summary to `#orchestrator-feed`.

## Output format (wiki)

```markdown
# Analyst Daily Digest — YYYY-MM-DD

Generated at HH:MM PT.

## Yesterday's Signals
- N ledger rows ingested
- Top sources: [source_type list]

## Action Items
- N open / N in-progress
- Overdue: N items

## GitHub Activity
- PRs merged: N
- PRs opened: N

## Decay Stats
- Signals archived: N
- Ledger rows archived: N

## Notes
[LLM-generated 2-3 sentence summary of notable patterns]
```

## Notes

- Run after the 02:00 decay tick — depends on decay tick output being present.
- Cost ceiling: $0.10/run. Summarization may use a cheap model (Haiku) if within budget.
- This skill has no refusal gate — it is fully automated.
