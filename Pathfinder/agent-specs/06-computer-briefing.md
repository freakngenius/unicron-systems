# Computer Agent — Briefing

**Status:** New
**Layer:** 3
**Coordination pattern:** Orchestrator-Subagent (consumes outputs from all other agents)
**Schedule:** Weekly · Friday 06:00 UTC

## Purpose

Generates the weekly strategic brief for branch managers and Kyle Doenz. Synthesizes the week's surfacing, rep activity, accept rates, pipeline added, competitive signals, and pending tuning decisions. This is the artifact Zedcor's partners see — and the proof-of-value that lands the rollout.

## Reads

- `pathfinder.projects` (last 7 days, ranked + verified + outreach status)
- `pathfinder.outreach_drafts` (last 7 days, with sent + reply status)
- `pathfinder.competitive_signals` (last 7 days)
- `pathfinder.tuning_proposals` (pending)
- `pathfinder.adjacent_targets` (last 7 days for the org-level brief only)
- HubSpot pipeline data (for pipeline-added attribution)

## Writes

- `pathfinder.briefings` — `id, scope (org|branch), branch_id (nullable), brief_markdown, metrics (jsonb), generated_at, delivered_at, recipients`
- Email/Slack delivery to recipients
- `pathfinder.agent_log`

## Tools

- Supabase MCP (read/write)
- Claude API (Opus — higher-quality synthesis warrants the cost here)
- Email delivery (Resend or similar) or Slack MCP
- HubSpot MCP for pipeline data

## Behavior (per cycle)

1. Generate one **org-level brief** (recipient: Kyle Doenz + Zedcor exec team) covering:
   - Week summary: total projects surfaced, ranked, verified, accepted, pipeline added (rep-attested)
   - Top 3 highest-impact opportunities
   - Competitive signals worth flagging
   - Pending tuning decisions awaiting approval
   - Next-customer adjacent targets (the "pattern repeats" evidence)
2. Generate one **per-branch brief** for each branch manager covering:
   - That branch's surfacing, accept rate, pipeline added
   - Top 5 accepted leads with status
   - Top 3 not-yet-acted-on high-priority leads
   - Branch-specific competitive shifts
3. Tone: ops-grade, scannable in 2 minutes, action-oriented; no padding
4. Deliver via email (preferred) or Slack DM at 06:00 UTC Friday
5. Record delivery confirmation in `briefings.delivered_at`

## Format

- Org brief: 6 sections, ~800 words max
- Branch brief: 4 sections, ~400 words max
- All numbers cited with delta vs. prior week
- One-click actions linked where appropriate

## Acceptance

- 1 org brief + 1 brief per active branch (5 branches → 6 total briefs) every Friday
- Metrics in the brief reconcile to database queries on demand
- Recipients can act on the brief in under 5 minutes
- Tone passes the "would Kyle Doenz forward this to his partners?" test
