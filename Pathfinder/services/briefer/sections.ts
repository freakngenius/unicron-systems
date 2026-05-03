// services/briefer/sections.ts — Demo Polish UX Gate 13W-A.
//
// Per-section queries + pure render helpers for the daily intelligence
// loop. Each section exports two functions:
//
//   fetchX(client, args)  → row set (impure; hits Supabase)
//   renderX(rows, args)   → markdown string (pure; testable)
//
// composeDailyBrief() in agent.ts orchestrates them. Tests target the
// render half with hand-rolled row fixtures, plus a composer-level test
// that stubs fetchX via dependency-injected adapters.

// Structural client shape used by the briefer. The real callers pass a
// supabaseAdmin() client (PathfinderDatabase-typed); tests pass a stub.
// We type loosely on purpose — the typed Tables map doesn't yet include
// outreach_sends / lead_contacts (existing convention; see
// lib/connectors/user-connection.ts), so `from()` returns a query
// builder typed as `any`. This keeps both real and test clients
// assignable.
export type BrieferClient = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface NewLeadRow {
  id: string;
  title: string;
  score: number | null;
  owner_name: string | null;
  project_value: number | null;
  posted_date: string | null;
}

export interface FollowUpRow {
  project_id: string;
  project_title: string;
  to_email: string;
  subject: string;
  sent_at: string;
}

export interface StageChangeRow {
  deal_id: string;
  project_id: string;
  project_title: string;
  from_stage: string | null;
  to_stage: string | null;
  created_at: string;
}

export interface ReplyRow {
  project_id: string;
  project_title: string;
  to_email: string;
  reply_received_at: string;
}

export interface ContactPendingRow {
  project_id: string;
  project_title: string;
  contact_name: string;
  role: string | null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function isoMinusHours(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * MS_PER_HOUR).toISOString();
}

