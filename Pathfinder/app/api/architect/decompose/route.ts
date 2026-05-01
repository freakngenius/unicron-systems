// app/api/architect/decompose/route.ts — Phase 2 Stream D Gate D1.
// Spec: SPEC - Architect Agent.md §3 (decomposition session API surface).
//
// POST /api/architect/decompose
// Auth: gated by Pathfinder's basic-auth middleware (same as other operator
//   surfaces). Stream C (operator UI) is also basic-auth gated; the same
//   browser session passes through.
//
// Request:
//   { buyer_pain_prompt: string, vertical_id?: string,
//     customer_org_id?: string, existing_vertical_id?: string,
//     constraints?: string[] }
//
// Response (200):
//   { proposal_id, session_id, architecture, reasoning, cost_usd,
//     duration_ms, status }
//
// Response (400): { error } when body is malformed.
// Response (500): { error } when the agent loop fails terminally.
//
// Stream C consumes proposal_id + architecture for the Architect Inbox
// detail view and the Onboarding tab's "thinking" stream.

import { NextResponse, type NextRequest } from 'next/server';
import { runDecomposition } from '@/services/architect/sessions/decomposition';
import type { DecompositionInput } from '@/services/architect/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Decomposition can run up to 3 minutes per spec §9.
export const maxDuration = 300;

function authorize(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.ARCHITECT_API_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, status: 503, error: 'ARCHITECT_API_TOKEN not configured' };
    }
    // Dev convenience: allow unauthenticated when env not set.
    return { ok: true };
  }
  const header = req.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (token !== expected) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = parseInput(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const response = await runDecomposition({ input: parsed });
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[architect.decompose] session failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseInput(body: unknown): DecompositionInput | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const prompt = typeof b.buyer_pain_prompt === 'string' ? b.buyer_pain_prompt : '';
  if (!prompt || prompt.trim().length < 10) {
    return { error: 'buyer_pain_prompt must be a string of at least 10 characters' };
  }
  if (prompt.length > 4000) {
    return { error: 'buyer_pain_prompt exceeds 4000 characters' };
  }
  const out: DecompositionInput = { buyer_pain_prompt: prompt };
  if (typeof b.vertical_id === 'string') out.vertical_id = b.vertical_id;
  if (typeof b.customer_org_id === 'string') out.customer_org_id = b.customer_org_id;
  if (typeof b.existing_vertical_id === 'string') out.existing_vertical_id = b.existing_vertical_id;
  if (Array.isArray(b.constraints)) {
    out.constraints = b.constraints
      .filter((c): c is string => typeof c === 'string')
      .slice(0, 16);
  }
  if (typeof b.trigger === 'string') {
    if (
      b.trigger === 'manual' ||
      b.trigger === 'cron' ||
      b.trigger === 'adjacency_threshold' ||
      b.trigger === 'operator_action' ||
      b.trigger === 'periodic'
    ) {
      out.trigger = b.trigger;
    }
  }
  return out;
}
