---
name: weekly-retro
description: Generate the weekly retrospective — sprint outcomes, taboo overrides, top insights, DRI allocation
domain: memory
type: scheduled
inputs:
  - name: week_range
    type: string
    required: false
    description: ISO date range in YYYY-MM-DD/YYYY-MM-DD format (defaults to last 7 days)
outputs:
  - type: vault_doc
    location: wiki/retros/YYYY-WW.md
  - type: slack_message
    location: "#orchestrator-feed"
schedule_cron: "TZ=America/Los_Angeles 0 22 * * 0"
refusal_gate: no
budget_usd_per_run: 0.15
---

# weekly-retro

Generate the weekly retrospective every Sunday at 22:00 PT. Covers sprint outcomes, taboo overrides, top insights from the ledger, and DRI allocation across action items.

## Execution

1. Resolve `week_start` and `week_end` from `week_range` input or default to last 7 days.
2. Query `nervous_system.ledger` for high-strength rows in the week range.
3. Query `nervous_system.action_items` for items completed, broken off, or overdue in the range.
4. Query `nervous_system.audit_log` for taboo override events in the range.
5. Query `nervous_system.agents` for budget burn per agent in the range.
6. Compute ISO week number for the filename: `YYYY-WW`.
7. Write retro to `wiki/retros/YYYY-WW.md`.
8. Post Slack summary to `#orchestrator-feed`.

## Output format (wiki)

```markdown
# Weekly Retro — YYYY-WW (Mon DD – Sun DD)

Generated at HH:MM PT.

## Sprint Outcomes
- Action items completed: N
- Action items broken off: N
- Action items overdue: N

## Taboo Overrides
- N overrides this week
- [Override descriptions if any]

## Top Insights
1. [Top ledger insight by strength]
2. [Second insight]
3. [Third insight]

## DRI Allocation
- [team_member]: N items owned, N completed

## Budget Burn
- [agent_name]: $X.XX spent of $Y.YY limit

## Next Week Focus
[LLM-generated 2-3 sentence recommendation based on patterns]
```

## Notes

- Cost ceiling: $0.15/run. Use a capable model for the synthesis section.
- `week_range` input overrides the default. Use ISO format: `2026-05-01/2026-05-07`.
- This skill has no refusal gate — it is fully automated.
