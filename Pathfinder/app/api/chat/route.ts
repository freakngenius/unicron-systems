// app/api/chat/route.ts — Intelligence Chat backend.
//
// POST  /api/chat       — accepts a user turn, classifies it, dispatches to
//                         one of five paths, streams the assistant response
//                         back via Server-Sent Events. Persists both the
//                         user message and the assistant message to
//                         pathfinder.chat_{threads,messages}.
//
// GET   /api/chat       — returns the thread for a given contextKey, with
//                         view-aware fallback (Q3 surfacing rule). Used by
//                         the chat panel on first open and on context
//                         change.
//
// Spec: Pathfinder/Pathfinder-Feature-Specs.md § "P0 Feature 1 — Intelligence Chat".
// Plan: docs/PLAN-P0-01-INTELLIGENCE-CHAT.md.

import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  isSonarConfigured,
  SONAR_UNCONFIGURED_MESSAGE,
  streamSonar,
  SonarRequestError,
} from '@/lib/chat/sonar';
import {
  draftOutreach,
  type IterationIntent,
} from '@/lib/chat/outreach-drafter';
import { fetchRepresentativeSites } from '@/lib/cross-pollination/site-enrichment';
import {
  summarizeHubSpotForChat,
  type HubSpotChatContext,
  type HubSpotConnectionSnapshot,
  type HubSpotDealRowSnapshot,
} from '@/lib/chat/hubspot-context';
import { getOperatorEmail } from '@/lib/connectors/auth';
import { getHubspotConnectionStatus } from '@/lib/connectors/connection-status';
import type {
  Branch,
  ChatContextSnapshot,
  ChatMessage,
  ChatMessageKind,
  ChatMessageRole,
  ChatSourceCitation,
  ChatThread,
  Customer,
  Project,
} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Engine note (2026-04-29): Kyle moved the entire chat panel off Claude
// onto Perplexity Sonar. Sonar is the only LLM this route talks to. Other
// places in the codebase that use Claude (Ranker rationale fallback at
// /api/rationale, etc.) stay on Claude. The classifier path that used
// Sonnet tool_use is gone — replaced by a regex intent detector below.

const HISTORY_TURN_LIMIT = 12; // last 6 user/assistant pairs
const MESSAGES_GET_LIMIT = 50;

// ── User identity (from Basic-Auth) ────────────────────────────────────────

function userEmailFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Basic ')) return null;
  try {
    // atob is available in Node 18+ runtime.
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    const user = decoded.slice(0, idx).trim();
    return user || null;
  } catch {
    return null;
  }
}

// ── SSE helpers ────────────────────────────────────────────────────────────

type SseEvent =
  | { type: 'meta'; threadId: string; kind: ResponseKind }
  | { type: 'delta'; text: string }
  | { type: 'sources'; items: ChatSourceCitation[]; tables?: string[] }
  | { type: 'actions'; items: { id: string; label: string }[] }
  | { type: 'outreach'; bundle: unknown }
  | { type: 'done'; latencyMs: number }
  | { type: 'error'; message: string };

