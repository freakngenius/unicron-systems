// Single source of truth for the `pathfinder.*` schema. Mirrors the migrations in supabase/migrations.
// Every stream imports from here so the Supabase row shape, the API responses, and the React props
// share one definition.

export type AgentName =
  | 'ingestor'
  | 'ranker'
  | 'adjacent'
  | 'verifier'
  | 'outreach'
  | 'pulse'
  | 'competitive'
  | 'briefing'
  | 'customer-intel'
  | 'eval';

// Wider name set used only by `agent_log` / `agent_runs` writes. Service
// integrations (`hubspot-sync`, `slack-bot`) audit through the same log
// table but do not have a dashboard surface, so they aren't part of the
// UI-facing AgentName union (which gates the agent metadata maps in
// lib/agent-tints, lib/realtime, components/settings/sections/Agents,
// etc.). The 0011_hubspot_sync.sql + 0012_slack_workspaces.sql CHECK
// constraints enumerate the same set.
export type LogAgentName = AgentName | 'hubspot-sync' | 'slack-bot';

export type AgentRunStatus = 'running' | 'success' | 'failed';

export type ProjectSource = 'usaspending' | 'sam.gov' | 'news' | 'harris';

export interface Branch {
  id: string;
  name: string;
  code: string;
  lat: number;
  lon: number;
  coverage_radius_miles: number;
  opened_date: string | null;
  region: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  lat: number;
  lon: number;
  served_by_branch_id: string | null;
  customer_since: string | null;
  monthly_value: number | null;
  created_at: string;
}

export interface Project {
  id: string;
  source: ProjectSource | string;
  source_id: string;
  title: string;
  summary: string | null;
  lat: number | null;
  lon: number | null;
  project_value: number | null;
  project_stage: string | null;
  posted_date: string | null;
  raw_payload: Record<string, unknown> | null;
  rationale: string | null;
  rationale_streamed_at: string | null;
  score: number | null;
  nearest_branch_id: string | null;
  distance_miles: number | null;
  outreach_hook: string | null;
  warm_for_customer_id: string | null;
  ingested_at: string;
  ranked_at: string | null;
  // Verifier output (added 0005_agent_expansion_layer1).
  // null = pending verification; true = passed all 4 checks; false = at least one check failed.
  verified?: boolean | null;
  verifier_notes?: string | null;
  verifier_pass_count?: number;
  // High-priority Slack alert dedup (added 0012_slack_workspaces).
  // null = never alerted; non-null = last alert ts. Alerts cron re-fires
  // when the value is null OR older than 7 days.
  slack_alert_sent_at?: string | null;
}

export interface AgentLogRow {
  id: number;
  agent_name: LogAgentName;
  event_type: string;
  event_data: Record<string, unknown>;
  latency_ms: number | null;
  model_used: string | null;
  ts: string;
}

export interface AgentRun {
  id: number;
  agent_name: AgentName;
  started_at: string;
  completed_at: string | null;
  records_processed: number;
  records_new: number;
  status: AgentRunStatus;
  error_message: string | null;
}

export interface AdjacentTarget {
  id: number;
  company_name: string;
  geography: string | null;
  branch_count_estimate: number | null;
  shape_match_reason: string | null;
  outreach_draft: string | null;
  surfaced_at: string;
}

// Lead actions (added 0011_hubspot_sync). The five HubSpot-mirrored
// statuses flow back through `app/api/webhooks/hubspot`; the two
// local-only statuses (`dismissed`, `snoozed`) are written by Slack-bot
// and chat-panel actions and never round-trip to HubSpot. See
// docs/HUBSPOT-STAGE-MAP.md for the full stage map.
export type LeadActionStatus =
  | 'accepted'
  | 'meeting_booked'
  | 'proposal_sent'
  | 'closed_won'
  | 'closed_lost'
  | 'dismissed'
  | 'snoozed';

