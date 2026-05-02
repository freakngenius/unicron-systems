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
  | 'eval'
  | 'contact-resolver';

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
  // Z-C feature #6 GeoMapper output (added 0102_zedcor_geomapper).
  // Distinct from nearest_branch_id/distance_miles above which target the
  // multi-tenant pathfinder.branches registry; these target the Zedcor-org
  // pathfinder.zedcor_branches table and power the Tuesday-demo map +
  // lead list. Populated by scripts/backfill-zedcor-geo.ts.
  nearest_zedcor_branch_id?: string | null;
  zedcor_distance_miles?: number | null;
  // Demo Polish P1 (migration 0104) — geography filtering.
  // `country` is the canonical 3-letter ISO code (USA/CAN/...) inferred at
  // ingest from raw_payload, or backfilled by scripts/backfill-geography.ts.
  // `rejection_reason` carries the bucket — 'out_of_country' when a project
  // fails the ingest country filter, 'no_branch_coverage' when the ranker
  // determines distance > org_geo_config.max_supported_distance_miles.
  // `geo_unknown` flags projects we couldn't geolocate even after the Haiku
  // fallback; their effective_score is capped at 50 by the ranker.
  country?: string | null;
  rejection_reason?: string | null;
  rejected_at?: string | null;
  geo_unknown?: boolean | null;
  geo_inference_confidence?: number | null;
}