function sseChunk(payload: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

// ── Intent detector (regex, no LLM call) ──────────────────────────────────
//
// Sonar handles the heavy lifting (Q&A, web research, forecasting, internal
// data narration) as a single default path. We only need to peel off two
// special cases: outreach drafting and workflow actions — both bypass the
// Sonar streaming path.
//
// Order of checks matters: outreach phrases like "draft outreach for this
// lead" must not be caught by the workflow regex, and vice versa.

type ResponseKind =
  | 'sonar_default' // → streamSonar (handles classes A, B, D, E, G transparently)
  | 'outreach_draft' // → draftOutreach (Sonar via lib/chat/outreach-drafter)
  | 'workflow_action' // → surface action buttons (no LLM call)
  | 'sonar_unconfigured'; // → emit verbatim spec § 0 Q2 message

interface Classification {
  kind: Exclude<ResponseKind, 'sonar_unconfigured'>;
  outreachIntent?: IterationIntent;
  audienceOverride?: string;
}

const OUTREACH_TRIGGER_RE =
  /\b(draft|write|generate|compose|create|prepare)\b.{0,20}\b(outreach|email|email\s*draft|message|dm|voicemail|copy)\b|\b(outreach\s+for|outreach\s+to|outreach\s+draft)\b/i;
const TIGHTEN_RE = /\b(tighten|tighter|shorter|trim|cut\s+(it|that)?\s*down|more concise|less wordy)\b/i;
const LESS_SALESY_RE = /\b(less\s+salesy|less\s+sales-y|less\s+sales(\s+pitch)?|tone\s+(it|that)?\s*down|more\s+restrained|less\s+pushy|less\s+aggressive)\b/i;
const ADD_WARM_INTRO_RE = /\b(warm\s+intro|warm-intro|warm\s+introduction|reference\s+our|mention\s+our|our\s+relationship\s+with)\b/i;
const OPEN_WITH_QUESTION_RE = /\b(open\s+with\s+(a\s+)?question|start\s+with\s+(a\s+)?question|lead\s+with\s+(a\s+)?question|question\s+instead)\b/i;
const ADD_TIME_SLOT_RE = /\b(time\s+slot|specific\s+time|two\s+(times|slots)|propose\s+a\s+time|suggest\s+a\s+time|calendar\s+option)\b/i;
const AUDIENCE_PIVOT_RE = /\b(rewrite\s+(for|as)|address(ed)?\s+to|for\s+the\s+(VP|CEO|CFO|COO|CTO|director|manager|owner|head)|pivot\s+(the|to)\s+audience)\b/i;

const ACTION_HUBSPOT_RE = /\b(push\s+to\s+hubspot|send\s+to\s+hubspot|sync\s+to\s+hubspot|accept(ed)?\s+(this|the\s+lead|it).{0,30}hubspot|move\s+(this|it)\s+(to|into)\s+hubspot)\b/i;
const ACTION_PIPELINE_RE = /\b(push\s+to\s+pipeline|send\s+to\s+pipeline|move\s+to\s+pipeline)\b/i;
const ACTION_SCHEDULE_RE = /\b(schedule\s+(a\s+)?follow[-\s]?up|set\s+(a\s+)?reminder|remind\s+me|follow\s*up\s+on\s+this)\b/i;
const ACTION_NOTE_RE = /\b(add\s+(a\s+)?note|attach\s+(a\s+)?note|leave\s+(a\s+)?note)\b/i;
const ACTION_EXPORT_CSV_RE = /\bexport\b.{0,40}\bcsv\b|\bcsv\s+(of|for|export|download)\b|\bdownload\s+(as\s+)?csv\b/i;
const ACTION_SUMMARIZE_RE = /\b(summari[sz]e|summary\s+of)\b.{0,40}\b(pipeline|this\s+week|this\s+month|activity|brief)\b|\bgenerate\s+(the\s+)?(friday\s+)?brief\b/i;

function classify(message: string): Classification {
  // ── Outreach drafting (highest priority — the spec's Class C) ──
  // Iteration intents take precedence over "fresh" if both signals match —
  // a turn like "draft outreach but make it tighter" still maps to fresh
  // because OUTREACH_TRIGGER_RE catches first; if the user says only "make
  // it tighter" without a draft trigger we still map to outreach because
  // the iteration words are unambiguous in chat context.
  if (OUTREACH_TRIGGER_RE.test(message)) {
    return { kind: 'outreach_draft', outreachIntent: 'fresh' };
  }
  if (TIGHTEN_RE.test(message)) return { kind: 'outreach_draft', outreachIntent: 'tighten' };
  if (LESS_SALESY_RE.test(message)) return { kind: 'outreach_draft', outreachIntent: 'less_salesy' };
  if (ADD_WARM_INTRO_RE.test(message)) return { kind: 'outreach_draft', outreachIntent: 'add_warm_intro' };
  if (OPEN_WITH_QUESTION_RE.test(message)) return { kind: 'outreach_draft', outreachIntent: 'open_with_question' };
  if (ADD_TIME_SLOT_RE.test(message)) return { kind: 'outreach_draft', outreachIntent: 'add_time_slot' };
  if (AUDIENCE_PIVOT_RE.test(message)) {
    const m = /\bfor\s+the\s+(VP|CEO|CFO|COO|CTO|director|manager|owner|head)[a-z\s]*/i.exec(message);
    return {
      kind: 'outreach_draft',
      outreachIntent: 'audience_pivot',
      audienceOverride: m ? m[0].replace(/^for\s+the\s+/i, '').trim() : undefined,
    };
  }

  // ── Workflow actions (Class F) ──
  if (
    ACTION_HUBSPOT_RE.test(message) ||
    ACTION_PIPELINE_RE.test(message) ||
    ACTION_SCHEDULE_RE.test(message) ||
    ACTION_NOTE_RE.test(message) ||
    ACTION_EXPORT_CSV_RE.test(message) ||
    ACTION_SUMMARIZE_RE.test(message)
  ) {
    return { kind: 'workflow_action' };
  }

  // ── Default: Sonar (Classes A, B, D, E, G) ──
  return { kind: 'sonar_default' };
}

// ── Thread / message persistence ──────────────────────────────────────────

// Supabase 2.45 strict-typing requires cast wrappers for inserts on
// schemas added after the typed bag was first generated. Mirrors the
// pattern in app/api/refresh/route.ts and app/api/rationale/[projectId]/route.ts.
type InsertOneResult<T> = { data: T | null; error: { message: string } | null };
interface InsertOne<TPayload, TRow> {
  insert: (row: TPayload) => {
    select: (cols: string) => {
      single: () => Promise<InsertOneResult<TRow>>;
      maybeSingle: () => Promise<InsertOneResult<TRow>>;
    };
  };
}

async function getOrCreateThread(args: {
  userEmail: string;
  contextKey: string;
  contextLabel: string;
  snapshot: ChatContextSnapshot;
}): Promise<ChatThread> {
  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from('chat_threads')
    .select('*')
    .eq('user_email', args.userEmail)
    .eq('context_key', args.contextKey)
    .maybeSingle();
  if (existing) return existing as ChatThread;

  const payload = {
    user_email: args.userEmail,
    context_key: args.contextKey,
    context_label: args.contextLabel,
    context_snapshot: args.snapshot as unknown as Record<string, unknown>,
  };
  const { data, error } = await (
    admin.from('chat_threads') as unknown as InsertOne<typeof payload, ChatThread>
  )
    .insert(payload)
    .select('*')
    .single();
  if (error || !data) throw new Error(`failed to create chat thread: ${error?.message ?? 'unknown'}`);
  return data;
}

async function appendMessage(args: {
  threadId: string;
  role: ChatMessageRole;
  kind?: ChatMessageKind;
  content: string;
  payload?: Record<string, unknown>;
  modelUsed?: string | null;
  latencyMs?: number | null;
}): Promise<ChatMessage> {
  const admin = supabaseAdmin();
  const row = {
    thread_id: args.threadId,
    role: args.role,
    kind: args.kind ?? 'text',
    content: args.content,
    payload: args.payload ?? {},
    model_used: args.modelUsed ?? null,
    latency_ms: args.latencyMs ?? null,
  };
  const { data, error } = await (
    admin.from('chat_messages') as unknown as InsertOne<typeof row, ChatMessage>
  )
    .insert(row)
    .select('*')
    .single();
  if (error || !data) throw new Error(`failed to append chat message: ${error?.message ?? 'unknown'}`);
  return data;
}

async function loadHistory(threadId: string, limit: number): Promise<ChatMessage[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .is('cleared_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  // Reverse so oldest-first for prompt construction.
  return ((data ?? []) as ChatMessage[]).slice().reverse();
}

// ── Hydration: rehydrate context from snapshot IDs ────────────────────────

interface Hydrated {
  project: Project | null;
  branch: Branch | null;
  warmCustomer: Customer | null;
  filteredProjects: Project[];
  allBranches: Branch[];
  // Demo Polish § 5.3 — engine-confirmed cross-pollination matches for
  // the open project (top-3 by recency). Empty when no project is open
  // or the engine hasn't matched anything.
  crossPollination: Array<{
    customer_canonical: string;
    match_layer: string;
    match_confidence: number;
    matched_field: string;
    matched_value_raw: string | null;
    primary_branch_name: string | null;
    branch_count: number;
    active_site_count: number;
    most_recent_site_date: string | null;
    national_account: boolean;
    representative_sites: Array<{
      site_name: string;
      city: string | null;
      state: string | null;
      customer_name_raw: string;
    }> | null;
  }>;
  // Gate 22 — HubSpot integration state for the current user (NOT the
  // org). Always scoped to userEmail in the loader so the chat never
  // surfaces another tenant's deals or connection.
  hubspot: HubSpotChatContext;
}

// Gate 22 — Stalled-deal threshold. Deals with no last_activity_at OR
// last_activity_at older than this window count as stalled. 14 days
// matches Kyle's "no activity in N days" framing in the Gate 22 spec.
const HUBSPOT_STALLED_DAYS = 14;
const HUBSPOT_RECENT_DEAL_LIMIT = 10;
const HUBSPOT_BY_STAGE_DEAL_LIMIT = 500;

async function loadHubSpotForUser(userId: string): Promise<HubSpotChatContext> {
  const admin = supabaseAdmin();

  // Connection: read through the unified connection-status helper so the
  // chat agent's view agrees with the Settings tile and the lead-detail
  // Push surface. The helper filters on (user_id, provider='hubspot',
  // status='active') and never reads the oauth_token_enc /
  // oauth_refresh_token_enc columns.
  const status = await getHubspotConnectionStatus(userId);
  const connection: HubSpotConnectionSnapshot | null =
    status.status === 'none'
      ? null
      : {
          provider: 'hubspot',
          status: status.status,
          portal_id: status.portalId,
          portal_name: status.portalName,
          connected_at: status.connectedAt,
          expires_at: status.expiresAt,
        };

  if (!connection) {
    return {
      connection: null,
      totalDeals: 0,
      byStage: {},
      recent: [],
      stalledCount: 0,
      stalledOlderThan: null,
    };
  }

  // Deals — every read filters on user_id. We pull a bounded window
  // (HUBSPOT_BY_STAGE_DEAL_LIMIT) and tally locally so the chat doesn't
  // round-trip per stage. For pilot scale (single user, < 500 pushed
  // deals) this is well below the row threshold where pagination helps.
  const { data: dealRows } = await admin
    .from('lead_hubspot_deals')
    .select(
      'project_id, hubspot_deal_id, hubspot_deal_url, pushed_at, last_synced_at, current_stage, current_stage_label, current_amount, current_owner_name, last_activity_at, status',
    )
    .eq('user_id', userId)
    .order('pushed_at', { ascending: false })
    .limit(HUBSPOT_BY_STAGE_DEAL_LIMIT);

  const deals = ((dealRows ?? []) as Array<Record<string, unknown>>).map((r): HubSpotDealRowSnapshot => ({
    project_id: String(r.project_id ?? ''),
    hubspot_deal_id: String(r.hubspot_deal_id ?? ''),
    hubspot_deal_url: (r.hubspot_deal_url as string | null) ?? null,
    pushed_at: String(r.pushed_at ?? ''),
    last_synced_at: (r.last_synced_at as string | null) ?? null,
    current_stage: (r.current_stage as string | null) ?? null,
    current_stage_label: (r.current_stage_label as string | null) ?? null,
    current_amount:
      typeof r.current_amount === 'string'
        ? Number.parseFloat(r.current_amount)
        : (r.current_amount as number | null) ?? null,
    current_owner_name: (r.current_owner_name as string | null) ?? null,
    last_activity_at: (r.last_activity_at as string | null) ?? null,
    status: String(r.status ?? 'active'),
  }));

  const stalledCutoff = new Date(Date.now() - HUBSPOT_STALLED_DAYS * 24 * 60 * 60 * 1000);
  const stalledIso = stalledCutoff.toISOString();
  let stalledCount = 0;
  const byStage: Record<string, number> = {};
  for (const d of deals) {
    if (d.status !== 'active' && d.status !== 'won' && d.status !== 'lost' && d.status !== 'archived' && d.status !== 'error') {
      // Defensive — pass-through unknown statuses are still counted but
      // don't blow up the bucket.
    }
    const stageKey = d.current_stage_label ?? d.current_stage ?? 'unknown';
    byStage[stageKey] = (byStage[stageKey] ?? 0) + 1;
    if (d.status === 'won' || d.status === 'lost' || d.status === 'archived') continue;
    if (!d.last_activity_at || new Date(d.last_activity_at) < stalledCutoff) {
      stalledCount += 1;
    }
  }

  return {
    connection,
    totalDeals: deals.length,
    byStage,
    recent: deals.slice(0, HUBSPOT_RECENT_DEAL_LIMIT),
    stalledCount,
    stalledOlderThan: stalledIso,
  };
}

async function hydrateContext(snapshot: ChatContextSnapshot, userId: string): Promise<Hydrated> {
  const admin = supabaseAdmin();
  const projectId = snapshot.openProjectId;
  const branchId = snapshot.selectedBranchId;
  const filteredIds = snapshot.filteredProjectIds.slice(0, 50);

  const [projectRes, branchRes, branchesRes, projectsRes] = await Promise.all([
    projectId
      ? admin.from('projects').select('*').eq('id', projectId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    branchId
      ? admin.from('branches').select('*').eq('id', branchId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from('branches').select('*'),
    filteredIds.length > 0
      ? admin.from('projects').select('*').in('id', filteredIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const project = (projectRes.data ?? null) as Project | null;
  const branch = (branchRes.data ?? null) as Branch | null;
  const allBranches = ((branchesRes.data ?? []) as Branch[]) ?? [];
  const filteredProjects = ((projectsRes.data ?? []) as Project[]) ?? [];

  let warmCustomer: Customer | null = null;
  if (project?.warm_for_customer_id) {
    const { data } = await admin
      .from('customers')
      .select('*')
      .eq('id', project.warm_for_customer_id)
      .maybeSingle();
    warmCustomer = (data ?? null) as Customer | null;
  }

  let crossPollination: Hydrated['crossPollination'] = [];
  if (project?.id) {
    const { data } = await admin
      .from('lead_cross_pollination')
      .select(
        'customer_canonical, match_layer, match_confidence, matched_field, matched_value_raw, primary_branch_name, branch_count, active_site_count, most_recent_site_date, national_account',
      )
      .eq('lead_id', project.id)
      .order('most_recent_site_date', { ascending: false, nullsFirst: false })
      .limit(3);
    crossPollination = ((data ?? []) as Array<{
      customer_canonical: string;
      match_layer: string;
      match_confidence: number | string;
      matched_field: string;
      matched_value_raw: string | null;
      primary_branch_name: string | null;
      branch_count: number | null;
      active_site_count: number | null;
      most_recent_site_date: string | null;
      national_account: boolean | null;
    }>).map((r) => ({
      customer_canonical: r.customer_canonical,
      match_layer: r.match_layer,
      match_confidence: typeof r.match_confidence === 'string' ? parseFloat(r.match_confidence) : r.match_confidence,
      matched_field: r.matched_field,
      matched_value_raw: r.matched_value_raw,
      primary_branch_name: r.primary_branch_name,
      branch_count: r.branch_count ?? 0,
      active_site_count: r.active_site_count ?? 0,
      most_recent_site_date: r.most_recent_site_date,
      national_account: r.national_account ?? false,
      representative_sites: null as Hydrated['crossPollination'][number]['representative_sites'],
    }));

    // Enrich each match with up to 3 representative past Zedcor jobsites
    // so the Drafter prompt can name a specific site by name in the
    // warm-intro opening (makes it feel personable, not corporate).
    if (crossPollination.length > 0) {
      const sitesMap = await fetchRepresentativeSites(
        admin,
        crossPollination.map((m) => m.customer_canonical),
      );
      for (const m of crossPollination) {
        const sites = sitesMap.get(m.customer_canonical.toLowerCase());
        if (sites && sites.length > 0) m.representative_sites = sites;
      }
    }
  }

  const hubspot = await loadHubSpotForUser(userId);

  return {
    project,
    branch,
    warmCustomer,
    filteredProjects,
    allBranches,
    crossPollination,
    hubspot,
  };
}

// ── Provenance footer parsing (Sonar emits `TABLES: ...` at end) ─────────

function parseTablesFooter(text: string): string[] {
  const m = text.match(/TABLES:\s*([^\n]+)$/m);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^pathfinder\./, ''))
    .filter((s) => s.length > 0);
}

// ── Sonar query construction (handles every default-path turn) ───────────
//
// Sonar's `system` slot carries the agent voice + style rules + the full
// internal-data context block. The `query` slot carries only the user's
// message. We DO want Sonar to do its web search — it adds free citations
// and recent context — but we also want it to lean on the structured data
// we already have for branches, projects, customers, etc. Putting the data
// in `system` and the question in `query` keeps the search query crisp.

function buildSonarSystemPrompt(args: {
  snapshot: ChatContextSnapshot;
  hydrated: Hydrated;
  history: ChatMessage[];
}): string {
  const lines: string[] = [
    `You are Pathfinder's Intelligence Chat for Zedcor Security Systems. Be specific, restrained, direct.`,
    ``,
    `Style rules — non-negotiable:`,
    `- No em-dashes (—) or en-dashes (–). Use commas, periods, or "to" instead.`,
    `- No buzzwords ("synergy", "leverage", "cutting-edge").`,
    `- When you reference a project, branch, or customer, name it specifically. Use project IDs in backticks when listing.`,
    `- When the question is about Zedcor's own pipeline, prefer the structured PATHFINDER context over web search results.`,
    `- When the question is about external context (news, contractor history, market trends), use web search and cite sources.`,
    `- When you don't have data to answer, say so plainly. Never fabricate.`,
    `- When the question is about HubSpot (connection state, pushed leads, deal stages, sync status, stalled deals), read the HUBSPOT INTEGRATION CONTEXT block below. The block is already scoped to the asking user; if it says "not connected", say exactly that and link to /pathfinder/settings/connectors. Do not invent counts.`,
    ``,
    `At the very end of your response, on its own line, write "TABLES:" followed by a comma-separated list of pathfinder.* tables you reasoned over (e.g., "TABLES: projects, branches"). The host strips this line for display and renders it as a structured provenance footer. If you used no internal tables, write "TABLES: (none)".`,
    ``,
    `── PATHFINDER CONTEXT ──`,
  ];
  const compactProject = args.hydrated.project
    ? {
        id: args.hydrated.project.id,
        title: args.hydrated.project.title,
        summary: args.hydrated.project.summary,
        source: args.hydrated.project.source,
        project_value: args.hydrated.project.project_value,
        project_stage: args.hydrated.project.project_stage,
        posted_date: args.hydrated.project.posted_date,
        score: args.hydrated.project.score,
        rationale: args.hydrated.project.rationale,
        nearest_branch_id: args.hydrated.project.nearest_branch_id,
        distance_miles: args.hydrated.project.distance_miles,
        warm_for_customer_id: args.hydrated.project.warm_for_customer_id,
        verified: args.hydrated.project.verified ?? null,
      }
    : null;
  const compactBranch = args.hydrated.branch
    ? {
        id: args.hydrated.branch.id,
        code: args.hydrated.branch.code,
        name: args.hydrated.branch.name,
        coverage_radius_miles: args.hydrated.branch.coverage_radius_miles,
      }
    : null;
  const compactCustomer = args.hydrated.warmCustomer
    ? {
        id: args.hydrated.warmCustomer.id,
        name: args.hydrated.warmCustomer.name,
        served_by_branch_id: args.hydrated.warmCustomer.served_by_branch_id,
      }
    : null;
  const compactFiltered = args.hydrated.filteredProjects.slice(0, 50).map((p) => ({
    id: p.id,
    title: p.title,
    score: p.score,
    project_value: p.project_value,
    nearest_branch_id: p.nearest_branch_id,
    project_stage: p.project_stage,
    distance_miles: p.distance_miles,
    posted_date: p.posted_date,
  }));
  const branches = args.hydrated.allBranches.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
  }));
  lines.push(`VIEW: ${args.snapshot.view}`);
  lines.push(`FOCUSED PROJECT: ${JSON.stringify(compactProject)}`);
  lines.push(`FOCUSED BRANCH: ${JSON.stringify(compactBranch)}`);
  lines.push(`WARM CUSTOMER: ${JSON.stringify(compactCustomer)}`);
  lines.push(`BRANCHES: ${JSON.stringify(branches)}`);
  lines.push(`FILTERED PROJECTS (top ${compactFiltered.length}): ${JSON.stringify(compactFiltered)}`);
  lines.push(`SOURCE FILTER: ${args.snapshot.sourceFilter} | CROSS-POLL: ${args.snapshot.crossPoll}`);
  lines.push(`TOTAL PROJECTS IN VIEW: ${args.snapshot.totalProjects}`);
  lines.push('');
  lines.push('── HUBSPOT INTEGRATION CONTEXT (scoped to current user) ──');
  lines.push(summarizeHubSpotForChat(args.hydrated.hubspot));
  if (args.history.length > 0) {
    const compactHistory = args.history.slice(-HISTORY_TURN_LIMIT).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 1200),
    }));
    lines.push(`PRIOR TURNS: ${JSON.stringify(compactHistory)}`);
  }
  return lines.join('\n');
}

