// GET /api/cron/verifier — Vercel-cron driven Pathfinder Verifier.
//
// Runtime: Vercel cron at `0,30 * * * *` (twice per hour, set in vercel.json).
// Behavioral spec: docs/specs/verifier.md (the v2 spec, copied verbatim from the
// retired Perplexity Space prompt). Implementation must match that spec exactly.
//
// Why a Next.js route and not a Computer agent: the four checks are deterministic
// plumbing — anchor-extraction regex, score recompute via lib/scoring.ts, branch
// nearest-neighbor, and customer-name normalization. Only Check 1 (rationale
// accuracy) needs an LLM, and only because we want a bilingual yes/no over a
// schema. Running it as a Vercel cron gives us deterministic execution,
// predictable cost (one Sonnet call per project), and a cleaner contest
// narrative ("Computer is the engine for the 6 research-and-reasoning agents;
// Vercel cron is the supporting plumbing for the 4 deterministic ones").
//
// Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}` on every cron
// request when the env var is configured in Project Settings. We verify the
// header matches `process.env.CRON_SECRET` and 401 otherwise. For local
// debugging, `?secret=<CRON_SECRET>` query param is also accepted.
//
// Schema isolation: we only read/write `pathfinder.*` tables via the existing
// `supabaseAdmin()` helper (db.schema='pathfinder' is pinned there). The MCP
// scope-violation error path from the v2 spec doesn't apply here — there's no
// MCP layer — but the schema discipline holds.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { nearestBranch, scoreProject, SCORE_TOLERANCE as SCORE_TOLERANCE_FALLBACK } from '@/lib/scoring';
import { fetchActiveScoringConfig } from '@/lib/scoring-config-server';
import { inngest } from '@/lib/inngest/client';
import { checkOwnerAnchors, SAFE_RATIONALE_PLACEHOLDER } from '@/lib/verifier-owner-check';
import type { Branch, Customer, Project } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// Vercel function timeout. Sonnet calls can run 2-5s each; with a 30-row
// queue and three retry slots we want headroom. 60s is the Hobby/Pro free
// ceiling; if a future tier allows more, raise this.
export const maxDuration = 60;

// Spec constant — match prompt v2 verbatim.
const VERIFIER_MODEL = 'claude-sonnet-4-5';
const SONNET_MAX_TOKENS = 2_000;
const SONNET_BACKOFF_MS = [5_000, 15_000, 45_000];
const CYCLE_TIMEOUT_MS = 15 * 60 * 1_000; // 15 minutes
const QUEUE_LIMIT = 30;

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

type EventType =
  | 'verify_start'
  | 'check_rationale'
  | 'check_branch'
  | 'check_score'
  | 'check_customer_refs'
  | 'check_owner'
  | 'rationale_rewritten'
  | 'verify_pass'
  | 'verify_fail'
  | 'escalate'
  | 'write_success'
  | 'error';

interface LogRow {
  agent_name: 'verifier';
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
    agent_name: 'verifier',
    event_type,
    event_data,
    latency_ms: opts.latency_ms ?? null,
    model_used: opts.model_used ?? null,
  };
  // The .insert() return shape is loosely typed in this codebase to dodge the
  // generated-types lag (verifier columns post-date the type regen). Mirror
  // the pattern from app/api/refresh/route.ts.
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

import { anthropic as anthropicClient, setAgentContext } from '@/lib/anthropic';

// ---------------------------------------------------------------------------
// Anchor extraction (Check 1, deterministic step)
// ---------------------------------------------------------------------------

type AnchorType = 'dollar' | 'location' | 'stage' | 'operational' | 'customer' | 'other';

interface Anchor {
  text: string;
  type: AnchorType;
  load_bearing: boolean;
}

const STAGE_TERMS = ['HOT', 'WARM', 'COLD', 'RFP', 'PRE', 'PLN', 'NWS', 'pre-construction', 'planning', 'pipeline'];
const US_STATE_NAMES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming',
];
const CUSTOMER_SUFFIX_RE = /\b(Inc|LLC|L\.L\.C\.|Corp|Corporation|Co|Company|Builders|Group|Partners|Holdings|Industries|Construction)\b\.?/;

