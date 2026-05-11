---
name: competitor-watch
description: Scaffolded — daily 08:00 PT scan of named competitors' product, pricing, and content changes. Returns 202 until the scanner ships.
domain: research
type: scheduled
status: scaffolded
inputs:
  - name: competitor_slugs
    type: string[]
    required: false
    description: List of competitor slugs from nervous_system.competitors. If omitted, scans all active competitors.
outputs:
  - type: api_response_when_implemented
    location: '{ changes: Array<{ competitor, change_type, diff_summary, source_url, observed_at }> }'
  - type: slack_message_when_implemented
    location: "#orchestrator-feed (only when material changes detected)"
schedule_cron: "TZ=America/Los_Angeles 0 8 * * 1-5"
refusal_gate: no
budget_usd_per_run: 0.12
---

# competitor-watch (SCAFFOLDED)

Planned: daily named-competitor scan that diffs landing pages, pricing pages, careers pages, and recent content (blog/social) against the prior snapshot. Posts to `#orchestrator-feed` only when a material change is detected.

**Status**: scaffolded. Returns HTTP 202.

## Planned implementation

1. For each competitor in `nervous_system.competitors` (active): pull a fixed set of URLs (homepage, pricing, /careers, recent blog).
2. Compute diff against the prior day's snapshot (stored in object storage).
3. LLM-classify each diff: `pricing_change | positioning_change | new_feature | new_hire | content_drop | noise`.
4. Drop `noise` results; ledger the rest as `source_type='competitor_signal'`.
5. If any non-noise: post a Slack digest.

## Refusal gate

None. Read-only public-web scrape; if `robots.txt` disallows, skip and log.

## Notes

- Tracked in `SCAFFOLDED_SLUGS`.
- The `nervous_system.competitors` table is provisioned but unpopulated. First operator step is to seed competitors before this skill becomes useful.
- Coordinate with `morning-trend-scan` so the operator gets ONE 08:00 digest, not two.
