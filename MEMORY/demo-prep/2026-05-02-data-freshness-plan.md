# 2026-05-02 — Demo data freshness plan

## Goal

Tuesday demo's outreach drafts must look fresh (last 24–48h, not 7+ days old). The bug-investigation finding (Bug B in `MEMORY/end-to-end-verification/2026-05-02.md`) confirmed the outreach cron is healthy but exits early on empty queue. All current verified score≥90 projects already have drafts. New high-priority signals are the missing input.

## Path A — Seed-fresh approach (PREFERRED, defaults to this)

- **Sunday 2026-05-04 evening**: run the Z-F three-branch pipeline against a **14-day-lookback window** (vs the default 7-day) to bring in more candidate signals from sam.gov, USAspending, and Harris County across the Nashville / Pittsburgh / LA radii.
- **Monday 2026-05-05 morning**: run the pipeline again with the **standard 7-day window**; capture the top 5 leads per branch as the demo set.
- **Net effect**: drafts visible at demo time were created Sunday + Monday, look fresh, and align with the Z-F integrator stream's gates.
- **Owner**: Z-F integrator stream Gate Z-F1 (add an explicit lookback parameter to Coverage Expansion goal config).

## Path B — Threshold-temporary fallback

- **Trigger condition**: Path A's Sunday run produces fewer than 5 score≥90 leads in any of the three target branches.
- **Demo-morning action (Tuesday 2026-05-06 09:00 Central, ~6 hr before demo)**: temporarily lower outreach-trigger threshold from score≥90 to score≥85 in env config (NOT in code). Restart cron.
- **Revert immediately post-demo.**
- **Risk acknowledgment**: drafts in the 85–89 score band may include marginal leads that don't represent steady-state quality. Use only if Path A volume is insufficient.
- **Owner**: Kyle (manual env toggle) — NOT autonomous.

## Acceptance criteria for either path

Per target branch (Nashville, Pittsburgh, LA), at demo start:

- ≥3 outreach drafts created within last 48 hours
- ≥1 draft references a fresh permit (created within 14 days)
- ≥1 cross-pollination warm-intro draft per branch (when matches exist)

## Constraints

- Do **NOT** seed test/synthetic signals into `pathfinder.signals` or `pathfinder.projects`. Path A relies on real public data sources.
- Do **NOT** modify the score threshold in code. Path B is env-toggle only.
- Path A's Sunday run is part of Z-F's existing scope; do **NOT** spawn a separate stream for it.
- If both paths fail to meet acceptance criteria, **halt and escalate**; better to demo with sparser draft activity than to fake it.
