# SPEC — Real Per-Org Dashboard Data

Replace mock fixtures on Customer Detail view with real per-org queries. Today's Realberry 2 dashboard shows Zedcor's data relabeled — production-ready means every number, chart, source, and error log is real and scoped to the org.

## Current state (per audit)

- Lead Volume 7D / 30D: hardcoded fixtures
- High Score Rate: hardcoded
- Outreach Delivery: hardcoded
- Error Rate: hardcoded
- 30-day charts: random/seeded data
- Recent Errors panel: shared fixtures, not org-scoped
- Active Sources panel: shows Zedcor's sources for any org

## What ships

1. Each metric query scoped to `organization_id`.
2. Time-series queries (30-day charts) bucketed by day, returning real lead/error counts per day for that org.
3. Active Sources panel queries `pathfinder.voice_agent_sources` + registered source adapters filtered by what's listed in `org.architecture.sources`.
4. Recent Errors panel queries `pathfinder.agent_errors` filtered by `organization_id`.
5. Empty states when org has no data yet ("No leads yet — first ingestion in progress" etc.)
6. Loading states while queries fetch.

## Schema additions (if not present)

```sql
-- agent_errors should already exist; add organization_id if missing
ALTER TABLE pathfinder.agent_errors ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE INDEX IF NOT EXISTS idx_agent_errors_org_created ON pathfinder.agent_errors (organization_id, created_at DESC);
```

Backfill existing rows with Zedcor org_id.

## API endpoints (Pathfinder side, called from Metacron)

- `GET /api/orgs/:slug/metrics?window=7d|30d` — returns lead_volume, high_score_rate, outreach_delivery, error_rate
- `GET /api/orgs/:slug/timeseries?metric=leads|errors&window=30d` — returns daily buckets
- `GET /api/orgs/:slug/recent-errors?limit=10` — returns most recent error log entries
- `GET /api/orgs/:slug/active-sources` — returns sources from `org.architecture.sources` joined with adapter status

All endpoints require operator session.

## Component changes (Metacron)

`unicron-platform/src/components/CustomerDetail.tsx`:
- Remove `customersMock.ts` imports
- Replace fixtures with `useQuery` hooks calling the new endpoints
- Skeleton loading per panel
- Empty states with vocabulary substitution from `architecture.vocabulary`

`unicron-platform/src/components/ActiveSourcesPanel.tsx`:
- Query `/api/orgs/:slug/active-sources`
- Render source name, type (registered/voice-agent/tier-2/pending), last-run timestamp, status

`unicron-platform/src/components/RecentErrorsPanel.tsx`:
- Query `/api/orgs/:slug/recent-errors`
- Render agent name, error message, timestamp

## Acceptance criteria

- Realberry 2's dashboard shows zero rows for lead volume, no chart data, empty Active Sources matching its architecture (SEC EDGAR, RentCafe, etc), no recent errors before first ingestion.
- After first ingestion run, real verified leads count, real errors, real source last-run timestamps.
- Zedcor dashboard unchanged in appearance (data was already real for Zedcor's org_id).
- Cross-org isolation verified: Realberry's queries cannot return Zedcor data, and vice versa.
- All hardcoded fixture imports removed from customer-facing components (grep clean).

## Risks + mitigations

- Long ingestion windows produce empty dashboards: empty state copy makes this clear and surfaces "Setting up sources" status.
- Time-series queries slow at scale: pre-aggregate to daily buckets in a materialized view if perf warrants.
- Backfilled errors all attributed to Zedcor: confirm with operator before backfill; consider migration with explicit mapping.

## Dependencies

- Phase 2A (organization_id + RLS on customer-data tables)
- Phase 2C (real per-org agent dispatch produces the data being queried)

End.