function leadUrl(baseUrl: string, projectId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/leads/${encodeURIComponent(projectId)}`;
}

function formatUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function formatScore(s: number | null): string {
  if (s == null || !Number.isFinite(s)) return '—';
  return String(Math.round(s));
}

function daysAgo(now: Date, iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / MS_PER_DAY));
}

function loose(client: BrieferClient): BrieferClient {
  return client;
}

// ---------------------------------------------------------------------------
// Section 1 — Top 5 new leads (last 24 h)
// ---------------------------------------------------------------------------

export interface FetchNewLeadsArgs {
  now: Date;
  limit?: number;
}

export async function fetchNewLeads(
  client: BrieferClient,
  args: FetchNewLeadsArgs,
): Promise<NewLeadRow[]> {
  const cutoff = isoMinusHours(args.now, 24);
  const limit = args.limit ?? 5;
  const res = await loose(client)
    .from('projects')
    .select('id, title, score, owner_name, project_value, posted_date')
    .gte('posted_date', cutoff)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (res.error) {
    throw new Error(`fetchNewLeads failed: ${res.error.message}`);
  }
  return (res.data ?? []) as NewLeadRow[];
}

export function renderNewLeads(rows: NewLeadRow[], baseUrl: string): string {
  const header = '## Top new leads (last 24 h)';
  if (rows.length === 0) {
    return `${header}\n\n_No new leads scored in the last 24 hours._`;
  }
  const lines = rows.map((r) => {
    const owner = r.owner_name ? ` · ${r.owner_name}` : '';
    return `- **[${r.title}](${leadUrl(baseUrl, r.id)})** — score ${formatScore(
      r.score,
    )} · ${formatUsd(r.project_value)}${owner}`;
  });
  return `${header}\n\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Section 2 — Follow-ups due (sent ≥ 3 d ago, no reply)
// ---------------------------------------------------------------------------

export interface FetchFollowUpsArgs {
  now: Date;
  userId: string;
  staleAfterDays?: number;
}

export async function fetchFollowUps(
  client: BrieferClient,
  args: FetchFollowUpsArgs,
): Promise<FollowUpRow[]> {
  const stale = args.staleAfterDays ?? 3;
  const cutoff = isoMinusHours(args.now, stale * 24);
  const res = await loose(client)
    .from('outreach_sends')
    .select('project_id, to_email, subject, sent_at, projects(title)')
    .eq('user_id', args.userId)
    .eq('type', 'outreach')
    .is('reply_received_at', null)
    .lt('sent_at', cutoff)
    .order('sent_at', { ascending: true })
    .limit(20);
  if (res.error) {
    throw new Error(`fetchFollowUps failed: ${res.error.message}`);
  }
  return ((res.data ?? []) as Array<{
    project_id: string;
    to_email: string;
    subject: string;
    sent_at: string;
    projects: { title: string } | null;
  }>).map((r) => ({
    project_id: r.project_id,
    project_title: r.projects?.title ?? r.project_id,
    to_email: r.to_email,
    subject: r.subject,
    sent_at: r.sent_at,
  }));
}

export function renderFollowUps(
  rows: FollowUpRow[],
  baseUrl: string,
  now: Date,
): string {
  const header = '## Follow-ups due';
  if (rows.length === 0) {
    return `${header}\n\n_No outreach awaiting follow-up._`;
  }
  const lines = rows.map((r) => {
    const age = daysAgo(now, r.sent_at);
    return `- [${r.project_title}](${leadUrl(baseUrl, r.project_id)}) — sent ${age}d ago to ${r.to_email}`;
  });
  return `${header}\n\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Section 3 — Deal stage transitions (last 24 h, owner = userId)
// ---------------------------------------------------------------------------

export interface FetchStageChangesArgs {
  now: Date;
  userId: string;
}

export async function fetchStageChanges(
  client: BrieferClient,
  args: FetchStageChangesArgs,
): Promise<StageChangeRow[]> {
  const cutoff = isoMinusHours(args.now, 24);
  // Two-step fetch: deals owned by the user → stage_change activities for
  // those deals in the last 24 h. PostgREST can do this in one call via
  // the inner-join filter, but the loose-typed client makes that less
  // ergonomic; two calls is clearer and the deal set is small per user.
  const dealsRes = await loose(client)
    .from('deals')
    .select('id, project_id, projects(title)')
    .eq('owner_email', args.userId);
  if (dealsRes.error) {
    throw new Error(`fetchStageChanges deals failed: ${dealsRes.error.message}`);
  }
  const deals = ((dealsRes.data ?? []) as Array<{
    id: string;
    project_id: string;
    projects: { title: string } | null;
  }>);
  if (deals.length === 0) return [];
  const dealIds = deals.map((d) => d.id);
  const dealById = new Map(
    deals.map((d) => [d.id, { project_id: d.project_id, title: d.projects?.title ?? d.project_id }]),
  );
  const actsRes = await loose(client)
    .from('deal_activities')
    .select('deal_id, from_stage, to_stage, created_at')
    .eq('activity_type', 'stage_change')
    .gte('created_at', cutoff)
    .in('deal_id', dealIds)
    .order('created_at', { ascending: false })
    .limit(20);
  if (actsRes.error) {
    throw new Error(`fetchStageChanges activities failed: ${actsRes.error.message}`);
  }
  return ((actsRes.data ?? []) as Array<{
    deal_id: string;
    from_stage: string | null;
    to_stage: string | null;
    created_at: string;
  }>).map((a) => {
    const d = dealById.get(a.deal_id);
    return {
      deal_id: a.deal_id,
      project_id: d?.project_id ?? '',
      project_title: d?.title ?? '',
      from_stage: a.from_stage,
      to_stage: a.to_stage,
      created_at: a.created_at,
    };
  });
}

export function renderStageChanges(
  rows: StageChangeRow[],
  baseUrl: string,
): string {
  const header = '## Deal stage changes (last 24 h)';
  if (rows.length === 0) {
    return `${header}\n\n_No deals advanced in the last 24 hours._`;
  }
  const lines = rows.map((r) => {
    const from = r.from_stage ?? '—';
    const to = r.to_stage ?? '—';
    return `- [${r.project_title}](${leadUrl(baseUrl, r.project_id)}) — ${from} → **${to}**`;
  });
  return `${header}\n\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Section 4 — Replies received (last 24 h, sent by userId)
// ---------------------------------------------------------------------------

export interface FetchRepliesArgs {
  now: Date;
  userId: string;
}

export async function fetchReplies(
  client: BrieferClient,
  args: FetchRepliesArgs,
): Promise<ReplyRow[]> {
  const cutoff = isoMinusHours(args.now, 24);
  const res = await loose(client)
    .from('outreach_sends')
    .select('project_id, to_email, reply_received_at, projects(title)')
    .eq('user_id', args.userId)
    .gte('reply_received_at', cutoff)
    .order('reply_received_at', { ascending: false })
    .limit(20);
  if (res.error) {
    throw new Error(`fetchReplies failed: ${res.error.message}`);
  }
  return ((res.data ?? []) as Array<{
    project_id: string;
    to_email: string;
    reply_received_at: string;
    projects: { title: string } | null;
  }>).map((r) => ({
    project_id: r.project_id,
    project_title: r.projects?.title ?? r.project_id,
    to_email: r.to_email,
    reply_received_at: r.reply_received_at,
  }));
}

export function renderReplies(rows: ReplyRow[], baseUrl: string): string {
  const header = '## Replies received (last 24 h)';
  if (rows.length === 0) {
    return `${header}\n\n_No replies in the last 24 hours._`;
  }
  const lines = rows.map(
    (r) =>
      `- [${r.project_title}](${leadUrl(baseUrl, r.project_id)}) — reply from ${r.to_email}`,
  );
  return `${header}\n\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Section 5 — Contacts pending review
// ---------------------------------------------------------------------------
//
// "Pending review" = lead_contact rows whose decision_authority is still
// 'unknown' or whose email_status is 'guessed' — i.e. enrichment that
// the operator should sanity-check before sending. Limit to projects
// where the operator owns the deal.

export interface FetchContactsPendingArgs {
  now: Date;
  userId: string;
}

export async function fetchContactsPending(
  client: BrieferClient,
  args: FetchContactsPendingArgs,
): Promise<ContactPendingRow[]> {
  // Find projects with deals owned by this user.
  const dealsRes = await loose(client)
    .from('deals')
    .select('project_id')
    .eq('owner_email', args.userId);
  if (dealsRes.error) {
    throw new Error(`fetchContactsPending deals failed: ${dealsRes.error.message}`);
  }
  const projectIds = Array.from(
    new Set(((dealsRes.data ?? []) as Array<{ project_id: string }>).map((r) => r.project_id)),
  );
  if (projectIds.length === 0) return [];
  const res = await loose(client)
    .from('lead_contacts')
    .select('project_id, contact_name, role, decision_authority, email_status, projects(title)')
    .in('project_id', projectIds)
    .or('decision_authority.is.null,decision_authority.eq.unknown,email_status.eq.guessed')
    .order('enriched_at', { ascending: false })
    .limit(20);
  if (res.error) {
    throw new Error(`fetchContactsPending failed: ${res.error.message}`);
  }
  return ((res.data ?? []) as Array<{
    project_id: string;
    contact_name: string;
    role: string | null;
    projects: { title: string } | null;
  }>).map((r) => ({
    project_id: r.project_id,
    project_title: r.projects?.title ?? r.project_id,
    contact_name: r.contact_name,
    role: r.role,
  }));
}

export function renderContactsPending(
  rows: ContactPendingRow[],
  baseUrl: string,
): string {
  const header = '## Contacts pending review';
  if (rows.length === 0) {
    return `${header}\n\n_No contacts awaiting review._`;
  }
  const lines = rows.map((r) => {
    const role = r.role ? ` (${r.role})` : '';
    return `- [${r.project_title}](${leadUrl(baseUrl, r.project_id)}) — ${r.contact_name}${role}`;
  });
  return `${header}\n\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Test seam — small pure helpers exposed for unit tests.
// ---------------------------------------------------------------------------

export const __test__ = {
  isoMinusHours,
  leadUrl,
  formatUsd,
  formatScore,
  daysAgo,
};