export interface OrgGeoConfig {
  org_id: string;
  max_supported_distance_miles: number;
  allowed_countries: string[];
  updated_at: string;
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

// Project contacts (P0-02c) — written by the Contact Resolver in
// lib/contacts/extractor.ts + app/api/cron/contact-resolver/route.ts.
// Mirrors supabase/migrations/0013_project_contacts.sql.
//
// v1 only writes source='raw_payload' rows from Phase 1 extraction.
// The source CHECK already covers the v2 surface ('apollo', 'hunter',
// 'sonar', 'manual') so the follow-up PR adds Phase 2/3 logic without
// a schema change. See docs/PLAN-P0-02C-CONTACT-RESOLVER.md and
// agent-specs/11-computer-contact-resolver.md.

export type ContactRole =
  | 'owner'
  | 'gc'
  | 'site_super'
  | 'contracting_officer'
  | 'decision_maker'
  | 'other';

export type ContactSource =
  | 'raw_payload'
  | 'apollo'
  | 'hunter'
  | 'sonar'
  | 'manual';

export interface ProjectContact {
  id: string;
  project_id: string;
  contact_role: ContactRole;
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  company: string | null;
  title: string | null;
  source: ContactSource;
  confidence: number;
  inferred: boolean;
  surfaced_at: string;
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


// LLM gateway cost telemetry. One row per call to Anthropic or Perplexity
// via lib/llm/run.ts. Replaces (over time) the agent_runs.model_calls JSONB
// rollup; /api/cost-summary reads both for one cycle. Migration 0014.
export type LlmCallSurface = 'cron' | 'chat' | 'architect' | 'manual' | 'test';

export interface LlmCallRow {
  id: string;
  agent_run_id: number | null;
  agent_name: string | null;
  session_id: string | null;
  surface: LlmCallSurface;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number;
  cost_usd: number | null;
  latency_ms: number | null;
  cache_hit: boolean;
  created_at: string;
}


// Deals + deal activities (Stream B Gate B1, migration 0050_deals.sql).
// One row per project that has progressed past raw lead. Distinct from
// lead_actions (HubSpot mirror); deals is the in-Pathfinder Kanban surface.
// See Phase2-worktrees/unicron-stream-b-pathfinder/STREAM-README.md.

export type DealPipelineStage =
  | 'NEW'
  | 'CONTACTED'
  | 'REPLIED'
  | 'MEETING'
  | 'PROPOSAL'
  | 'WON'
  | 'LOST';

export const DEAL_PIPELINE_STAGES: readonly DealPipelineStage[] = [
  'NEW',
  'CONTACTED',
  'REPLIED',
  'MEETING',
  'PROPOSAL',
  'WON',
  'LOST',
] as const;

export type DealActivityType =
  | 'stage_change'
  | 'email_sent'
  | 'reply_received'
  | 'meeting_booked'
  | 'manual_note';

export interface Deal {
  id: string;
  project_id: string;
  owner_email: string | null;
  pipeline_stage: DealPipelineStage;
  value_usd: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealActivity {
  id: string;
  deal_id: string;
  activity_type: DealActivityType;
  from_stage: DealPipelineStage | null;
  to_stage: DealPipelineStage | null;
  payload: Record<string, unknown>;
  actor_email: string | null;
  created_at: string;
}

// Joined shape returned by /api/deals — deals are useless without the
// project they reference, so the API hydrates project metadata. Avoids
// N+1 lookups in the Kanban card render path.
export interface DealWithProject extends Deal {
  project: Pick<
    Project,
    | 'id'
    | 'title'
    | 'project_value'
    | 'score'
    | 'verified'
    | 'nearest_branch_id'
    | 'distance_miles'
    | 'source'
    | 'project_stage'
  >;
}

// Email integrations + outreach edits (Stream B Gate B2, migration
// 0051_outreach_edits.sql). One email_integrations row per
// (actor_email, provider, account_email); one outreach_edits row per send.

export type EmailProvider = 'gmail' | 'outlook';

export interface EmailIntegration {
  id: string;
  actor_email: string;
  provider: EmailProvider;
  account_email: string;
  // Sensitive: never selected by the anon client. Server reads via
  // supabaseAdmin only.
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
  provider_meta: Record<string, unknown>;
  connected_at: string;
  disconnected_at: string | null;
}

// Connection-status row served by GET /api/email/status. Token columns
// stripped — anon-safe.
export interface EmailIntegrationStatus {
  actor_email: string;
  provider: EmailProvider;
  account_email: string;
  connected_at: string;
  disconnected_at: string | null;
}

export interface OutreachEdit {
  id: string;
  outreach_draft_id: number | null;
  project_id: string;
  actor_email: string;
  provider: EmailProvider;
  draft_subject: string | null;
  draft_body: string;
  sent_subject: string | null;
  sent_body: string;
  recipient_email: string;
  provider_message_id: string | null;
  provider_thread_id: string | null;
  send_error: string | null;
  edit_distance: number | null;
  edit_summary: Record<string, unknown> | null;
  sent_at: string | null;
  created_at: string;
}

// Email threads (Stream B Gate B3, migration 0052_email_threads.sql).
// One row per (provider, provider_thread_id). Seeded on outbound send
// (lib/email/outreach-send.ts) and updated when an inbound reply lands
// on a tracked thread (lib/email/webhooks).

export interface EmailThread {
  id: string;
  provider: EmailProvider;
  provider_thread_id: string;
  project_id: string;
  deal_id: string | null;
  actor_email: string;
  subject: string | null;
  recipient_email: string;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  replied_at: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
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
      project_contacts: {
        Row: ProjectContact;
        Insert: Omit<ProjectContact, 'id' | 'surfaced_at'> & {
          id?: string;
          surfaced_at?: string;
        };
        Update: Partial<ProjectContact>;
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
      llm_calls: {
        Row: LlmCallRow;
        Insert: Omit<LlmCallRow, 'id' | 'created_at' | 'cached_input_tokens' | 'cache_hit'> & {
          id?: string;
          created_at?: string;
          cached_input_tokens?: number;
          cache_hit?: boolean;
        };
        Update: Partial<LlmCallRow>;
        Relationships: [];
      };
      deals: {
        Row: Deal;
        Insert: Omit<Deal, 'id' | 'created_at' | 'updated_at' | 'pipeline_stage'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          pipeline_stage?: DealPipelineStage;
        };
        Update: Partial<Deal>;
        Relationships: [];
      };
      deal_activities: {
        Row: DealActivity;
        Insert: Omit<DealActivity, 'id' | 'created_at' | 'payload'> & {
          id?: string;
          created_at?: string;
          payload?: Record<string, unknown>;
        };
        Update: Partial<DealActivity>;
        Relationships: [];
      };
      email_integrations: {
        Row: EmailIntegration;
        Insert: Omit<EmailIntegration, 'id' | 'connected_at' | 'provider_meta'> & {
          id?: string;
          connected_at?: string;
          provider_meta?: Record<string, unknown>;
        };
        Update: Partial<EmailIntegration>;
        Relationships: [];
      };
      outreach_edits: {
        Row: OutreachEdit;
        Insert: Omit<OutreachEdit, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<OutreachEdit>;
        Relationships: [];
      };
      email_threads: {
        Row: EmailThread;
        Insert: Omit<EmailThread, 'id' | 'created_at' | 'updated_at' | 'message_count'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          message_count?: number;
        };
        Update: Partial<EmailThread>;
        Relationships: [];
      };
      // Demo Polish P1 (migration 0104) — per-org geography config.
      org_geo_config: {
        Row: OrgGeoConfig;
        Insert: Omit<OrgGeoConfig, 'updated_at'> & { updated_at?: string };
        Update: Partial<OrgGeoConfig>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
