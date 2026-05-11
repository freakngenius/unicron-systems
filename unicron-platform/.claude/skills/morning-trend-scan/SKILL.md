---
name: morning-trend-scan
description: Scaffolded — daily 07:00 PT scan of news and discourse for vertical-specific trend signals. Returns 202 until the scanner ships.
domain: research
type: scheduled
status: scaffolded
inputs:
  - name: verticals
    type: string[]
    required: false
    description: List of vertical slugs to scan. Default ["construction-surveillance"].
outputs:
  - type: api_response_when_implemented
    location: '{ trends: Array<{ headline, vertical, source_url, score, summary }> }'
  - type: slack_message_when_implemented
    location: "#orchestrator-feed"
schedule_cron: "TZ=America/Los_Angeles 0 7 * * 1-5"
refusal_gate: no
budget_usd_per_run: 0.15
---

# morning-trend-scan (SCAFFOLDED)

Planned: daily news + discourse scan that surfaces vertical-relevant trends each weekday morning at 07:00 PT, alongside `morning-brief`. Different from `competitor-watch` in that this is industry-level, not named-competitor-level.

**Status**: scaffolded. Returns HTTP 202.

## Planned implementation

1. Pull headlines + posts from configured sources (news APIs, Reddit/X via RSS, vertical-specific newsletters).
2. Score each item against the configured vertical profiles (Zedcor-style construction surveillance for v1).
3. Cluster duplicates, rank by score × source-credibility.
4. Top N → ledger as `source_type='trend_signal'`, post a digest to `#orchestrator-feed`.

## Refusal gate

None planned. Read-only ingest.

## Notes

- Tracked in `SCAFFOLDED_SLUGS`.
- Will integrate with the Pathfinder Ingestor pipeline rather than standing up a parallel ingest path.
- Ship after the LightRAG index lands so trend items can be retrieved + summarized at query time.
