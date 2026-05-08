---
name: run-decay-tick
description: Run the Analyst decay tick — archives signals and ledger rows that have decayed below threshold
domain: memory
type: scheduled
inputs: []
outputs:
  - type: vault_doc
    location: wiki/memory/analyst/YYYY-MM-DD.md
schedule_cron: "TZ=America/Los_Angeles 0 2 * * *"
refusal_gate: no
budget_usd_per_run: 0.02
---

# run-decay-tick

Triggers the Analyst nightly cron decay tick. Decrements signal and ledger row strength by `strength * (1 - 1/ttl_days)`. Archives rows below 0.1. Returns archived counts.

## Execution

1. Query `nervous_system.signals` for all active rows with `strength < 1.0` and `ttl_days` set.
2. For each row: `new_strength = strength * (1 - 1/ttl_days)`.
3. If `new_strength < 0.1`: set `status = 'archived'`, record reason as `decay_tick`.
4. Otherwise: update `strength = new_strength`, update `last_touched = now()`.
5. Repeat for `nervous_system.ledger` rows that have `strength` and `ttl_days` columns.
6. Write a summary doc to the wiki at `wiki/memory/analyst/YYYY-MM-DD.md` with:
   - Signals archived count
   - Ledger rows archived count
   - Signals updated count
   - Lowest surviving strength

## Output format

```markdown
# Decay Tick — YYYY-MM-DD

Ran at HH:MM PT.

- Signals archived: N
- Ledger rows archived: N
- Signals updated: N
- Lowest surviving strength: 0.XX
```

## Notes

- Run nightly at 02:00 PT before the 06:00 daily digest so the digest reflects current state.
- This skill has no refusal gate — it is fully automated.
- Cost ceiling: $0.02/run. Abort if cost would exceed this.