export interface LeadAction {
  id: number;
  project_id: string;
  actor_email: string;
  status: LeadActionStatus;
  attested_pipeline_value: number | null;
  first_action_date: string | null;
  note: string | null;
  hubspot_deal_id: string | null;
  hubspot_pipeline_id: string | null;
  hubspot_stage_id: string | null;
  hubspot_pushed_at: string | null;
  hubspot_last_event_at: string | null;
  hubspot_last_event_id: string | null;
  closed_won_amount: number | null;
  closed_won_at: string | null;
  closed_lost_reason: string | null;
  created_at: string;
  updated_at: string;
}

// Outreach drafts (P0-02) — written by the Outreach agent in
// lib/outreach.ts + app/api/cron/outreach/route.ts. Mirrors
// supabase/migrations/0010_outreach_drafts.sql.

export type OutreachChannel = 'email' | 'linkedin' | 'voicemail';
export type OutreachStatus = 'draft' | 'sent' | 'dismissed';

export interface OutreachDraft {
  id: number;
  project_id: string;
  channel: OutreachChannel;
  recipient_name: string | null;
  recipient_title: string | null;
  recipient_contact: string | null;
  // Email subject — null for linkedin / voicemail per the schema-level CHECK.
  draft_subject: string | null;
  draft_body: string;
  // The Ranker may already have flagged a warm-intro path on the project row
  // via warm_for_customer_id. Outreach copies that forward when it generates
  // copy that mentions the relationship. Null when no warm path exists.
  warm_intro_via: string | null;
  word_count: number | null;
  char_count: number | null;
  // Each warning is a tag like "email_word_count_out_of_range" or
  // "dash_substituted" — see lib/outreach.ts for the canonical list.
  verifier_warnings: string[];
  model_used: string | null;
  sent_status: OutreachStatus;
  draft_at: string;
  sent_at: string | null;
  dismissed_at: string | null;
}

// Intelligence Chat (P0-01) — see docs/PLAN-P0-01-INTELLIGENCE-CHAT.md.
// Mirrors supabase/migrations/0009_chat.sql.

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export type ChatMessageKind =
  | 'text'
  | 'outreach_draft'
  | 'action_result'
  | 'error';

export interface ChatThread {
  id: string;
  user_email: string;
  context_key: string;
  context_label: string;
  context_snapshot: Record<string, unknown>;
  created_at: string;
  last_message_at: string;
}

export interface ChatMessage {
  id: number;
  thread_id: string;
  role: ChatMessageRole;
  kind: ChatMessageKind;
  content: string;
  payload: Record<string, unknown>;
  model_used: string | null;
  latency_ms: number | null;
  created_at: string;
}

export interface ChatSourceCitation {
  url: string;
  title: string;
}

export interface ChatTablesQueried {
  table: string;
  rowsRead: number;
}

// Snapshot the dashboard passes to the chat backend so the assistant knows
// what the user is currently looking at. The server re-fetches the rows
// referenced by IDs — never trust client-supplied row data.
export interface ChatContextSnapshot {
  view: 'dashboard' | 'project_modal' | 'settings';
  selectedBranchId: string | null;
  openProjectId: string | null;
  sourceFilter: string;
  crossPoll: boolean;
  filteredProjectIds: string[];
  totalProjects: number;
  hiddenProjectIds: string[];
  timestamp: string;
}

// Action IDs the chat can dispatch. Wired set runs end-to-end on this
// branch; deferred set returns 501 with the audit row pattern in
// PLAN-P0-01-INTELLIGENCE-CHAT.md § 8.
export type ChatActionId =
  // Wired
  | 'copy_draft'
  | 'save_draft'
  | 'regenerate_draft'
  | 'export_csv'
  | 'summarize_pipeline'
  // Deferred — write audit row, surface "queued / saved for sync" reply
  | 'accept_lead_to_hubspot'
  | 'push_to_pipeline'
  | 'schedule_followup'
  | 'add_note';

// Slack workspace install (added 0012_slack_workspaces). One row per
// customer Slack workspace. bot_token is sensitive — never read by the
// anon client; only `lib/slack/bot.ts` (server-side, service-role) reads
// it. raw_oauth_payload retains the full v2.access response.
export interface SlackWorkspace {
  team_id: string;
  team_name: string;
  bot_user_id: string;
  bot_token: string;
  app_id: string;
  scope: string;
  installer_user_id: string | null;
  installer_email: string | null;
  default_alert_channel_id: string | null;
  installed_at: string;
  uninstalled_at: string | null;
  raw_oauth_payload: Record<string, unknown> | null;
}

