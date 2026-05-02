// GET /api/cron/ranker — Vercel-cron driven Pathfinder Ranker.
//
// Runtime: Vercel cron at `*/30 * * * *` (every 30 minutes, set in vercel.json).
// Behavioral spec: docs/specs/ranker.md (the v2 spec, copied from the retired
// Perplexity Space prompt with a model-routing edit). Implementation must
// match that spec exactly.
//
// Why a Next.js route and not a Computer agent: ranking is deterministic
// plumbing — a cheap classifier, the geographic scoring kernel in
// lib/scoring.ts, then a Sonnet rationale call. No browser/research work.
// Running it as a Vercel cron gives us deterministic execution, predictable
// per-cycle cost, and a clean separation between the 5 Computer research
// agents and the 5 Vercel cron deterministic agents.
//
// Model routing (v2 swap): the v1 Perplexity-Space spec routed triage through
// `gpt-oss-20b` via Computer's multi-model router. CLAUDE.md prohibits OpenAI
// in this stack, so we use `claude-haiku-4-5` for the cheap classifier and
// keep `claude-sonnet-4-5` for rationale. The dashboard's Multi-Model Routing
// Strip picks both up from `agent_log.model_used` automatically.
//
// Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}` on every cron
// request when the env var is configured in Project Settings. We verify the
// header matches `process.env.CRON_SECRET` and 401 otherwise. For local
// debugging, `?secret=<CRON_SECRET>` query param is also accepted.
//
// Schema isolation: we only read/write `pathfinder.*` tables via the existing
// `supabaseAdmin()` helper (db.schema='pathfinder' is pinned there).

import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { closeAgentRun, openAgentRun } from '@/lib/agent-runs';
import { supabaseAdmin } from '@/lib/supabase';
import { scoreProject } from '@/lib/scoring';
import { inngest } from '@/lib/inngest/client';
import type { Branch, Customer, Project } from '@/lib/types';
import {
  findNearestZedcorBranch,
  type ZedcorBranchPoint,
} from '@/lib/zedcor/geomapper';
import { findMatches as findCrossPollinationMatches } from '@/lib/cross-pollination/engine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// Vercel function timeout. Sonnet calls run 2-5s each; Haiku ~0.5-1s. With a
// 30-row queue and three retry slots we want headroom. 60s is the Hobby/Pro
// free ceiling. The per-iteration budget below (CYCLE_BUDGET_MS) leaves a
// safety margin against this hard ceiling.
export const maxDuration = 60;

// Spec constants — match prompts/computer-ranker.md (now docs/specs/ranker.md).
const HAIKU_MODEL = 'claude-haiku-4-5';
const SONNET_MODEL = 'claude-sonnet-4-5';
const HAIKU_MAX_TOKENS = 16;
const SONNET_MAX_TOKENS = 1_000;
const ANTHROPIC_BACKOFF_MS = [5_000, 15_000, 45_000];
const CYCLE_BUDGET_MS = 50_000; // leave a 10s buffer under maxDuration=60.
const QUEUE_LIMIT = 30;
const RATIONALE_PROMPT_PATH = path.join(process.cwd(), 'prompts', 'claude-ranking-rationale.md');

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail closed in production. In dev, allow through so local hits work
    // without forcing a CRON_SECRET in every shell.
    return process.env.NODE_ENV !== 'production';
  }
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim() === expected;
  }
  // Local debug: ?secret=...
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('secret');
    if (q && q === expected) return true;
  } catch {
    // ignore URL parse errors
  }
  return false;
}

// ---------------------------------------------------------------------------
// Logging helpers — pathfinder.agent_log + pathfinder.agent_runs
// ---------------------------------------------------------------------------

// Event types preserved verbatim from the v1 Perplexity-Space prompt so the
// dashboard's `ModelRoutingStrip` and activity rail keep their current
// grouping. Cycle-start uses `ingest_start` (yes, same string the Ingestor
// uses — the v1 prompt is explicit about it; the dashboard groups by
// agent_name). End-of-cycle summary uses `write_success`.
type EventType =
  | 'ingest_start'
  | 'model_route'
  | 'rationale_generate'
  | 'score_assign'
  | 'write_success'
  | 'error';

interface LogRow {
  agent_name: 'ranker';
  event_type: EventType;
  event_data: Record<string, unknown>;
  latency_ms: number | null;
  model_used: string | null;
  ts?: string;
}

type Admin = ReturnType<typeof supabaseAdmin>;

async function writeLog(
  admin: Admin,
  event_type: EventType,
  event_data: Record<string, unknown>,
  opts: { latency_ms?: number; model_used?: string } = {},
): Promise<void> {
  const row: LogRow = {
    agent_name: 'ranker',
    event_type,
    event_data,
    latency_ms: opts.latency_ms ?? null,
    model_used: opts.model_used ?? null,
  };
  // Loose typing matches the verifier route — generated types lag the
  // ranker columns until the next schema regen.
  await (
    admin.from('agent_log') as unknown as {
      insert: (rows: LogRow) => Promise<{ error: { message: string } | null }>;
    }
  ).insert(row);
}

