# Demo dry-run screenshots — Tuesday 2026-05-05 demo

Created 2026-05-02 by the Demo Polish UX Sprint Gate 5. Run this dry-run
on Monday 2026-05-04 against `https://pathfinder.unicron.systems` after
the upstream PR stack has merged to `main` and Kyle has completed the
HubSpot dashboard config from
`MEMORY/operator-todos/2026-05-02-hubspot-end-to-end-setup.md`.

## Pre-conditions

- [ ] Gate 3 stack merged to `main` (PRs #78 → #79 → #81 → #82 → #83) →
      Vercel deploys cleanly. Confirm via
      `gh run list --branch main --limit 5` or the Vercel dashboard.
- [ ] Gate 4 stack merged to `main` (PRs #85 → #86 → #88 → #90) →
      Vercel deploy clean.
- [ ] Kyle has registered the HubSpot webhook URL in the HubSpot
      Developer Dashboard and added Vercel env vars per
      `MEMORY/operator-todos/2026-05-02-hubspot-end-to-end-setup.md`.
- [ ] Kyle has clicked **Connect** on the HubSpot tile in
      `/pathfinder/settings/connectors` and granted scopes.

If any pre-condition is unmet, halt the dry-run and surface the gap.

## Output directory

Save each beat's screenshot as `beat-NN-<slug>.png` in this folder.
Filename convention:

- `beat-01-map-default-load.png`
- `beat-02-houston-bubble-click.png`
- `beat-03-txdot-i45-visible.png`
- `beat-04-projectfactscard-rendered.png`
- `beat-05-posted-relative.png`
- `beat-06-cross-poll-lines.png`
- `beat-07-settings-probes-connected.png`
- `beat-08-hubspot-tile-connected.png`
- `beat-09-hubspot-create-deal-inbound.png`
- `beat-10-pathfinder-stage-outbound.png`

## The 10 beats

### Beat 1 — Map default load

**URL:** `https://pathfinder.unicron.systems/pathfinder/`

**What to verify:**
- 4 demo branch pins visible: Houston, Pittsburgh ("Pennsylvania" branch in DB), Nashville, Los Angeles.
- BranchDock at top counts > 0 for at least Houston + Pittsburgh.
- Right rail shows leads with the default filter "WITHIN RANGE · score ≥ 50" applied (Gate 1).
- No foreign-country projects in the default list (Gate P1 from the prior demo polish sprint).

**Expected SQL** (sanity check before screenshot):

```sql
select zb.branch_name, count(p.id) as in_range_50plus
from pathfinder.zedcor_branches zb
left join pathfinder.projects p
  on p.nearest_zedcor_branch_id = zb.id
  and p.rejection_reason is null
  and p.score >= 50
where zb.branch_name in ('Houston','Los Angeles','Nashville','Pennsylvania')
group by 1 order by 1;
-- Expected: Houston >= 8, Pennsylvania >= 5, Nashville >= 4, Los Angeles >= 0
```

### Beat 2 — Click Houston bubble

**Action:** Click the Houston pin on the map.

**What to verify:**
- Right rail filters to Houston-attached leads (Gate 1B).
- Top counter updates to "X of Y" reflecting the Houston-narrowed set.
- Anchored card next to Houston shows the branch summary.

### Beat 3 — TxDOT I-45 lead visible

**Action:** With Houston selected, scroll the right rail.

**What to verify:**
- `sam.gov:TXDOT-I45-2026-001` (TxDOT I-45 corridor security expansion)
  visible with score = 97.
- Cross-pollination toggle OFF — the flagship is in the regular Houston
  view, not the cross-poll filter.

### Beat 4 — ProjectFactsCard rendered

**Action:** Click the TxDOT I-45 lead.

**What to verify (Gate 3D):** Sidebar shows the Project facts card
above Rationale. Each field renders with the Gate 3 enrichment data:

| Field | Expected value |
|---|---|
| Owner | Texas Department of Transportation · `FEDERAL` chip |
| Prime contractor | "Not yet awarded" italic dim (sam.gov pre-award is honest null) |
| Key subs | "Not yet enriched" or empty list (synthetic seed data) |
| Description | (filled by Anthropic in Gate 3C) |
| NAICS | `561612 · Highway, Street, and Bridge Construction` |
| Location | `Houston, TX` + `29.8300, -95.3500` mono subtitle |
| Estimated dates | `05-13-26 – —` (start only, no end) |
| Permit | "N/A" (federal contract) |
| Estimated cost | `$4.2M` |
| Lot size | "Not yet enriched" (linear infrastructure) |

### Beat 5 — Posted date relative format (Gate 3D)

**What to verify** in either the project modal header or metrics row:

- Top line: `X days ago` / `Today` / `1 day ago` (relative).
- Subtitle: `MM-DD-YY` in monospace (e.g. `05-01-26`).

### Beat 6 — Cross-Pollination filter (Gate 2)

**Action:** Toggle the Cross-Pollination filter ON.

**What to verify:**
- Right rail shows ≥ 12 leads (matches `select count(*) from pathfinder.lead_cross_pollination`).
- 3 SOLID magenta lines (exact matches: 2× Brasfield & Gorrie + Big-D Construction).
- 9 DASHED faded magenta lines (fuzzy matches).
- MapLegend shows "Exact match" + "Fuzzy match" chips bottom-left.
- Brasfield & Gorrie LLC GSA award + BIG-D CONSTRUCTION CORP GSA award are visible in the right rail.

**Expected SQL:**
```sql
select match_layer, count(*) from pathfinder.lead_cross_pollination group by 1;
-- Expected: exact: 3, fuzzy: 9
```

### Beat 7 — Settings probes (Gate 4A)

**URL:** `https://pathfinder.unicron.systems/pathfinder/settings/integrations`
(or whatever path renders `IntegrationsSection`).

**What to verify:**
- Slack webhook row shows `OK` with detail like `webhook registered (Slack: "no_text")`.
- Resend (email) row shows `OK` with detail like `1 domain verified`
  (or `DEGRADED` if no domains verified — also acceptable).
- Neither row shows `UNKNOWN`.

**Curl probe** (same data the UI consumes):
```bash
curl -s https://pathfinder.unicron.systems/pathfinder/api/probes/slack | jq .
curl -s https://pathfinder.unicron.systems/pathfinder/api/probes/resend | jq .
# Both should return `{status:"ok", detail:"...", checked_at:"...", cached:bool}`.
```

### Beat 8 — HubSpot tile CONNECTED (Gate 4B-1 + Kyle's config)

**URL:** `https://pathfinder.unicron.systems/pathfinder/settings/connectors`

**Pre-condition:** Kyle has clicked "Connect" on the HubSpot tile and
granted scopes.

**What to verify:**
- HubSpot tile shows `Connected` badge (green).
- Account name = the HubSpot portal name (e.g. "Zedcor Production").
- Stat line shows recent activity count or rules count if mapping has been saved.

### Beat 9 — HubSpot create-deal inbound (Gate 4B-1)

**Action:** In HubSpot UI, manually create a deal in the Pathfinder
pipeline. Within ~30 seconds:

**Expected SQL probe:**
```sql
select event_type, status, payload_summary->>'object_id' as deal_id, created_at
from pathfinder.connector_audit_log
where event_type = 'inbound.deal.creation'
  and created_at > now() - interval '5 minutes'
order by created_at desc limit 5;
-- Expected: at least one row matching the deal you just created.
```

**Visual:** Capture the audit-log row (e.g. via the architect inbox UI
or by piping the SQL output to a screenshot).

### Beat 10 — Pathfinder stage change → outbound to HubSpot (Gate 4B-1 + 4B-2 + existing push-deal)

**Action:** Either accept a high-score lead in Pathfinder (existing
`/api/hubspot/push-deal` route fires on accept) OR move a deal stage
on the Pathfinder kanban (Stream B work).

**Expected SQL probe:**
```sql
select event_type, status, payload_summary->>'deal_id' as deal_id,
       payload_summary->>'new_stage' as stage,
       payload_summary->>'token' as redacted_token,
       created_at
from pathfinder.connector_audit_log
where event_type in ('outbound.deal_stage_change', 'outbound.push_deal_success')
  and created_at > now() - interval '5 minutes'
order by created_at desc limit 5;
-- Expected: at least one row with status='sent' and a redacted token (first4****last4).
```

**Visual:** Capture the audit-log row + the corresponding deal in
HubSpot showing the new stage.

## Token-leak final guard

After completing beats 9 + 10, run the leak monitor from
`MEMORY/operator-todos/2026-05-02-hubspot-end-to-end-setup.md` § 5:

```sql
select payload_summary
from pathfinder.connector_audit_log
where created_at > now() - interval '1 hour'
  and event_type like 'outbound.%'
  and (
    payload_summary::text ~ 'CX[a-zA-Z0-9_-]{40,}' or
    payload_summary::text ~ 'pat-[a-zA-Z0-9-]{40,}'
  )
limit 5;
```

Empty result → safe. Any rows → halt + rotate token + revert.

## Halt criteria

If any beat fails — UI doesn't render, SQL probe returns no rows when
expected, token leak monitor returns rows — STOP and surface in
`MEMORY/demo-polish-ux-sprint-live-status.md`. Do not retry the demo
flow until the failure is root-caused. The Tuesday demo deadline is
tight enough that a flaky retry is worse than reverting to the
last-known-clean main HEAD.

## Sign-off

- [ ] Beats 1–7 captured with screenshots.
- [ ] Beats 8–10 captured (or Kyle has explicitly noted they're being
      run live during the demo because HubSpot config landed late).
- [ ] Token-leak monitor empty.
- [ ] No regressions in cross-pollination overlay (Brasfield & Gorrie +
      Big-D Construction still visible).
- [ ] Houston flagship lead detail renders ProjectFactsCard cleanly.

Sign-off operator: __________________
Sign-off timestamp: __________________
