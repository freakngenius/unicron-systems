// Wire types for the Stream E architect_inbox endpoints.
// Source of truth: Pathfinder/app/api/architect/inbox/route.ts +
// Pathfinder/app/api/architect/inbox/[id]/resolve/route.ts.
//
// The inbox is shared across two categories:
//   - 'source-discovery' (Stream E owns; M2 — Source Onboarder Tier 2 escalations)
//   - 'architect-proposal' (Stream D owns; existing ArchitectInbox component)
// The discriminator is the `category` query param on the list endpoint.

export type InboxCategory = 'source-discovery' | 'architect-proposal';

export type InboxStatus = 'open' | 'resolved' | 'dismissed';

export type InboxResolution = 'manual' | 'resume' | 'dismiss';

export interface InboxTicket {
  id: string;
  category: InboxCategory;
  /** Source-discovery tickets carry the candidate URL the agent failed on. */
  candidate_url?: string | null;
  /** Architect-proposal tickets carry session_id; source-discovery tickets do too. */
  session_id?: string | null;
  source_id?: string | null;
  /** Reason the source-onboarder agent escalated. */
  reason?: string | null;
  hint?: string | null;
  jurisdiction?: string | null;
  status: InboxStatus;
  /** Set on resolve; ISO timestamp. */
  resolved_at?: string | null;
  resolved_by_user_email?: string | null;
  resolution_note?: string | null;
  created_at: string;
  /** Free-form metadata payload (varies per category). */
  payload?: Record<string, unknown> | null;
}

export interface ListInboxFilter {
  category?: InboxCategory;
  status?: InboxStatus;
  limit?: number;
}

export interface ListInboxResponse {
  tickets: InboxTicket[];
  category: InboxCategory;
  status: InboxStatus;
}

export interface ResolveInboxRequest {
  resolution: InboxResolution;
  resolved_by_user_email?: string;
  resolution_note?: string;
  /** Resume-mode: the operator-supplied URL the agent should retry. */
  resume_url?: string;
  /** Resume-mode: env-var name carrying the API key (NOT the key itself). */
  resume_api_key_env?: string;
  resume_hint?: 'socrata' | 'rest' | 'rss' | 'json-dump';
  resume_jurisdiction?: string;
}

export interface ResolveInboxResponse {
  status: 'dismissed' | 'resolved' | 'resumed' | 'queued';
  /** Set on resume — points at the new Source Onboarder dispatch. */
  request_id?: string;
}
