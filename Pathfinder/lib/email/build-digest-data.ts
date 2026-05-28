// lib/email/build-digest-data.ts
//
// Sprint Z1A — assembles the JSON payload consumed by the Pathfinder
// Daily Digest Handlebars template. Returns the exact shape in
// /Users/kylekesterson/Documents/Claude/Unicron/Pathfinder Digest - Design/sample-data.json
//
// Spec: Specs/SPEC-zedcor-digest-template.md §"Data shape" + §"Variable computation rules".

import { Client } from '@notionhq/client';
import { supabaseAdmin } from '@/lib/supabase';
import type { NotionPhase, NotionState } from '@/lib/notion/types';

const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';
const NOTION_DB_URL_DEFAULT = 'https://www.notion.so/856b43a02b4d43649344c5e1a05d206d';
const TZ = 'America/Chicago';
const SCOPE_KEYWORDS = [
  'perimeter', 'fence', 'surveillance', 'security', 'towers',
  'lay-down', 'jobsite', 'demolition',
];

export interface DigestLead {
  title: string;
  notion_url: string;
  phase: NotionPhase;
  score: number;
  response_deadline_pretty: string;
  days_until_deadline: number | null;
  agency: string;
  city: string;
  county: string;
  state: NotionState | string;
  rationale: string;
  estimated_value_pretty: string | null;
}

export interface DigestData {
  date_pretty: string;
  date_short: string;
  run_id: string;
  edition_no: string;
  new_leads_count: number;
  closing_soon_count: number;
  sources_polled_count: number;
  highest_score: number;
  highest_score_label: string;
  notion_db_url: string;
  logo_url: string;
  leads: DigestLead[];
  leads_remaining_count: number;
}

// ---------------------------------------------------------------------------
// Date/time helpers (America/Chicago)
// ---------------------------------------------------------------------------

function partsFromDate(d: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value;
  return map;
}