// ---------------------------------------------------------------------------
// Anthropic client — shared with lib/anthropic.ts. The lazy client + test
// override live there because Next.js App Router restricts which symbols
// route.ts files may export.
// ---------------------------------------------------------------------------

import { anthropic, setAgentContext } from '@/lib/anthropic';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Inner Sonnet system prompt loader (lazy, cached)
// ---------------------------------------------------------------------------

let _innerPromptCache: string | null = null;
async function loadRationaleSystemPrompt(): Promise<string> {
  if (_innerPromptCache) return _innerPromptCache;
  try {
    _innerPromptCache = await fs.readFile(RATIONALE_PROMPT_PATH, 'utf8');
    return _innerPromptCache;
  } catch {
    // Fallback inline prompt if the file isn't shipped (shouldn't happen in
    // production — the prompt file is checked into the repo).
    _innerPromptCache = [
      'You are the Pathfinder Ranker rationale-and-hook step.',
      'Return exactly three short paragraphs (~120 words total) of plain prose explaining',
      'why this project is worth attention, then a blank line and "HOOK:" followed by a',
      'single-sentence outreach opener (<= 200 chars). No markdown, no bullets.',
    ].join(' ');
    return _innerPromptCache;
  }
}

// ---------------------------------------------------------------------------
// Stage 1 — cheap classifier (Haiku 4.5)
// ---------------------------------------------------------------------------

interface ClassifyResult {
  decision: 'yes' | 'no' | null; // null = error path (rate-limited or parse-fail)
  latency_ms: number;
  reason?: 'rate_limited' | 'parse_failed';
}

async function classifyOpportunity(project: Project): Promise<ClassifyResult> {
  const client = anthropic();
  const system = [
    'You are a triage classifier for a multi-branch field-sales security/surveillance firm',
    '(perimeter security, vehicle barriers, surveillance camera arrays, mobile surveillance towers,',
    'vehicle monitoring). Given a public-data project record, decide whether it is a real',
    'construction-adjacent opportunity worth a Sonnet-grade rationale.',
    'Respond with EXACTLY one token: "yes" or "no". No punctuation, no explanation.',
  ].join(' ');

  const user = JSON.stringify({
    title: project.title,
    summary: project.summary,
    raw_payload: project.raw_payload,
    project_stage: project.project_stage,
    project_value: project.project_value,
  });

  for (let attempt = 0; attempt < ANTHROPIC_BACKOFF_MS.length + 1; attempt++) {
    const t0 = Date.now();
    try {
      const res = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: HAIKU_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const latency_ms = Date.now() - t0;
      const text = res.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim()
        .toLowerCase();
      // Be lenient about trailing punctuation/whitespace.
      const cleaned = text.replace(/[^a-z]/g, '');
      if (cleaned.startsWith('yes')) return { decision: 'yes', latency_ms };
      if (cleaned.startsWith('no')) return { decision: 'no', latency_ms };
      return { decision: null, latency_ms, reason: 'parse_failed' };
    } catch (err: unknown) {
      const status = (err as { status?: number; statusCode?: number })?.status
        ?? (err as { status?: number; statusCode?: number })?.statusCode;
      if (status === 429 && attempt < ANTHROPIC_BACKOFF_MS.length) {
        await sleep(ANTHROPIC_BACKOFF_MS[attempt]);
        continue;
      }
      if (status === 429) {
        return { decision: null, latency_ms: Date.now() - t0, reason: 'rate_limited' };
      }
      throw err;
    }
  }
  return { decision: null, latency_ms: 0, reason: 'rate_limited' };
}

// ---------------------------------------------------------------------------
// Stage 3 — Sonnet rationale + outreach hook
// ---------------------------------------------------------------------------

interface RationaleResult {
  rationale: string;
  outreach_hook: string;
  latency_ms: number;
  reason?: 'rate_limited' | 'parse_failed';
}

