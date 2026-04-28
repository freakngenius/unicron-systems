# Computer Agent — Adjacent Discovery

**Status:** Update existing (currently silent — needs activation + audit)
**Layer:** 1
**Coordination pattern:** Agent Teams + Shared State
**Schedule:** Weekly · Monday 06:00 UTC

## Purpose

Identify multi-branch field-sales companies in Zedcor's shape across adjacent verticals. Produces "the pattern repeats" evidence required for the contest submission and the warm-list for next-customer outreach.

## Reads

- `pathfinder.branches` (Zedcor footprint reference)
- Public web sources via Computer browser + search (LinkedIn, company directories, industry trade publications, news)

## Writes

- `pathfinder.adjacent_targets` — `id, company_name, vertical, geography, branch_count_estimate, revenue_estimate, shape_match_reason, outreach_hook, surfaced_at`
- `pathfinder.agent_log` — research step events

## Tools

- Computer browser automation
- Computer web search
- Supabase MCP (write)

## Behavior (per cycle)

1. Read Zedcor's branch geography from `pathfinder.branches`
2. Research 4-8 candidate companies per cycle across the adjacent vertical list (configured in prompt: equipment rental, temp fence, temp power/sanitation, traffic control, modular site offices, commercial roofing, multi-location HVAC, industrial cleaning, waste management, on-site safety services)
3. For each candidate: verify it has 5+ branches and serves construction-adjacent buyers; estimate revenue and branch count; write a 2-sentence shape-match rationale and a draft outreach hook
4. Write rows to `adjacent_targets`

## Acceptance

- Writes 4-8 rows weekly
- `agent_log` shows research steps for each target
- Each target is a real company with verifiable footprint
- No duplicates across runs (deduplicate by company name)