function formatDatePretty(d: Date): string {
  // "Wednesday, 27 May 2026"
  const p = partsFromDate(d);
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

function formatDateShort(d: Date): string {
  // "27 MAY 2026 · 06:00 CT"
  const p = partsFromDate(d);
  return `${p.day} ${(p.month || '').toUpperCase()} ${p.year} · ${p.hour}:${p.minute} CT`;
}

function startOfTodayChicagoIso(): string {
  const now = new Date();
  const p = partsFromDate(now);
  // The Chicago-local "today" start at midnight, expressed as ISO date.
  return `${p.year}-${monthAbbrToNum(p.month)}-${p.day.padStart(2, '0')}`;
}

function monthAbbrToNum(abbr: string): string {
  const map: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  return map[abbr] ?? '01';
}

function formatLeadDeadline(deadlineISO: string | null, phase: NotionPhase): { pretty: string; days: number | null } {
  if (!deadlineISO) return { pretty: phase === 'pre-bid' ? 'Pre-bid TBD' : '—', days: null };
  const d = new Date(deadlineISO);
  if (!Number.isFinite(d.getTime())) return { pretty: '—', days: null };
  const p = partsFromDate(d);
  const sameYear = p.year === partsFromDate(new Date()).year;
  const base = sameYear ? `${p.day} ${p.month}` : `${p.day} ${p.month} ${p.year}`;
  if (phase === 'pre-bid') return { pretty: `Pre-bid ${base}`, days: null };
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  return { pretty: base, days };
}

function formatEstimatedValue(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// Notion helpers
// ---------------------------------------------------------------------------

interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, unknown>;
}

function notionClient(): Client {
  const token = process.env.NOTION_API_TOKEN;
  if (!token) throw new Error('NOTION_API_TOKEN is not set');
  return new Client({ auth: token });
}

function databaseId(): string {
  return process.env.ZEDCOR_NOTION_DB_ID ?? '856b43a02b4d43649344c5e1a05d206d';
}

function readText(prop: unknown): string {
  const p = prop as { rich_text?: Array<{ plain_text?: string }>; title?: Array<{ plain_text?: string }> } | null;
  if (!p) return '';
  const arr = p.rich_text ?? p.title ?? [];
  return arr.map((x) => x.plain_text ?? '').join('');
}

function readSelect(prop: unknown): string | null {
  return (prop as { select?: { name?: string } | null } | null)?.select?.name ?? null;
}

function readNumber(prop: unknown): number | null {
  const v = (prop as { number?: number | null } | null)?.number;
  return v === undefined ? null : v;
}

function readDate(prop: unknown): string | null {
  return (prop as { date?: { start?: string } | null } | null)?.date?.start ?? null;
}

function readUrl(prop: unknown): string | null {
  return (prop as { url?: string | null } | null)?.url ?? null;
}

// ---------------------------------------------------------------------------
// Notion queries
// ---------------------------------------------------------------------------

async function queryRepViewLeads(client: Client, maxCards: number): Promise<NotionPage[]> {
  const res = (await (client as unknown as {
    databases: { query: (args: unknown) => Promise<{ results: NotionPage[] }> };
  }).databases.query({
    database_id: databaseId(),
    filter: {
      and: [
        { property: 'Phase', select: { does_not_equal: 'awarded' } },
        { property: 'Rep Status', select: { does_not_equal: 'not-relevant' } },
        { property: 'Score', number: { is_not_empty: true } },
      ],
    },
    sorts: [
      { property: 'Score', direction: 'descending' },
      { property: 'Response Deadline', direction: 'ascending' },
    ],
    page_size: maxCards,
  }));
  return res.results;
}

async function countNewToday(client: Client): Promise<number> {
  const todayStart = startOfTodayChicagoIso();
  const res = (await (client as unknown as {
    databases: { query: (args: unknown) => Promise<{ results: NotionPage[]; has_more: boolean }> };
  }).databases.query({
    database_id: databaseId(),
    filter: {
      and: [
        { property: 'Ingested At', created_time: { on_or_after: todayStart } },
        { property: 'Phase', select: { does_not_equal: 'awarded' } },
        { property: 'Rep Status', select: { does_not_equal: 'not-relevant' } },
      ],
    },
    page_size: 100,
  }));
  return res.results.length;
}

async function countClosingSoon(client: Client): Promise<number> {
  const now = new Date();
  const start = now.toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const res = (await (client as unknown as {
    databases: { query: (args: unknown) => Promise<{ results: NotionPage[] }> };
  }).databases.query({
    database_id: databaseId(),
    filter: {
      and: [
        { property: 'Response Deadline', date: { on_or_after: start } },
        { property: 'Response Deadline', date: { on_or_before: end } },
        { property: 'Phase', select: { does_not_equal: 'awarded' } },
        { property: 'Rep Status', select: { does_not_equal: 'not-relevant' } },
      ],
    },
    page_size: 100,
  }));
  return res.results.length;
}

// ---------------------------------------------------------------------------
// Highest-score label
// ---------------------------------------------------------------------------

function shortenAgency(agency: string): string {
  return agency
    .replace(/\b(Authority|Department|District|Office|of)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
}

function scopeKeywordFromTitle(title: string): string {
  const lower = title.toLowerCase();
  for (const kw of SCOPE_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return 'top match';
}

function buildHighestScoreLabel(leads: DigestLead[]): string {
  if (leads.length === 0) return '';
  const top = leads[0];
  return `${shortenAgency(top.agency)} · ${scopeKeywordFromTitle(top.title)}`;
}

// ---------------------------------------------------------------------------
// Run lookups (Supabase)
// ---------------------------------------------------------------------------

interface AgentRunRow {
  id: number;
  started_at: string;
  status: string;
}

async function latestSuccessfulRun(): Promise<AgentRunRow | null> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            in: (col: string, vals: string[]) => {
              order: (col: string, opts: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: AgentRunRow[] | null }>;
              };
            };
          };
        };
      };
    };
  };
  const { data } = await admin
    .from('agent_runs')
    .select('id, started_at, status')
    .eq('organization_id', ZEDCOR_ORG_ID)
    .eq('agent_name', 'zedcor-orchestrator-manual')
    .in('status', ['success', 'partial_failure'])
    .order('started_at', { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

async function countDistinctSourcesPolled(runId: number): Promise<number> {
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          contains: (col: string, val: unknown) => Promise<{ data: Array<{ event_data: Record<string, unknown> }> | null }>;
        };
      };
    };
  };
  const { data } = await admin
    .from('agent_log')
    .select('event_data')
    .eq('event_type', 'source_hit')
    .contains('event_data', { run_id: runId });
  if (!data) return 0;
  const slugs = new Set<string>();
  for (const row of data) {
    const slug = (row.event_data as { source_slug?: string } | null)?.source_slug;
    if (slug) slugs.add(slug);
  }
  return slugs.size;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface BuildDigestDataOptions {
  /** If null, uses the latest successful Zedcor orchestrator run. */
  runId?: number | null;
  recipients?: string[];
  /** Override logo URL for tests; defaults to DIGEST_LOGO_URL env. */
  logoUrl?: string;
  /** Override max-cards; defaults to DIGEST_MAX_CARDS env or 10. */
  maxCards?: number;
}