async function generateRationale(args: {
  project: Project;
  branch: Branch | null;
  warmCustomer: Customer | null;
  distance_miles: number | null;
}): Promise<RationaleResult> {
  const { project, branch, warmCustomer, distance_miles } = args;
  const client = anthropic();
  const system = await loadRationaleSystemPrompt();

  const userPayload = {
    project: {
      id: project.id,
      title: project.title,
      summary: project.summary,
      source: project.source,
      project_value: project.project_value,
      project_stage: project.project_stage,
      posted_date: project.posted_date,
      raw_payload_excerpt: JSON.stringify(project.raw_payload ?? {}).slice(0, 500),
      lat: project.lat,
      lon: project.lon,
    },
    geography: {
      nearest_branch: branch
        ? {
            code: branch.code,
            name: branch.name,
            distance_miles: distance_miles ?? null,
            coverage_radius_miles: branch.coverage_radius_miles,
          }
        : null,
      warm_customer: warmCustomer
        ? {
            name: warmCustomer.name,
            served_by_branch_code: warmCustomer.served_by_branch_id ?? null,
            distance_miles: null,
          }
        : null,
    },
    zedcor_capability_matrix: [
      'perimeter security',
      'vehicle barriers',
      'surveillance camera arrays',
      'mobile surveillance towers',
      'vehicle monitoring',
    ],
  };
  const user = JSON.stringify(userPayload);

  for (let attempt = 0; attempt < ANTHROPIC_BACKOFF_MS.length + 1; attempt++) {
    const t0 = Date.now();
    try {
      const res = await client.messages.create({
        model: SONNET_MODEL,
        max_tokens: SONNET_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const latency_ms = Date.now() - t0;
      const text = res.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim();
      const parsed = parseRationaleAndHook(text);
      if (!parsed.rationale) {
        return { rationale: '', outreach_hook: '', latency_ms, reason: 'parse_failed' };
      }
      return { rationale: parsed.rationale, outreach_hook: parsed.outreach_hook, latency_ms };
    } catch (err: unknown) {
      const status = (err as { status?: number; statusCode?: number })?.status
        ?? (err as { status?: number; statusCode?: number })?.statusCode;
      if (status === 429 && attempt < ANTHROPIC_BACKOFF_MS.length) {
        await sleep(ANTHROPIC_BACKOFF_MS[attempt]);
        continue;
      }
      if (status === 429) {
        return { rationale: '', outreach_hook: '', latency_ms: Date.now() - t0, reason: 'rate_limited' };
      }
      throw err;
    }
  }
  return { rationale: '', outreach_hook: '', latency_ms: 0, reason: 'rate_limited' };
}

/** Split Sonnet output into the prose rationale + the trailing HOOK line.
 * Mirrors the parser in `lib/claude.ts` but inlined so we don't drag the
 * cloud-only `lib/anthropic.ts` import path through this route. */
function parseRationaleAndHook(text: string): { rationale: string; outreach_hook: string } {
  const idx = text.search(/\bHOOK\s*:/i);
  if (idx < 0) {
    return { rationale: stripEmDashes(text.trim()), outreach_hook: '' };
  }
  const head = text.slice(0, idx);
  const tail = text.slice(idx);
  const rationale = stripEmDashes(head.replace(/^\s*RATIONALE\s*:\s*/i, '').trim());
  const outreach_hook = stripEmDashes(tail.replace(/^\s*HOOK\s*:\s*/i, '').trim());
  return { rationale, outreach_hook };
}

/** Permanently strip em-dashes (—, U+2014) and en-dashes (–, U+2013)
 *  from generated copy. Sonnet emits these freely — the prompt forbids
 *  them but we belt-and-suspenders with a post-process so a single
 *  prompt regression doesn't leak dashes into customer-facing rationales
 *  + outreach hooks. The substitution converts ` — ` (typical sentence
 *  break usage) into `. ` (period + space) and bare dashes into single
 *  spaces, then collapses any accidental double punctuation. */
function stripEmDashes(text: string): string {
  return text
    .replace(/\s*—\s*/g, '. ') // em-dash with optional surrounding whitespace
    .replace(/\s*–\s*/g, '. ') // en-dash same
    .replace(/\.\s+\./g, '.') // dedupe ". ."
    .replace(/[ \t]+/g, ' ') // collapse runs of spaces/tabs (preserve newlines)
    .trim();
}

// ---------------------------------------------------------------------------
// Per-project ranker pipeline
// ---------------------------------------------------------------------------

// Z-F integrator — pluck the entity-bearing fields the cross-pollination
// engine wants (project_owner / prime_contractor / key_subs /
// parent_company) from a Project row. The Ingestor doesn't currently
// project these into top-level columns, so we extract them from
// raw_payload using the source-specific shapes seen in production.
function extractCrossPollinationFields(p: Project): {
  project_owner: string | null;
  prime_contractor: string | null;
  key_subs: string[];
  parent_company: string | null;
} {
  const rp = (p.raw_payload ?? {}) as Record<string, unknown>;
  // USAspending: 'Recipient Name' is the awardee = prime contractor;
  // 'Awarding Agency' is the owner / project sponsor.
  const usPrime = typeof rp['Recipient Name'] === 'string' ? (rp['Recipient Name'] as string) : null;
  const usOwner = typeof rp['Awarding Agency'] === 'string' ? (rp['Awarding Agency'] as string) : null;
  // SAM.gov real-world: { agency: 'Metropolitan Water Reclamation District' };
  // SAM.gov v2 nested: { award: { awardee: { name: '...' } } } when populated.
  const sgAgency = typeof rp['agency'] === 'string' ? (rp['agency'] as string) : null;
  let sgAwardee: string | null = null;
  const award = rp['award'];
  if (award && typeof award === 'object') {
    const awardee = (award as { awardee?: unknown }).awardee;
    if (awardee && typeof awardee === 'object') {
      const n = (awardee as { name?: unknown }).name;
      if (typeof n === 'string' && n.trim()) sgAwardee = n;
    }
  }
  return {
    project_owner: usOwner ?? sgAgency ?? null,
    prime_contractor: usPrime ?? sgAwardee ?? null,
    key_subs: [],
    parent_company: null,
  };
}

interface RankerWriteFields {
  score: number;
  rationale: string | null;
  outreach_hook: string | null;
  nearest_branch_id: string | null;
  distance_miles: number | null;
  warm_for_customer_id: string | null;
  ranked_at: string;
  // Z-F integrator: also persist the Zedcor-org-scoped proximity columns
  // alongside the multi-tenant nearest_branch_id. Z-C added these columns
  // but only the backfill script populated them — leaving every freshly
  // ingested project with NULL Zedcor proximity. This couples the writes
  // so the radius map + branch-filtered lead lists work for new leads.
  nearest_zedcor_branch_id: string | null;
  zedcor_distance_miles: number | null;
  // Demo Polish P1 — distance gating + geo_unknown cap. The ranker writes
  // these columns whenever it has the signal; null means "leave alone"
  // (Supabase's `update` honors that). rejection_reason='no_branch_coverage'
  // when zedcor_distance_miles > org_geo_config.max_supported_distance_miles.
  rejection_reason: string | null;
  rejected_at: string | null;
  geo_unknown: boolean | null;
}

// Demo Polish P1 — per-org distance threshold loader. Cached per request
// (the route instance is short-lived under Vercel cron); fall back to the
// SPEC default when org_geo_config isn't readable.
const FALLBACK_MAX_DISTANCE_MILES = 250;

async function loadMaxSupportedDistance(admin: Admin): Promise<number> {
  try {
    const res = await (
      admin.from('org_geo_config') as unknown as {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { max_supported_distance_miles: number | null } | null;
              error: { message: string } | null;
            }>;
          };
        };
      }
    )
      .select('max_supported_distance_miles')
      .eq('org_id', 'zedcor')
      .maybeSingle();
    const v = res.data?.max_supported_distance_miles;
    return typeof v === 'number' && v > 0 ? v : FALLBACK_MAX_DISTANCE_MILES;
  } catch {
    return FALLBACK_MAX_DISTANCE_MILES;
  }
}

