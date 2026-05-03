// Wire types for the Customers tab (Phase 1 / Stream M3).
//
// Multi-tenant view of Pathfinder customer orgs. Stream M3 ships single-org
// (Zedcor) per the schema gap captured in
// MEMORY/operator-todos/2026-05-02-pathfinder-needs-org-table.md; the wire
// types accommodate the eventual multi-org case without further churn.

export type OrgStatus = 'active' | 'onboarding' | 'paused';

export interface CustomerOrg {
  id: string;
  display_name: string;
  status: OrgStatus;
  onboarded_at: string | null;
  primary_contact_email?: string;
}

export interface OrgHealthRollup {
  org_id: string;
  /** Daily counts for the trailing 30 days (oldest → newest). Length 30. */
  lead_volume_30d: number[];
  lead_volume_7d_total: number;
  lead_volume_30d_total: number;
  /** Share of leads with score ≥ 80 over the trailing 7 days. 0..1. */
  high_score_rate_7d: number;
  /** Outreach sent ÷ outreach drafted, trailing 7 days. 0..1. */
  outreach_delivery_rate_7d: number;
  /** Daily error counts for the trailing 30 days (oldest → newest). Length 30. */
  error_volume_30d: number[];
  error_total_7d: number;
  /** error_total_7d ÷ lead_volume_7d_total when lead_volume > 0; else 0. */
  error_rate_7d: number;
  /** Recent agent log entries — newest first, capped at 10. */
  recent_errors: Array<{
    agent_name: string;
    message: string;
    created_at: string;
  }>;
  /** Active sources for this org. */
  active_sources: Array<{
    id: string;
    type: string;
    label: string;
    jurisdiction: string | null;
  }>;
}