/** Extract candidate fact anchors from a rationale string. Heuristic only —
 * Sonnet does the actual confirm/flag classification afterward. */
function extractAnchors(rationale: string): Anchor[] {
  if (!rationale) return [];
  const seen = new Set<string>();
  const out: Anchor[] = [];

  const push = (text: string, type: AnchorType, load_bearing: boolean) => {
    const t = text.trim();
    if (!t || t.length < 2) return;
    const key = `${type}:${t.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ text: t, type, load_bearing });
  };

  // Dollar figures: $48M, $500k, $4.2M, $1,200,000, etc.
  const dollarRe = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:[KMB]|million|billion|thousand)?/gi;
  for (const m of rationale.matchAll(dollarRe)) push(m[0], 'dollar', true);

  // Stage / status terms.
  for (const term of STAGE_TERMS) {
    const re = new RegExp(`\\b${term}\\b`, 'i');
    const m = rationale.match(re);
    if (m) push(m[0], 'stage', true);
  }

  // Geographic — US states, "near <branch>", common metros.
  for (const state of US_STATE_NAMES) {
    if (new RegExp(`\\b${state}\\b`).test(rationale)) push(state, 'location', true);
  }
  const nearRe = /\bnear\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)/g;
  for (const m of rationale.matchAll(nearRe)) push(m[0], 'location', true);
  const cityStateRe = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?),\s*([A-Z]{2})\b/g;
  for (const m of rationale.matchAll(cityStateRe)) push(m[0], 'location', true);

  // Operational claims with negation or specifics — "no cameras", "unlit after 10pm".
  const opRe = /\b(no\s+\w+(?:\s+\w+){0,3}|un[a-z]+\s+after\s+\d+\s?(?:am|pm)|after\s+\d+\s?(?:am|pm))\b/gi;
  for (const m of rationale.matchAll(opRe)) push(m[0], 'operational', true);

  // Capitalized entity-name spans with corp suffix → likely customer.
  const customerRe = new RegExp(
    `\\b((?:[A-Z][a-zA-Z&'\\-]+(?:\\s+[A-Z][a-zA-Z&'\\-]+){0,3})\\s+${CUSTOMER_SUFFIX_RE.source})`,
    'g',
  );
  for (const m of rationale.matchAll(customerRe)) push(m[0], 'customer', true);

  // Plain capitalized two-word entity spans (catches names without suffixes,
  // e.g. "Acme Builders" if Builders happens to not be in the suffix list).
  // Marked load_bearing=false because they often catch incidental phrases.
  const capSpanRe = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3})\b/g;
  for (const m of rationale.matchAll(capSpanRe)) {
    // Skip if it's already in another category by exact text.
    if (![...seen].some((s) => s.endsWith(`:${m[1].toLowerCase()}`))) {
      push(m[1], 'other', false);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Customer reference extraction (Check 4)
// ---------------------------------------------------------------------------

const CUSTOMER_NAME_NORMALIZE_RE = /[^a-z0-9]+/g;
const CUSTOMER_SUFFIXES_RE = /\b(inc|llc|l\.l\.c\.|corp|corporation|co|company|builders|group|partners|holdings|industries|construction)\b\.?/gi;

function normalizeCustomerName(s: string): string {
  return s
    .toLowerCase()
    .replace(CUSTOMER_SUFFIXES_RE, ' ')
    .replace(CUSTOMER_NAME_NORMALIZE_RE, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Returns { referenced: distinct candidate names, resolved: subset that
 * matches a customer in the table, after suffix-normalization }. Branch
 * names + Zedcor entities are excluded so a mention of "PHX" or "Zedcor"
 * doesn't get flagged as an unknown customer. */
function extractCustomerRefs(args: {
  rationale: string;
  outreachHook: string;
  customers: Pick<Customer, 'name'>[];
  branchNames: string[];
}): { referenced: string[]; resolved: string[] } {
  const { rationale, outreachHook, customers, branchNames } = args;
  const text = `${rationale ?? ''}\n${outreachHook ?? ''}`;
  if (!text.trim()) return { referenced: [], resolved: [] };

  const customerLookup = new Set(customers.map((c) => normalizeCustomerName(c.name)));
  const exclusions = new Set<string>([
    ...branchNames.map((b) => normalizeCustomerName(b)),
    'zedcor',
  ]);

  const candidates = new Set<string>();

  // Pattern 1: capitalized span ending with corp suffix.
  const customerRe = new RegExp(
    `\\b((?:[A-Z][a-zA-Z&'\\-]+(?:\\s+[A-Z][a-zA-Z&'\\-]+){0,3})\\s+${CUSTOMER_SUFFIX_RE.source})`,
    'g',
  );
  for (const m of text.matchAll(customerRe)) {
    const norm = normalizeCustomerName(m[1]);
    if (norm && !exclusions.has(norm)) candidates.add(norm);
  }

  // Pattern 2: plain multi-word capitalized spans (catches "Acme Builders"
  // even when the suffix capture above doesn't include "Builders" with the
  // suffix metadata). Skip 1-word — too noisy.
  const capRe = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3})\b/g;
  for (const m of text.matchAll(capRe)) {
    const norm = normalizeCustomerName(m[1]);
    if (!norm) continue;
    if (exclusions.has(norm)) continue;
    // Prefer customer matches; only add as candidate if (a) it ends with a
    // suffix (already caught) OR (b) the customer table contains it. Avoids
    // flagging incidental phrases like "Federal Highway" as missing customers.
    if (customerLookup.has(norm)) {
      candidates.add(norm);
    }
  }

  const referenced = [...candidates];
  const resolved = referenced.filter((n) => customerLookup.has(n));
  return { referenced, resolved };
}

// ---------------------------------------------------------------------------
// Sonnet call (Check 1)
// ---------------------------------------------------------------------------

interface SonnetAnchorResponse {
  anchors: { text: string; classification: 'confirmed' | 'flagged' | 'unclear'; load_bearing: boolean }[];
}

async function classifyAnchorsWithSonnet(args: {
  project: Project;
  branches: Branch[];
  customers: Customer[];
  anchors: Anchor[];
}): Promise<{ result: SonnetAnchorResponse | null; latency_ms: number; reason?: 'parse_failed' | 'rate_limited' }> {
  const client = anthropicClient();

  const system = [
    'You are the Pathfinder Verifier rationale-accuracy step.',
    'Given a freshly ranked project rationale, the project raw_payload, and the relevant',
    'branches/customers, classify each candidate fact anchor as:',
    '  - confirmed: the anchor is directly supported by raw_payload, branches, or customers.',
    '  - flagged: the anchor is contradicted by, or absent from, those evidence sources.',
    '  - unclear: insufficient evidence either way.',
    'Respond with ONLY a JSON object, no prose: {"anchors":[{"text":"...","classification":"confirmed|flagged|unclear","load_bearing":true|false}]}.',
    'Preserve each anchor.text and load_bearing exactly. Do not invent new anchors.',
  ].join(' ');

  const user = JSON.stringify({
    project: {
      id: args.project.id,
      title: args.project.title,
      summary: args.project.summary,
      project_value: args.project.project_value,
      project_stage: args.project.project_stage,
      lat: args.project.lat,
      lon: args.project.lon,
      raw_payload: args.project.raw_payload,
      rationale: args.project.rationale,
    },
    branches: args.branches.map((b) => ({ id: b.id, name: b.name, code: b.code, region: b.region })),
    customers: args.customers.map((c) => ({ id: c.id, name: c.name })),
    anchors: args.anchors.map((a) => ({ text: a.text, type: a.type, load_bearing: a.load_bearing })),
  });

  for (let attempt = 0; attempt < SONNET_BACKOFF_MS.length + 1; attempt++) {
    const t0 = Date.now();
    try {
      const res = await client.messages.create({
        model: VERIFIER_MODEL,
        max_tokens: SONNET_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const latency_ms = Date.now() - t0;
      const text = res.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim();

      // Be lenient: sometimes models fence their JSON. Strip ``` fences if present.
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();

      let parsed: SonnetAnchorResponse;
      try {
        parsed = JSON.parse(cleaned) as SonnetAnchorResponse;
      } catch {
        return { result: null, latency_ms, reason: 'parse_failed' };
      }
      if (!parsed || !Array.isArray(parsed.anchors)) {
        return { result: null, latency_ms, reason: 'parse_failed' };
      }
      return { result: parsed, latency_ms };
    } catch (err: unknown) {
      const status = (err as { status?: number; statusCode?: number })?.status
        ?? (err as { status?: number; statusCode?: number })?.statusCode;
      if (status === 429 && attempt < SONNET_BACKOFF_MS.length) {
        await sleep(SONNET_BACKOFF_MS[attempt]);
        continue;
      }
      if (status === 429) {
        return { result: null, latency_ms: Date.now() - t0, reason: 'rate_limited' };
      }
      // Non-429 — bubble up to the project loop, which logs an error and moves on.
      throw err;
    }
  }
  return { result: null, latency_ms: 0, reason: 'rate_limited' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Branch lookup (Check 2)
// ---------------------------------------------------------------------------

/** Try to recompute the nearest branch for a project. Returns null when the
 * project has no usable coordinates (matches the "null-coordinate" definition
 * in the v2 spec — lat or lon NULL, OR computeNearestBranchId can't resolve). */
function recomputeNearestBranchId(project: Project, branches: Branch[]): string | null {
  if (project.lat == null || project.lon == null) return null;
  if (branches.length === 0) return null;
  try {
    const match = nearestBranch({ lat: project.lat, lon: project.lon }, branches);
    return match.branch_id;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Project verdict
// ---------------------------------------------------------------------------

interface ProjectVerdict {
  project_id: string;
  verified: boolean | null;
  verifier_pass_count: number;
  verifier_notes: string | null;
  failures: string[];
  null_coordinate: boolean;
  primary_failure: string | null;
  /** Z-D #8 — when the owner / GC anchor check fails AND the verifier has
   * already iterated once, the rationale is rewritten to a safe placeholder
   * before persistence. Captured here so persistVerdict can update the
   * `rationale` column alongside the standard verdict fields, and the cron
   * top-level loop can emit a `rationale_rewritten` log line. */
  rewritten_rationale: string | null;
}

interface CycleStats {
  processed: number;
  verified_true: number;
  verified_false: number;
  escalated: number;
  failed: number;
}

/** Run all four checks for one project and write the per-check log lines.
 * Returns the verdict that should be persisted at end-of-cycle. */
async function verifyOneProject(args: {
  admin: Admin;
  project: Project;
  branches: Branch[];
  customers: Customer[];
  /** Cycle-local tolerance read from ranking_config at the start of the
   *  GET handler. Passed in so a /settings edit takes effect on the very
   *  next cycle without a redeploy. */
  scoreTolerance: number;
}): Promise<ProjectVerdict> {
  const { admin, project, branches, customers, scoreTolerance } = args;
  const failures: string[] = [];
  const project_id = project.id;

  const recomputed_branch = recomputeNearestBranchId(project, branches);
  const null_coordinate = recomputed_branch === null;

  // ---- Check 1: rationale accuracy (Sonnet) ----
  const anchors = extractAnchors(project.rationale ?? '');

  if (anchors.length === 0) {
    // No anchors → trivially passes. Still log so the activity rail shows it.
    await writeLog(
      admin,
      'check_rationale',
      {
        message: `rationale check · ${project_id} · 0 evidence anchors · trivial pass`,
        project_id,
        anchors_confirmed: 0,
        anchors_flagged: 0,
      },
      { model_used: 'claude-sonnet', latency_ms: 0 },
    );
  } else {
    const sonnet = await classifyAnchorsWithSonnet({ project, branches, customers, anchors });
    if (sonnet.result === null) {
      // Don't write check_rationale (no reliable anchor counts). Log the error.
      const reason =
        sonnet.reason === 'rate_limited' ? 'sonnet_rate_limited' : 'sonnet_parse_failed';
      await writeLog(admin, 'error', {
        message: reason === 'sonnet_rate_limited' ? 'sonnet 429 · backoff exhausted' : 'sonnet parse failed',
        reason,
        project_id,
      });
      // Leave verified NULL. Move on without changing pass_count.
      return {
        project_id,
        verified: null,
        verifier_pass_count: project.verifier_pass_count ?? 0,
        verifier_notes: project.verifier_notes ?? null,
        failures: [],
        null_coordinate,
        primary_failure: reason,
        rewritten_rationale: null,
      };
    }
    const anchorsByText = new Map(sonnet.result.anchors.map((a) => [a.text, a]));
    let confirmed = 0;
    let flagged = 0;
    let unclearLoadBearing = false;
    for (const a of anchors) {
      const r = anchorsByText.get(a.text);
      if (!r) continue;
      if (r.classification === 'confirmed') confirmed++;
      else if (r.classification === 'flagged') {
        flagged++;
        if (a.load_bearing) failures.push(`rationale anchor flagged: "${a.text}"`);
      } else if (r.classification === 'unclear' && a.load_bearing) {
        unclearLoadBearing = true;
        failures.push(`rationale anchor unclear: "${a.text}"`);
      }
    }
    const message =
      flagged === 0 && !unclearLoadBearing
        ? `rationale check · ${project_id} · ${confirmed} evidence anchors confirmed`
        : `rationale check · ${project_id} · ${confirmed} confirmed · ${flagged} flagged`;
    await writeLog(
      admin,
      'check_rationale',
      { message, project_id, anchors_confirmed: confirmed, anchors_flagged: flagged },
      { model_used: 'claude-sonnet', latency_ms: sonnet.latency_ms },
    );
  }

  // ---- Check 2: branch attribution ----
  if (!null_coordinate) {
    const ranker_branch = project.nearest_branch_id ?? null;
    const ok = ranker_branch === recomputed_branch;
    const verdict = ok ? 'ok' : 'mismatch';
    await writeLog(admin, 'check_branch', {
      message: `branch attribution · ${project_id} · ranker=${ranker_branch ?? 'null'} recompute=${recomputed_branch} · ${verdict}`,
      project_id,
      ranker_branch,
      recomputed_branch,
    });
    if (!ok) {
      failures.push(`branch attribution mismatch — ranker=${ranker_branch ?? 'null'} recompute=${recomputed_branch}`);
    }
  }

  // ---- Check 3: score sensibility ----
  if (!null_coordinate) {
    try {
      const recomputed = scoreProject({
        project: {
          lat: project.lat,
          lon: project.lon,
          project_value: project.project_value,
          project_stage: project.project_stage,
        },
        branches,
        customers,
      });
      const ranker_score = project.score ?? 0;
      const recomputed_score = recomputed.composite_score;
      const delta = ranker_score - recomputed_score;
      const within = Math.abs(delta) <= scoreTolerance;
      const verdict = within ? 'within tolerance' : 'out of tolerance';
      await writeLog(admin, 'check_score', {
        message: `score sensibility · ${project_id} · ranker=${ranker_score} recompute=${recomputed_score} · ${verdict}`,
        project_id,
        ranker_score,
        recomputed_score,
        delta,
      });
      if (!within) {
        failures.push(`score drift ranker=${ranker_score} recompute=${recomputed_score}`);
      }
    } catch (err) {
      // scoreProject throws on missing coverage_radius — log + treat as fail.
      failures.push(`score recompute failed: ${(err as Error).message}`);
    }
  }

  // ---- Check 4: customer references ----
  const branchNames = branches.flatMap((b) => [b.name, b.code]).filter(Boolean);
  const refs = extractCustomerRefs({
    rationale: project.rationale ?? '',
    outreachHook: project.outreach_hook ?? '',
    customers,
    branchNames,
  });
  const names_referenced = refs.referenced.length;
  const names_resolved = refs.resolved.length;
  const refsMessage =
    names_referenced === 0
      ? `customer refs · ${project_id} · 0 named · none to resolve`
      : names_resolved === names_referenced
        ? `customer refs · ${project_id} · ${names_referenced} named · all resolved`
        : `customer refs · ${project_id} · ${names_referenced} named · ${names_resolved} resolved`;
  await writeLog(admin, 'check_customer_refs', {
    message: refsMessage,
    project_id,
    names_referenced,
    names_resolved,
  });
  if (names_referenced > 0 && names_resolved !== names_referenced) {
    const missing = refs.referenced.filter((n) => !refs.resolved.includes(n));
    failures.push(`customer '${missing[0]}' not in customer table`);
  }

  // ---- Check 5 (Z-D #8): owner / GC anchor grounding ----
  // Deterministic — no LLM. Walks owner-shaped cue phrases in the rationale
  // and asserts each mention resolves to a value present in raw_payload's
  // owner / awardee / awarding-agency fields. When the verifier has already
  // iterated once on this project (verifier_pass_count >= 1) and an owner
  // mention still flags, we rewrite the rationale to a safe placeholder
  // rather than ship an unfounded narrative. This is the explicit
  // requirement in TUESDAY DEMO PLAN.md item 6.
  const passCountBefore = project.verifier_pass_count ?? 0;
  const ownerCheck = checkOwnerAnchors(project.rationale ?? '', project.raw_payload);
  let rewritten_rationale: string | null = null;

  if (ownerCheck.mentioned.length > 0) {
    const ownerMessage =
      ownerCheck.flagged.length === 0
        ? `owner check · ${project_id} · ${ownerCheck.mentioned.length} mentions · all resolved`
        : `owner check · ${project_id} · ${ownerCheck.mentioned.length} mentions · ${ownerCheck.flagged.length} flagged`;
    await writeLog(admin, 'check_owner', {
      message: ownerMessage,
      project_id,
      mentioned: ownerCheck.mentioned,
      flagged: ownerCheck.flagged,
      pass_count_before: passCountBefore,
    });
    if (ownerCheck.flagged.length > 0) {
      // First-pass: surface as a failure so the standard verifier loop gives
      // upstream (Ranker / Perplexity research) one shot to enrich. After
      // the loop has already iterated once, downgrade to a rationale rewrite
      // so we don't churn forever and don't ship an unfounded narrative.
      if (passCountBefore >= 1) {
        rewritten_rationale = SAFE_RATIONALE_PLACEHOLDER;
        await writeLog(admin, 'rationale_rewritten', {
          message: `rationale rewritten · ${project_id} · owner anchor unresolved after retry`,
          project_id,
          flagged: ownerCheck.flagged,
          pass_count_before: passCountBefore,
          replacement: SAFE_RATIONALE_PLACEHOLDER,
        });
      } else {
        failures.push(`owner anchor unresolved: "${ownerCheck.flagged[0]}"`);
      }
    }
  }

  // ---- Verdict ----
  const passCountAfter = passCountBefore + 1;

  if (failures.length === 0) {
    const notes = null_coordinate
      ? 'verified on 2 of 4 — null-coordinate project, geographic checks skipped'
      : 'passed all 4 checks';
    return {
      project_id,
      verified: true,
      verifier_pass_count: passCountAfter,
      verifier_notes: notes,
      failures: [],
      null_coordinate,
      primary_failure: null,
      rewritten_rationale,
    };
  }
  // Failure path.
  const notes = failures.join('; ').slice(0, 600);
  return {
    project_id,
    verified: false,
    verifier_pass_count: passCountAfter,
    verifier_notes: notes,
    failures,
    null_coordinate,
    primary_failure: failures[0] ?? null,
    rewritten_rationale,
  };
}

// ---------------------------------------------------------------------------
// Persist verdicts (one UPDATE per project, retry once on failure)
// ---------------------------------------------------------------------------

async function persistVerdict(admin: Admin, v: ProjectVerdict): Promise<{ ok: boolean; error?: string }> {
  // Z-D #8: when the owner-anchor check rewrote the rationale, persist
  // the new rationale string alongside the standard verdict columns so
  // ProjectList / ProjectModal / outreach drafts see the safe placeholder
  // instead of the unfounded original.
  const update: {
    verified: boolean | null;
    verifier_notes: string | null;
    verifier_pass_count: number;
    rationale?: string;
  } = {
    verified: v.verified,
    verifier_notes: v.verifier_notes,
    verifier_pass_count: v.verifier_pass_count,
  };
  if (v.rewritten_rationale) {
    update.rationale = v.rewritten_rationale;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await (
      admin.from('projects') as unknown as {
        update: (v: typeof update) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
      }
    )
      .update(update)
      .eq('id', v.project_id);
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
  const fiveAndTwentyMinAgo = new Date(now.getTime() - 25 * 60_000).toISOString();
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
    .eq('agent_name', 'verifier')
    .eq('status', 'running');

  if (runningRunsRes.error) {
    return NextResponse.json({ error: runningRunsRes.error.message }, { status: 500 });
  }
  const runningRuns = runningRunsRes.data ?? [];

  // Mark any stuck row (>=30min old) as failed; if any non-stuck row exists, abort.
  const stuck = runningRuns.filter((r) => r.started_at <= thirtyMinAgo);
  const live = runningRuns.filter((r) => r.started_at > thirtyMinAgo && r.started_at > fiveAndTwentyMinAgo);

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

  // 3. Pull queue
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
    .is('verified', null)
    .order('ranked_at', { ascending: false, nullsFirst: false })
    .limit(QUEUE_LIMIT);

  if (queueRes.error) {
    return NextResponse.json({ error: queueRes.error.message }, { status: 500 });
  }
  const queue = queueRes.data ?? [];

  if (queue.length === 0) {
    return NextResponse.json({ processed: 0, reason: 'empty_queue' });
  }

  // 4. Open agent_runs row + verify_start log
  type AgentRunInsert = {
    agent_name: 'verifier';
    started_at: string;
    completed_at: string | null;
    records_processed: number;
    records_new: number;
    status: 'running' | 'success' | 'failed';
    error_message: string | null;
  };
  const runRowPayload: AgentRunInsert = {
    agent_name: 'verifier',
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

  // Phase 1 G2: tag every Anthropic call this run makes (via the wrapped
  // legacy `anthropicClient()` factory) with agent_name='verifier' +
  // this run_id, so pathfinder.llm_calls captures full attribution.
  setAgentContext({ agentName: 'verifier', agentRunId: runId, surface: 'cron' });

  await writeLog(admin, 'verify_start', {
    message: `verification cycle · ${queue.length} ranked projects pending`,
    queue_depth: queue.length,
  });

  // 5. Load shared lookups
  const [branchesRes, customersRes] = await Promise.all([
    (admin.from('branches') as unknown as {
      select: (cols: string) => Promise<{ data: Branch[] | null; error: { message: string } | null }>;
    }).select('*'),
    (admin.from('customers') as unknown as {
      select: (cols: string) => Promise<{ data: Customer[] | null; error: { message: string } | null }>;
    }).select('*'),
  ]);

  if (branchesRes.error || customersRes.error) {
    const msg = branchesRes.error?.message ?? customersRes.error?.message ?? 'lookup load failed';
    await markRunFailed(admin, runId, msg);
    await writeLog(admin, 'error', { message: 'lookup load failed', reason: 'supabase_read_failed' });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  const branches = branchesRes.data ?? [];
  const customers = customersRes.data ?? [];

  // Active scoring config — read once at cycle start so the Verifier
  // honours edits made via /settings without a redeploy. Falls back to
  // the lib/scoring.ts compile-time constant if the DB is empty / errors.
  const scoringConfig = await fetchActiveScoringConfig();
  const SCORE_TOLERANCE = scoringConfig.score_tolerance ?? SCORE_TOLERANCE_FALLBACK;

  // 6. Per-project loop
  const cycleStart = Date.now();
  const stats: CycleStats = {
    processed: 0,
    verified_true: 0,
    verified_false: 0,
    escalated: 0,
    failed: 0,
  };
  const verdicts: ProjectVerdict[] = [];

  for (const project of queue) {
    if (Date.now() - cycleStart > CYCLE_TIMEOUT_MS) {
      await writeLog(admin, 'error', { message: 'cycle_timeout', reason: 'cycle_timeout' });
      await markRunFailed(admin, runId, 'cycle_timeout');
      return NextResponse.json({ error: 'cycle_timeout', processed: stats.processed }, { status: 500 });
    }
    stats.processed++;

    // Loop-cap guard
    const passCount = project.verifier_pass_count ?? 0;
    if (passCount >= 2) {
      await writeLog(admin, 'escalate', {
        message: `escalate · ${project.id} · loop_cap_reached · awaiting human review`,
        project_id: project.id,
        requires_human_review: true,
        reason: 'loop_cap_reached',
      });
      stats.escalated++;
      continue;
    }

    let verdict: ProjectVerdict;
    try {
      verdict = await verifyOneProject({ admin, project, branches, customers, scoreTolerance: SCORE_TOLERANCE });
    } catch (err) {
      // Unexpected error during checks. Log + continue.
      await writeLog(admin, 'error', {
        message: `unexpected error · ${project.id} · ${(err as Error).message}`,
        reason: 'unexpected_error',
        project_id: project.id,
      });
      stats.failed++;
      continue;
    }

    // Sonnet failure path: verdict.verified === null means we couldn't classify.
    if (verdict.verified === null) {
      stats.failed++;
      continue;
    }

    // Verdict logs.
    if (verdict.verified === true) {
      const passMessage = verdict.null_coordinate
        ? `verified · ${project.id} · null-coordinate project · 2 of 4 checks`
        : `verified · ${project.id} · all 4 checks passed`;
      await writeLog(
        admin,
        'verify_pass',
        { message: passMessage, project_id: project.id },
        { model_used: 'claude-sonnet' },
      );
      stats.verified_true++;
    } else {
      const failHeadline = verdict.failures[0] ?? 'unspecified failure';
      await writeLog(admin, 'verify_fail', {
        message: `verification failed · ${project.id} · ${failHeadline}`,
        project_id: project.id,
        failures: verdict.failures,
      });
      stats.verified_false++;
      // Second-fail escalate.
      if (verdict.verifier_pass_count >= 2) {
        await writeLog(admin, 'escalate', {
          message: `escalate · ${project.id} · 2 fails · awaiting human review`,
          project_id: project.id,
          requires_human_review: true,
          reason: verdict.primary_failure ?? 'verification_failed',
        });
        stats.escalated++;
      }
    }

    // Persist (single UPDATE per project; retry once on failure).
    const write = await persistVerdict(admin, verdict);
    if (!write.ok) {
      await writeLog(admin, 'error', {
        message: `supabase write failed · ${project.id}`,
        reason: 'supabase_write_failed',
        project_id: project.id,
      });
      await markRunFailed(admin, runId, `supabase_write_failed: ${write.error}`);
      return NextResponse.json({ error: 'supabase_write_failed' }, { status: 500 });
    }
    verdicts.push(verdict);

    // Phase 1 G1 Task B3/B4 hybrid: emit pathfinder/signal.verified for
    // each newly-verified project so Inngest functions (currently
    // slack-alert-on-verified, future Phase 2 enrichment + Architect
    // tuning subscribers) can react with retry semantics. Failure to
    // emit is non-fatal — the cron continues; missed events are
    // recoverable on next cycle (verifier_pass_count is idempotent).
    if (verdict.verified === true) {
      try {
        await inngest.send({
          name: 'pathfinder/signal.verified',
          data: {
            project_id: project.id,
            score: project.score ?? 0,
            verifier_pass_count: verdict.verifier_pass_count,
            verified_at: new Date().toISOString(),
          },
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await writeLog(admin, 'error', {
          message: `inngest emit failed (non-fatal) · ${project.id}`,
          reason: 'inngest_emit_failed',
          project_id: project.id,
          error: reason,
        });
      }
    } else if (verdict.verifier_pass_count >= 2 && verdict.verified === false) {
      // Two-strike escalation also surfaces as an event for the future
      // Architect Inbox subscriber to consume.
      try {
        await inngest.send({
          name: 'pathfinder/signal.escalated',
          data: {
            project_id: project.id,
            pass_count: verdict.verifier_pass_count,
            escalated_at: new Date().toISOString(),
            flags: verdict.failures ?? [],
          },
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await writeLog(admin, 'error', {
          message: `inngest emit failed (non-fatal) · ${project.id}`,
          reason: 'inngest_emit_failed',
          project_id: project.id,
          error: reason,
        });
      }
    }
  }

  // 7. Cycle close
  await writeLog(admin, 'write_success', {
    message: `write · ${stats.verified_true} verified · ${stats.escalated} escalated`,
    verified: stats.verified_true,
    escalated: stats.escalated,
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
      records_processed: stats.processed,
      records_new: stats.verified_true,
      completed_at,
    })
    .eq('id', runId);

  return NextResponse.json({
    ok: true,
    processed: stats.processed,
    verified: stats.verified_true,
    escalated: stats.escalated,
    failed: stats.failed,
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