// Z-F cross-pollination spec § 4.2 — when at least one warm-intro match
// exists for a lead, add a +10 score boost (cap at 100).
const CROSS_POLL_SCORE_BOOST = 10;

async function persistProject(
  admin: Admin,
  project_id: string,
  fields: RankerWriteFields,
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await (
      admin.from('projects') as unknown as {
        update: (v: RankerWriteFields) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .update(fields)
      .eq('id', project_id);
    if (!res.error) return { ok: true };
    if (attempt === 1) return { ok: false, error: res.error.message };
  }
  return { ok: false, error: 'unknown' };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const t0 = Date.now();

  // 1. Auth
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let admin: Admin;
  try {
    admin = supabaseAdmin();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // 2. Overlap protection + stuck-run handling
  const now = new Date();
  const twentyFiveMinAgo = new Date(now.getTime() - 25 * 60_000).toISOString();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60_000).toISOString();

  type RunRow = { id: number; started_at: string; status: string };
  const runningRunsRes = await (
    admin.from('agent_runs') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ data: RunRow[] | null; error: { message: string } | null }>;
        };
      };
    }
  )
    .select('id, started_at, status')
    .eq('agent_name', 'ranker')
    .eq('status', 'running');

  if (runningRunsRes.error) {
    return NextResponse.json({ error: runningRunsRes.error.message }, { status: 500 });
  }
  const runningRuns = runningRunsRes.data ?? [];

  // Mark any stuck row (>=30min old) as failed; if any non-stuck row exists, abort.
  const stuck = runningRuns.filter((r) => r.started_at <= thirtyMinAgo);
  const live = runningRuns.filter((r) => r.started_at > thirtyMinAgo && r.started_at > twentyFiveMinAgo);

  for (const r of stuck) {
    await (
      admin.from('agent_runs') as unknown as {
        update: (v: { status: string; error_message: string; completed_at: string }) => {
          eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .update({ status: 'failed', error_message: 'cycle_timeout_detected_by_next_run', completed_at: now.toISOString() })
      .eq('id', r.id);
  }

  if (live.length > 0) {
    await writeLog(admin, 'error', { message: 'overlapping cycle detected', reason: 'overlapping_cycle' });
    return NextResponse.json({ skipped: 'overlapping_cycle' });
  }

  // 3. Pull queue: score IS NULL, ordered by ingested_at DESC.
  type ProjectRow = Project;
  const queueRes = await (
    admin.from('projects') as unknown as {
      select: (cols: string) => {
        is: (col: string, val: null) => {
          order: (col: string, opts: { ascending: boolean; nullsFirst: boolean }) => {
            limit: (n: number) => Promise<{ data: ProjectRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .select('*')
    .is('score', null)
    .order('ingested_at', { ascending: false, nullsFirst: false })
    .limit(QUEUE_LIMIT);

  if (queueRes.error) {
    return NextResponse.json({ error: queueRes.error.message }, { status: 500 });
  }
  const queue = queueRes.data ?? [];

  if (queue.length === 0) {
    // Z-D #26 heartbeat — write a pathfinder.agent_runs row so dashboards
    // can distinguish "cron didn't fire" from "cron fired and found
    // nothing to do". Fail-open via lib/agent-runs.ts.
    const heartbeat = await openAgentRun('ranker');
    await closeAgentRun(heartbeat, {
      status: 'empty_queue',
      records_processed: 0,
      records_new: 0,
    });
    return NextResponse.json({ processed: 0, reason: 'empty_queue' });
  }

  // 4. Open agent_runs row + ingest_start log
  type AgentRunInsert = {
    agent_name: 'ranker';
    started_at: string;
    completed_at: string | null;
    records_processed: number;
    records_new: number;
    status: 'running' | 'success' | 'failed';
    error_message: string | null;
  };
  const runRowPayload: AgentRunInsert = {
    agent_name: 'ranker',
    started_at: now.toISOString(),
    completed_at: null,
    records_processed: 0,
    records_new: 0,
    status: 'running',
    error_message: null,
  };
  const runInsertRes = await (
    admin.from('agent_runs') as unknown as {
      insert: (rows: AgentRunInsert) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{ data: { id: number } | null; error: { message: string } | null }>;
        };
      };
    }
  )
    .insert(runRowPayload)
    .select('id')
    .maybeSingle();

  if (runInsertRes.error || !runInsertRes.data) {
    return NextResponse.json({ error: runInsertRes.error?.message ?? 'failed to open agent_runs row' }, { status: 500 });
  }
  const runId = runInsertRes.data.id;

  // Phase 1 G2: tag every Anthropic call this run makes (via the
  // wrapped legacy `anthropic()` factory) with agent_name='ranker' +
  // this run_id, so pathfinder.llm_calls captures full attribution
  // even though the handler hasn't migrated to the explicit gateway
  // entry points (run / runStream).
  setAgentContext({ agentName: 'ranker', agentRunId: runId, surface: 'cron' });

  await writeLog(admin, 'ingest_start', {
    message: `cycle_start · ${queue.length} unranked`,
    queue_depth: queue.length,
  });

  // 5. Load shared lookups
  const [branchesRes, customersRes, zedcorBranchesRes] = await Promise.all([
    (admin.from('branches') as unknown as {
      select: (cols: string) => Promise<{ data: Branch[] | null; error: { message: string } | null }>;
    }).select('*'),
    (admin.from('customers') as unknown as {
      select: (cols: string) => Promise<{ data: Customer[] | null; error: { message: string } | null }>;
    }).select('*'),
    // Z-F: load the Zedcor-org-scoped branches once per cycle so we can
    // compute nearest_zedcor_branch_id alongside the multi-tenant
    // nearest_branch_id. Filter to lat/lon-bearing rows only (the
    // findNearestZedcorBranch helper already guards on this but excluding
    // them here keeps the loop tighter).
    (admin.from('zedcor_branches') as unknown as {
      select: (cols: string) => Promise<{
        data: Array<{
          id: string;
          branch_name: string;
          state: string;
          lat: number | null;
          lon: number | null;
          radius_miles: number | null;
        }> | null;
        error: { message: string } | null;
      }>;
    }).select('id, branch_name, state, lat, lon, radius_miles'),
  ]);

  if (branchesRes.error || customersRes.error) {
    const msg = branchesRes.error?.message ?? customersRes.error?.message ?? 'lookup load failed';
    await markRunFailed(admin, runId, msg);
    await writeLog(admin, 'error', { message: 'lookup load failed', reason: 'supabase_read_failed' });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  const branches = branchesRes.data ?? [];
  const customers = customersRes.data ?? [];
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  // Z-F: zedcor branch points used per project for proximity. Tolerate a
  // missing zedcor_branches table (rare; would mean the Z-A migration
  // hasn't been applied) by treating it as empty rather than failing the
  // whole cycle — the multi-tenant ranker still works without Zedcor.
  const zedcorBranches: ZedcorBranchPoint[] = (zedcorBranchesRes.data ?? [])
    .filter((b): b is typeof b & { lat: number; lon: number } =>
      typeof b.lat === 'number' && typeof b.lon === 'number',
    )
    .map((b) => ({
      id: b.id,
      branch_name: b.branch_name,
      state: b.state,
      lat: b.lat,
      lon: b.lon,
      radius_miles: typeof b.radius_miles === 'number' ? b.radius_miles : 200,
    }));

  // Demo Polish P1 — load distance threshold once per cycle.
  const maxSupportedDistanceMiles = await loadMaxSupportedDistance(admin);

  // 6. Per-project loop
  const cycleStart = Date.now();
  let processed = 0;
  let ranked = 0;
  let filtered = 0;
  // Demo Polish P1 — number of rows the distance gate kicked into
  // rejection_reason='no_branch_coverage' this cycle.
  let noBranchCoverage = 0;

  for (const project of queue) {
    if (Date.now() - cycleStart > CYCLE_BUDGET_MS) {
      await writeLog(admin, 'error', { message: 'cycle_timeout', reason: 'cycle_timeout' });
      await markRunFailed(admin, runId, 'cycle_timeout');
      return NextResponse.json({ error: 'cycle_timeout', processed }, { status: 500 });
    }
    processed++;

    // Stage 1 — cheap classifier (Haiku)
    let classify: ClassifyResult;
    try {
      classify = await classifyOpportunity(project);
    } catch (err) {
      await writeLog(admin, 'error', {
        message: `classifier failed · ${project.id} · ${(err as Error).message}`,
        reason: 'unexpected_error',
        project_id: project.id,
      });
      continue;
    }

    if (classify.decision === null) {
      const reason = classify.reason === 'rate_limited' ? 'anthropic_rate_limited' : 'anthropic_parse_failed';
      await writeLog(admin, 'error', {
        message: reason === 'anthropic_rate_limited' ? 'haiku 429 · backoff exhausted' : 'haiku parse failed',
        reason,
        project_id: project.id,
      });
      // Leave score NULL so a future cycle picks it up.
      continue;
    }

    // Log the model_route for the triage call (always, even on "no").
    await writeLog(
      admin,
      'model_route',
      {
        message: `multi-model route · ${HAIKU_MODEL} for triage · ${classify.latency_ms}ms`,
        stage: 'triage',
        project_id: project.id,
      },
      { model_used: HAIKU_MODEL, latency_ms: classify.latency_ms },
    );

    if (classify.decision === 'no') {
      // Demote: score=0, no rationale, log score_assign, write back, continue.
      const writeFields: RankerWriteFields = {
        score: 0,
        rationale: 'Filtered as non-opportunity by classifier',
        outreach_hook: null,
        nearest_branch_id: null,
        distance_miles: null,
        warm_for_customer_id: null,
        ranked_at: new Date().toISOString(),
        nearest_zedcor_branch_id: null,
        zedcor_distance_miles: null,
        rejection_reason: null,
        rejected_at: null,
        geo_unknown: null,
      };
      const w = await persistProject(admin, project.id, writeFields);
      if (!w.ok) {
        await writeLog(admin, 'error', {
          message: `supabase write failed · ${project.id}`,
          reason: 'supabase_write_failed',
          project_id: project.id,
        });
        await markRunFailed(admin, runId, `supabase_write_failed: ${w.error}`);
        return NextResponse.json({ error: 'supabase_write_failed' }, { status: 500 });
      }
      await writeLog(admin, 'score_assign', {
        message: `${project.id} · score 0 · demoted by classifier`,
        project_id: project.id,
        score: 0,
        nearest_branch_code: null,
        components: { branch_fit: 0, stage_fit: 0, value: 0, adjacency: 0 },
        demoted: true,
      });
      // Phase 2 Stream A Gate A1: emit signal.rejected for downstream
      // observability + tuning subscribers (Pulse, cost-of-rejection
      // dashboards). Fire-and-forget; non-fatal.
      try {
        await inngest.send({
          name: 'pathfinder/signal.rejected',
          data: {
            project_id: project.id,
            score: 0,
            rejected_at: new Date().toISOString(),
            reason: 'classifier_demote',
          },
        });
      } catch (err) {
        await writeLog(admin, 'error', {
          message: `inngest emit failed (non-fatal) · ${project.id} · rejected`,
          reason: 'inngest_emit_failed',
          project_id: project.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      filtered++;
      continue;
    }

    // Stage 2 — geographic scoring (deterministic, free)
    let scoring;
    let nearest_branch_id: string | null = null;
    let distance_miles: number | null = null;
    let warm_for_customer_id: string | null = null;
    let composite_score = 0;
    let nearest_branch_code: string | null = null;
    let stageComponentScores = { branch_fit: 0, stage_fit: 0, value: 0, adjacency: 0 };

    if (project.lat == null || project.lon == null || branches.length === 0) {
      // Null-coordinate exception: cap at 60, no geo signal.
      const stageBoost = (() => {
        const s = (project.project_stage ?? '').trim().toUpperCase();
        if (s === 'RFP') return 90;
        if (s === 'PRE') return 75;
        if (s === 'PLN') return 55;
        if (s === 'NWS') return 35;
        return 50;
      })();
      composite_score = Math.min(60, Math.round(0.3 * stageBoost + 0.2 * 0));
      stageComponentScores = { branch_fit: 0, stage_fit: stageBoost, value: 0, adjacency: 0 };
    } else {
      try {
        scoring = scoreProject({ project, branches, customers });
        nearest_branch_id = scoring.nearest_branch_id;
        distance_miles = scoring.distance_miles;
        warm_for_customer_id = scoring.warm_for_customer_id;
        composite_score = scoring.composite_score;
        nearest_branch_code = branchById.get(scoring.nearest_branch_id)?.code ?? null;
        stageComponentScores = {
          branch_fit: scoring.geo_score,
          stage_fit: scoring.stage_score,
          value: 0,
          adjacency: scoring.customer_score,
        };
      } catch (err) {
        await writeLog(admin, 'error', {
          message: `score recompute failed · ${project.id} · ${(err as Error).message}`,
          reason: 'score_recompute_failed',
          project_id: project.id,
        });
        continue;
      }
    }

    // Stage 3 — Sonnet rationale + outreach hook
    const branch = nearest_branch_id ? branchById.get(nearest_branch_id) ?? null : null;
    const warmCustomer = warm_for_customer_id ? customerById.get(warm_for_customer_id) ?? null : null;

    let rationaleResult: RationaleResult;
    try {
      rationaleResult = await generateRationale({
        project,
        branch,
        warmCustomer,
        distance_miles,
      });
    } catch (err) {
      await writeLog(admin, 'error', {
        message: `sonnet failed · ${project.id} · ${(err as Error).message}`,
        reason: 'unexpected_error',
        project_id: project.id,
      });
      continue;
    }

    if (rationaleResult.reason) {
      const reason = rationaleResult.reason === 'rate_limited' ? 'anthropic_rate_limited' : 'anthropic_parse_failed';
      await writeLog(admin, 'error', {
        message: reason === 'anthropic_rate_limited' ? 'sonnet 429 · backoff exhausted' : 'sonnet parse failed',
        reason,
        project_id: project.id,
      });
      // Leave score NULL on Sonnet failure (per spec — re-rank on next cycle).
      continue;
    }

    await writeLog(
      admin,
      'rationale_generate',
      {
        message: `rationale generated · ${project.id} · ${rationaleResult.outreach_hook ? 'with hook' : 'no hook'}`,
        project_id: project.id,
        paragraph_count: rationaleResult.rationale.split(/\n\n+/).length,
        hook_length: rationaleResult.outreach_hook.length,
      },
      { model_used: SONNET_MODEL, latency_ms: rationaleResult.latency_ms },
    );

    // Z-F integrator — Zedcor branch proximity. When the project has
    // valid coords + we have at least one zedcor branch, compute the
    // nearest branch and persist it alongside nearest_branch_id. This
    // is what the Tuesday demo's branch radius map and the
    // /pathfinder/zedcor/leads list both read from.
    let nearest_zedcor_branch_id: string | null = null;
    let zedcor_distance_miles: number | null = null;
    if (
      project.lat != null &&
      project.lon != null &&
      zedcorBranches.length > 0
    ) {
      const z = findNearestZedcorBranch(
        { lat: project.lat, lon: project.lon },
        zedcorBranches,
      );
      if (z) {
        nearest_zedcor_branch_id = z.branch_id;
        zedcor_distance_miles = z.distance_miles;
      }
    }

    // Z-F integrator — cross-pollination. The Z-B engine takes the lead's
    // entity-bearing fields (project_owner / prime_contractor / key_subs /
    // parent_company) and writes match rows to lead_cross_pollination.
    // Spec § 4.2: when at least one match exists, add CROSS_POLL_SCORE_BOOST
    // to the base score (cap at 100). Best-effort — failure must not bubble
    // back into the ranker write so a transient cross-poll error doesn't
    // wipe a lead's score.
    let crossPollMatchCount = 0;
    try {
      const fields = extractCrossPollinationFields(project);
      if (
        fields.project_owner ||
        fields.prime_contractor ||
        (fields.key_subs && fields.key_subs.length > 0) ||
        fields.parent_company
      ) {
        const matches = await findCrossPollinationMatches({
          leadId: project.id,
          fields,
          // The cross-pollination engine declares the supabase argument as
          // SupabaseClient<PathfinderDatabase, 'pathfinder'> while the
          // ranker's existing handler treats `admin` more loosely. The
          // runtime client is identical (admin.schema = 'pathfinder') so
          // this cast is shape-equivalent.
          supabase: admin as unknown as Parameters<typeof findCrossPollinationMatches>[0]['supabase'],
          writeMatches: true,
        });
        crossPollMatchCount = matches.length;
      }
    } catch (err) {
      await writeLog(admin, 'error', {
        message: `cross-pollination failed (non-fatal) · ${project.id} · ${(err as Error).message}`,
        reason: 'cross_pollination_failed',
        project_id: project.id,
      });
    }

    let boostedScore =
      crossPollMatchCount > 0
        ? Math.min(100, composite_score + CROSS_POLL_SCORE_BOOST)
        : composite_score;

    // Demo Polish P1 — geo_unknown cap (Layer B). When the project has no
    // coordinates after ingest + state-centroid fallback, cap the score at
    // 50 so it never appears in default top-10 views.
    const isGeoUnknown = project.lat == null || project.lon == null;
    if (isGeoUnknown) {
      boostedScore = Math.min(50, boostedScore);
    }

    // Demo Polish P1 — distance gating (Layer C). When we resolved a
    // Zedcor branch and the distance exceeds the org threshold, write
    // rejection_reason='no_branch_coverage'. We still persist the score
    // so the rejected pile can show "what we considered and dropped".
    let rejectionReason: string | null = null;
    let rejectedAt: string | null = null;
    if (
      zedcor_distance_miles != null &&
      zedcor_distance_miles > maxSupportedDistanceMiles
    ) {
      rejectionReason = 'no_branch_coverage';
      rejectedAt = new Date().toISOString();
      noBranchCoverage += 1;
    }

    // Stage 4 — write back
    const writeFields: RankerWriteFields = {
      score: boostedScore,
      rationale: rationaleResult.rationale,
      outreach_hook: rationaleResult.outreach_hook || null,
      nearest_branch_id,
      distance_miles,
      warm_for_customer_id,
      ranked_at: new Date().toISOString(),
      nearest_zedcor_branch_id,
      zedcor_distance_miles,
      rejection_reason: rejectionReason,
      rejected_at: rejectedAt,
      geo_unknown: isGeoUnknown,
    };
    const w = await persistProject(admin, project.id, writeFields);
    if (!w.ok) {
      await writeLog(admin, 'error', {
        message: `supabase write failed · ${project.id}`,
        reason: 'supabase_write_failed',
        project_id: project.id,
      });
      await markRunFailed(admin, runId, `supabase_write_failed: ${w.error}`);
      return NextResponse.json({ error: 'supabase_write_failed' }, { status: 500 });
    }

    await writeLog(admin, 'score_assign', {
      message: `${project.id} · score ${boostedScore}${nearest_branch_code ? ` · branch ${nearest_branch_code}` : ''}${crossPollMatchCount > 0 ? ` · ${crossPollMatchCount} warm-intro` : ''}`,
      project_id: project.id,
      score: boostedScore,
      base_score: composite_score,
      cross_poll_match_count: crossPollMatchCount,
      cross_poll_boost: crossPollMatchCount > 0 ? CROSS_POLL_SCORE_BOOST : 0,
      nearest_branch_code,
      nearest_zedcor_branch_id,
      zedcor_distance_miles,
      components: stageComponentScores,
      demoted: false,
    });
    // Phase 2 Stream A Gate A1: emit signal.qualified for downstream
    // research-tier subscribers (Verifier already cron-canonical, future
    // A2 Enricher / AdjacencyMapper / CompetitiveIntel). Cron remains
    // canonical for Verifier in G1+A1; this event lets new Inngest
    // functions land without rewiring the cron chain. Fire-and-forget.
    try {
      await inngest.send({
        name: 'pathfinder/signal.qualified',
        data: {
          project_id: project.id,
          score: boostedScore,
          qualified_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      await writeLog(admin, 'error', {
        message: `inngest emit failed (non-fatal) · ${project.id} · qualified`,
        reason: 'inngest_emit_failed',
        project_id: project.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    ranked++;
  }

  // 7. Cycle close
  await writeLog(admin, 'write_success', {
    message: `write · ${ranked} ranked · ${filtered} demoted · ${noBranchCoverage} out-of-coverage`,
    ranked,
    demoted: filtered,
    no_branch_coverage: noBranchCoverage,
  });

  const completed_at = new Date().toISOString();
  await (
    admin.from('agent_runs') as unknown as {
      update: (v: { status: string; records_processed: number; records_new: number; completed_at: string }) => {
        eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .update({
      status: 'success',
      records_processed: processed,
      records_new: ranked,
      completed_at,
    })
    .eq('id', runId);

  return NextResponse.json({
    ok: true,
    processed,
    ranked,
    filtered,
    no_branch_coverage: noBranchCoverage,
    latency_ms: Date.now() - t0,
  });
}

async function markRunFailed(admin: Admin, runId: number, error_message: string): Promise<void> {
  await (
    admin.from('agent_runs') as unknown as {
      update: (v: { status: string; error_message: string; completed_at: string }) => {
        eq: (col: string, val: number) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .update({ status: 'failed', error_message, completed_at: new Date().toISOString() })
    .eq('id', runId);
}
