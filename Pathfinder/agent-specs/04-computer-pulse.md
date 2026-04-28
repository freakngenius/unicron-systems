# Computer Agent — Pulse (Self-Tuning)

**Status:** New
**Layer:** 2
**Coordination pattern:** Shared State + Generator-Verifier (proposed changes are verified by humans before applied)
**Schedule:** Daily · 02:00 UTC

## Purpose

Watches reps' accept/reject behavior and detects systematic mismatches between what the Ranker scored highly and what reps actually pursue. Proposes ranking-weight adjustments for human approval. The system gets sharper every week without human intervention beyond approving proposals.

## Reads

- `pathfinder.projects` (with rep accept/reject status from Slack/HubSpot interactions)
- `pathfinder.agent_log` (rep interaction events)
- `pathfinder.branches` (for per-branch pattern detection)
- Current Ranker scoring config (stored in `pathfinder.ranking_config`)

## Writes

- `pathfinder.tuning_proposals` — `id, pattern_observed, evidence (jsonb), proposed_change (jsonb), expected_impact, status (pending|approved|rejected|superseded), proposed_at, decided_at, decided_by`
- On approval, applies changes to `pathfinder.ranking_config`
- `pathfinder.agent_log` — pattern detections and proposals

## Tools

- Supabase MCP (read/write)
- Claude API (Sonnet) for pattern reasoning
- Internal scoring config schema validation

## Behavior (per cycle)

1. Aggregate rep behavior over rolling 7-day window: accept rate per project type, per branch, per source, per project value tier
2. Detect statistically meaningful patterns (≥10 sample size, ≥20% deviation from baseline):
   - "Branch X rejects solar projects under $10M at 73% rate (baseline 41%)"
   - "Houston accepts SAM.gov sources 18% more than USAspending"
   - "Atlanta accept rate has dropped 23% over the past 14 days for high-priority"
3. For each pattern, generate a proposed adjustment to `ranking_config`:
   - Adjust score weight on a feature
   - Adjust source weight per branch
   - Add an exclusion filter
4. Write proposal with full evidence trail
5. Surface pending proposals in the dashboard's Pulse panel for human approval
6. On approval, apply config change with effective date; log the change

## Constraints

- Never auto-apply a tuning change without human approval
- Never propose changes that affect more than 25% of historical rankings (too risky)
- Each proposal must show "before/after" projected accept rate based on recent data
- Proposals expire after 14 days if not decided

## Acceptance

- At least one proposal per week if patterns exist (silence is acceptable if no patterns)
- Each proposal includes specific pattern, statistical evidence, projected impact
- Approved proposals visibly affect future Ranker output
- Dashboard shows pending proposals with one-click approve/reject