export async function buildDigestData(opts: BuildDigestDataOptions = {}): Promise<DigestData> {
  const client = notionClient();
  const maxCards = opts.maxCards ?? Number(process.env.DIGEST_MAX_CARDS ?? '10');

  const run = opts.runId != null
    ? { id: opts.runId, started_at: new Date().toISOString(), status: 'success' as const }
    : await latestSuccessfulRun();
  const runIdNum = run?.id ?? 0;
  const runStartedAt = run?.started_at ? new Date(run.started_at) : new Date();

  const [pages, newLeadsCount, closingSoonCount, sourcesPolledCount] = await Promise.all([
    queryRepViewLeads(client, maxCards),
    countNewToday(client),
    countClosingSoon(client),
    runIdNum > 0 ? countDistinctSourcesPolled(runIdNum) : Promise.resolve(0),
  ]);

  const leads: DigestLead[] = pages.map((page) => {
    const props = page.properties;
    const title = readText(props['Title']);
    const phase = (readSelect(props['Phase']) as NotionPhase) ?? 'unknown';
    const scoreRaw = readNumber(props['Score']);
    const score = scoreRaw ?? 0;
    const deadlineISO = readDate(props['Response Deadline']);
    const { pretty, days } = formatLeadDeadline(deadlineISO, phase);
    const agency = readText(props['Agency']);
    const city = readText(props['City']);
    let county = readText(props['County']);
    if (county && !/\bcounty\b/i.test(county)) county = `${county} County`;
    const state = readSelect(props['State']) ?? '';
    let rationale = readText(props['Rationale']);
    if (rationale.length > 220) rationale = `${rationale.slice(0, 220)}...`;
    const estimatedValue = readNumber(props['Estimated Value']);

    return {
      title,
      notion_url: page.url,
      phase,
      score,
      response_deadline_pretty: pretty,
      days_until_deadline: days,
      agency,
      city,
      county,
      state,
      rationale,
      estimated_value_pretty: formatEstimatedValue(estimatedValue),
    };
  });

  const highest = leads[0]?.score ?? 0;
  const highestLabel = buildHighestScoreLabel(leads);

  const editionNo = String(runIdNum).padStart(3, '0');

  const data: DigestData = {
    date_pretty: formatDatePretty(runStartedAt),
    date_short: formatDateShort(runStartedAt),
    run_id: String(runIdNum).padStart(3, '0'),
    edition_no: editionNo,
    new_leads_count: newLeadsCount,
    closing_soon_count: closingSoonCount,
    sources_polled_count: sourcesPolledCount,
    highest_score: highest,
    highest_score_label: highestLabel,
    notion_db_url: NOTION_DB_URL_DEFAULT,
    logo_url: opts.logoUrl ?? process.env.DIGEST_LOGO_URL ?? '',
    leads,
    leads_remaining_count: Math.max(0, newLeadsCount - leads.length),
  };

  return data;
}

/** Plain-text fallback for Resend `text` field; used by send-digest. */
export function buildDigestText(data: DigestData): string {
  const header = `Pathfinder Houston — ${data.new_leads_count} new opportunities · ${data.date_pretty}\n` +
                 `Closing soon: ${data.closing_soon_count} · Sources polled: ${data.sources_polled_count} · Top score: ${data.highest_score}\n\n`;
  const body = data.leads.map((l) => {
    return [
      `[${l.phase.toUpperCase()}] ${l.title}`,
      `  Score ${l.score} · ${l.response_deadline_pretty}${l.days_until_deadline != null ? ` (${l.days_until_deadline} days)` : ''} · ${l.agency}`,
      `  ${l.city}, ${l.state} · ${l.county}${l.estimated_value_pretty ? ` · ${l.estimated_value_pretty}` : ''}`,
      `  ${l.rationale}`,
      `  ${l.notion_url}`,
    ].join('\n');
  }).join('\n\n');
  const footer = `\n\nFeed: ${data.notion_db_url}`;
  return header + body + footer;
}
