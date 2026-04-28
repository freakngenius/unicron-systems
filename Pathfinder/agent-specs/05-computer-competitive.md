# Computer Agent — Competitive Intelligence

**Status:** New
**Layer:** 2
**Coordination pattern:** Agent Teams (accumulates competitive context over time)
**Schedule:** Weekly · Wednesday 04:00 UTC

## Purpose

Tracks federal, state, and reported security contract awards over time to detect which providers are winning which contracts in Zedcor's geographies. Surfaces share-shift patterns and competitive dynamics. Plugs directly into Zedcor's strategic concerns about share loss to incumbents.

## Reads

- `pathfinder.projects` (with award data including contractor identity)
- USASpending API (90-day historical contract awards, filtered to security/surveillance NAICS)
- SAM.gov (current opportunities + awarded historical)
- Web research for press releases and industry trade reports

## Writes

- `pathfinder.competitive_signals` — `id, competitor_name, geography (state or metro), contract_count, contract_value_total, trend (up|flat|down), trend_pct, observed_at, source_evidence (jsonb)`
- Weekly `competitive_briefing` summary written to `pathfinder.briefings` (handed off to the Briefing agent)
- `pathfinder.agent_log` — research steps and findings

## Tools

- Supabase MCP (read/write)
- USASpending public API
- SAM.gov API
- Computer web search + browser automation for press releases
- Claude API (Sonnet) for synthesis

## Behavior (per cycle)

1. Pull last 90 days of federal security contract awards in Zedcor's geographic footprint
2. Categorize by winning contractor (ADT, Allied Universal, Securitas, GardaWorld, regional players, Zedcor itself)
3. Compute share trends: per geography, per quarter, per contract size tier
4. Cross-reference with Zedcor's pipeline (which contracts they bid on or considered) — flag contracts they could have won given footprint
5. Detect notable shifts: "ADT won 4 of last 6 federal contracts in Atlanta — up from 1 of 6 in Q1"
6. Write signals to `competitive_signals`
7. Write a weekly synthesis brief for the Briefing agent to incorporate

## Acceptance

- At least 3 competitive signals per week
- Signals include comparative data (this period vs. prior period), not just absolute counts
- Trend direction is sourced and defensible
- Surfaces at least one actionable observation per month for Kyle Doenz