// Per-(workspace, branch) routing for high-priority alerts and digests.
// rep_user_id / rep_email are reserved for v2 per-rep DM mapping; null
// in v1 (channel-only routing).
export interface SlackBranchRoute {
  team_id: string;
  branch_id: string;
  channel_id: string;
  rep_user_id: string | null;
  rep_email: string | null;
  created_at: string;
  updated_at: string;
}

// Per-message audit. Identified by Slack's (channel_id, ts) tuple.
// resolved_* stamped when a button is tapped — re-tap is a no-op.
export type SlackMessageKind =
  | 'digest_item'
  | 'high_priority_dm'
  | 'high_priority_post';

export type SlackResolvedAction =
  | 'accept'
  | 'dismiss'
  | 'snooze_24h'
  | 'snooze_7d';

export interface SlackMessageRow {
  id: number;
  team_id: string;
  channel_id: string;
  ts: string;
  project_id: string;
  kind: SlackMessageKind;
  posted_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_action: SlackResolvedAction | null;
}


// Database type bag for the typed Supabase client.
export interface PathfinderDatabase {
  pathfinder: {
    Tables: {
      branches: { Row: Branch; Insert: Omit<Branch, 'created_at'> & { created_at?: string }; Update: Partial<Branch>; Relationships: [] };
      customers: { Row: Customer; Insert: Omit<Customer, 'created_at'> & { created_at?: string }; Update: Partial<Customer>; Relationships: [] };
      projects: { Row: Project; Insert: Omit<Project, 'ingested_at'> & { ingested_at?: string }; Update: Partial<Project>; Relationships: [] };
      agent_log: { Row: AgentLogRow; Insert: Omit<AgentLogRow, 'id' | 'ts'> & { id?: number; ts?: string }; Update: Partial<AgentLogRow>; Relationships: [] };
      agent_runs: { Row: AgentRun; Insert: Omit<AgentRun, 'id' | 'started_at'> & { id?: number; started_at?: string }; Update: Partial<AgentRun>; Relationships: [] };
      adjacent_targets: { Row: AdjacentTarget; Insert: Omit<AdjacentTarget, 'id' | 'surfaced_at'> & { id?: number; surfaced_at?: string }; Update: Partial<AdjacentTarget>; Relationships: [] };
      lead_actions: { Row: LeadAction; Insert: Omit<LeadAction, 'id' | 'created_at' | 'updated_at'> & { id?: number; created_at?: string; updated_at?: string }; Update: Partial<LeadAction>; Relationships: [] };
      outreach_drafts: {
        Row: OutreachDraft;
        Insert: Omit<OutreachDraft, 'id' | 'draft_at'> & {
          id?: number;
          draft_at?: string;
        };
        Update: Partial<OutreachDraft>;
        Relationships: [];
      };
      chat_threads: {
        Row: ChatThread;
        Insert: Omit<ChatThread, 'id' | 'created_at' | 'last_message_at'> & {
          id?: string;
          created_at?: string;
          last_message_at?: string;
        };
        Update: Partial<ChatThread>;
        Relationships: [];
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: Omit<ChatMessage, 'id' | 'created_at'> & {
          id?: number;
          created_at?: string;
        };
        Update: Partial<ChatMessage>;
        Relationships: [];
      };
      slack_workspaces: { Row: SlackWorkspace; Insert: Omit<SlackWorkspace, 'installed_at'> & { installed_at?: string }; Update: Partial<SlackWorkspace>; Relationships: [] };
      slack_branch_routes: { Row: SlackBranchRoute; Insert: Omit<SlackBranchRoute, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }; Update: Partial<SlackBranchRoute>; Relationships: [] };
      slack_messages: { Row: SlackMessageRow; Insert: Omit<SlackMessageRow, 'id' | 'posted_at'> & { id?: number; posted_at?: string }; Update: Partial<SlackMessageRow>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