// ── POST handler ──────────────────────────────────────────────────────────

interface PostBody {
  contextKey: string;
  contextLabel: string;
  contextSnapshot: ChatContextSnapshot;
  message: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const userEmail = userEmailFromRequest(req);
  if (!userEmail) return new Response('unauthorized', { status: 401 });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!body.message || !body.contextKey) {
    return new Response(JSON.stringify({ error: 'message_and_contextKey_required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 1. Thread + user message persistence.
        const thread = await getOrCreateThread({
          userEmail,
          contextKey: body.contextKey,
          contextLabel: body.contextLabel,
          snapshot: body.contextSnapshot,
        });
        await appendMessage({
          threadId: thread.id,
          role: 'user',
          content: body.message,
        });

        // 2. Classify (regex, no LLM call).
        const classification = classify(body.message);

        // 3. Determine effective response kind (handle Sonar-unconfigured).
        // With the Sonar swap, EVERY non-action turn needs Sonar — so the
        // unconfigured guard now applies to the default path AND the
        // outreach path.
        let kind: ResponseKind = classification.kind;
        if ((kind === 'sonar_default' || kind === 'outreach_draft') && !isSonarConfigured()) {
          kind = 'sonar_unconfigured';
        }

        controller.enqueue(sseChunk({ type: 'meta', threadId: thread.id, kind }));

        // 4. Dispatch.
        // Identity resolution for HubSpot lookups — the rows in
        // pathfinder.user_connections / pathfinder.lead_hubspot_deals
        // were written under the OPERATOR email (getCurrentUserId →
        // getOperatorEmail at install time + push time). The chat's
        // basic-auth userEmail can differ from the operator email per
        // the operator-allowlist memory note (e.g., kyle@demystified.ai
        // for /settings vs kyle@freakngenius.com for git/basic-auth).
        // Prefer operator email when the chat client sent the
        // x-operator-email header; fall back to basic-auth so chat keeps
        // working for non-operator users (who simply have no HubSpot
        // rows to surface).
        const operatorEmail = getOperatorEmail(req);
        const hubspotUserId = operatorEmail ?? userEmail;
        const hydrated = await hydrateContext(body.contextSnapshot, hubspotUserId);
        const history = await loadHistory(thread.id, HISTORY_TURN_LIMIT);

        if (kind === 'sonar_unconfigured') {
          controller.enqueue(sseChunk({ type: 'delta', text: SONAR_UNCONFIGURED_MESSAGE }));
          await appendMessage({
            threadId: thread.id,
            role: 'assistant',
            kind: 'text',
            content: SONAR_UNCONFIGURED_MESSAGE,
            payload: {
              degraded: true,
              reason: 'sonar_not_configured',
              classified_as: classification.kind,
            },
          });
          controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
          controller.close();
          return;
        }

        if (kind === 'outreach_draft') {
          if (!hydrated.project) {
            const fallback =
              "I can draft outreach when a project is open. Click a project on the map or in the right rail, then ask again.";
            controller.enqueue(sseChunk({ type: 'delta', text: fallback }));
            await appendMessage({
              threadId: thread.id,
              role: 'assistant',
              content: fallback,
              payload: { reason: 'no_project_open' },
            });
            controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
            controller.close();
            return;
          }

          const bundle = await draftOutreach({
            project: hydrated.project,
            branch: hydrated.branch,
            warmCustomer: hydrated.warmCustomer,
            intent: classification.outreachIntent ?? 'fresh',
            audienceOverride: classification.audienceOverride,
            crossPollination:
              hydrated.crossPollination.length > 0 ? hydrated.crossPollination : null,
          });

          // Stream a brief intro so the UI shows progress before the bundle.
          const intro = bundle.verifierWarnings.length === 0
            ? "Here is a 3-channel outreach bundle. Length and tone rules pass."
            : `Here is a best-effort 3-channel bundle. Verifier flagged: ${bundle.verifierWarnings.join(', ')}. Review before sending.`;
          controller.enqueue(sseChunk({ type: 'delta', text: intro }));
          controller.enqueue(sseChunk({ type: 'outreach', bundle }));
          controller.enqueue(
            sseChunk({
              type: 'actions',
              items: [
                { id: 'copy_draft', label: 'Copy' },
                { id: 'save_draft', label: 'Save draft' },
                { id: 'regenerate_draft', label: 'Regenerate' },
              ],
            }),
          );
          await appendMessage({
            threadId: thread.id,
            role: 'assistant',
            kind: 'outreach_draft',
            content: intro,
            payload: { bundle, intent: classification.outreachIntent ?? 'fresh' },
            modelUsed: bundle.modelUsed,
          });
          controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
          controller.close();
          return;
        }

        if (kind === 'workflow_action') {
          const reply = workflowActionPrompt();
          controller.enqueue(sseChunk({ type: 'delta', text: reply }));
          controller.enqueue(
            sseChunk({
              type: 'actions',
              items: [
                { id: 'export_csv', label: 'Export CSV' },
                { id: 'summarize_pipeline', label: 'Summarize pipeline' },
                { id: 'accept_lead_to_hubspot', label: 'Accept to HubSpot' },
                { id: 'schedule_followup', label: 'Schedule follow-up' },
              ],
            }),
          );
          await appendMessage({
            threadId: thread.id,
            role: 'assistant',
            kind: 'text',
            content: reply,
            payload: { classified_as: 'workflow_action' },
          });
          controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
          controller.close();
          return;
        }

        // sonar_default — covers classes A (project Q&A), B (web research),
        // D (cross-record pull), E (competitive Q&A), G (forecasting). The
        // structured pathfinder.* context goes in the Sonar system prompt;
        // the user's question goes in the query slot. Sonar's web search
        // adds free citations for any external context.
        let acc = '';
        let citations: ChatSourceCitation[] = [];
        try {
          for await (const ev of streamSonar({
            systemPrompt: buildSonarSystemPrompt({
              snapshot: body.contextSnapshot,
              hydrated,
              history,
            }),
            query: body.message,
            recencyDays: 30,
          })) {
            if (ev.type === 'delta') {
              acc += ev.text;
              const safe = stripTablesFooter(ev.text, acc);
              if (safe.length > 0) {
                controller.enqueue(sseChunk({ type: 'delta', text: safe }));
              }
            } else if (ev.type === 'citations') {
              citations = ev.items;
            }
          }
        } catch (err) {
          const fallback =
            err instanceof SonarRequestError
              ? `Sonar request failed (status ${err.status}). Try again, or rephrase.`
              : `Chat is currently unavailable. ${err instanceof Error ? err.message : String(err)}`;
          controller.enqueue(sseChunk({ type: 'delta', text: fallback }));
          await appendMessage({
            threadId: thread.id,
            role: 'assistant',
            kind: 'error',
            content: fallback,
            payload: { reason: 'sonar_error', detail: String(err) },
          });
          controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
          controller.close();
          return;
        }

        const tables = parseTablesFooter(acc);
        if (citations.length > 0 || tables.length > 0) {
          controller.enqueue(sseChunk({ type: 'sources', items: citations, tables }));
        }
        await appendMessage({
          threadId: thread.id,
          role: 'assistant',
          kind: 'text',
          content: stripTrailingTablesLine(acc).trim(),
          payload: { sources: citations, tables, classified_as: 'sonar_default' },
          modelUsed: 'sonar',
        });
        controller.enqueue(sseChunk({ type: 'done', latencyMs: Date.now() - startedAt }));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(sseChunk({ type: 'error', message }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

function workflowActionPrompt(): string {
  return 'Pick an action below. CSV export and pipeline summary run instantly. HubSpot push and scheduled follow-up are queued for when those integrations land.';
}

function stripTablesFooter(delta: string, accumulated: string): string {
  // If the accumulated stream now contains "TABLES:" (header for the
  // structured footer the model emits at the end), suppress everything
  // from there onward. The current `delta` is what we just received.
  const tablesIdx = accumulated.lastIndexOf('TABLES:');
  if (tablesIdx < 0) return delta;
  const accBefore = accumulated.slice(0, tablesIdx);
  const visibleSoFar = accBefore.length;
  // delta arrived AFTER `accBefore` was already streamed. The portion of
  // `delta` we should keep is whatever overlaps with the visible region.
  const accLength = accumulated.length;
  const deltaStart = accLength - delta.length;
  if (deltaStart >= visibleSoFar) return ''; // entirely after the footer
  return delta.slice(0, visibleSoFar - deltaStart);
}

function stripTrailingTablesLine(text: string): string {
  return text.replace(/\n?TABLES:\s*[^\n]*\s*$/m, '');
}

// ── GET handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const userEmail = userEmailFromRequest(req);
  if (!userEmail) return new Response('unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const contextKey = searchParams.get('contextKey');
  const fallback = searchParams.get('fallback');

  const admin = supabaseAdmin();
  let thread: ChatThread | null = null;

  if (contextKey) {
    const { data } = await admin
      .from('chat_threads')
      .select('*')
      .eq('user_email', userEmail)
      .eq('context_key', contextKey)
      .maybeSingle();
    thread = (data ?? null) as ChatThread | null;
  }

  let resumed: { fromContextKey: string; fromContextLabel: string } | undefined;
  if (!thread && fallback === 'recent') {
    const { data } = await admin
      .from('chat_threads')
      .select('*')
      .eq('user_email', userEmail)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    thread = (data ?? null) as ChatThread | null;
    if (thread && thread.context_key !== contextKey) {
      resumed = {
        fromContextKey: thread.context_key,
        fromContextLabel: thread.context_label,
      };
    }
  }

  let messages: ChatMessage[] = [];
  if (thread) {
    const { data } = await admin
      .from('chat_messages')
      .select('*')
      .eq('thread_id', thread.id)
      .is('cleared_at', null)
      .order('created_at', { ascending: true })
      .limit(MESSAGES_GET_LIMIT);
    messages = ((data ?? []) as ChatMessage[]) ?? [];
  }

  return new Response(
    JSON.stringify({ thread, messages, resumed: resumed ?? null }),
    {
      headers: { 'content-type': 'application/json' },
    },
  );
}
