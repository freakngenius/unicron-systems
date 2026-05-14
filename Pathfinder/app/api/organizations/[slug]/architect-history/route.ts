// app/api/organizations/[slug]/architect-history/route.ts
// SPEC: Company Docs/Metacron/SPEC - Customer Profile Architect History.md
//
// GET /api/organizations/:slug/architect-history
//   → list of architect runs scoped to the org, newest first
//
// Reads pathfinder.architect_sessions (joined to architect_proposals for the
// status pill). Sessions are scoped by customer_org_id (text) which matches
// organizations.customer_org_id. Historical sessions were backfilled by
// migration 20260514_architect_sessions_org_link_backfill.sql.
//
// Auth: x-unicron-api-key header validated against UNICRON_INGEST_API_KEY.
// All DB ops use supabaseAdmin() (service role — bypasses RLS).
// CORS: matches the rest of the organizations subtree.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const METACRON_ORIGINS = [
  'https://unicron-platform.vercel.app',
  'https://metacron.unicron.systems',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && (METACRON_ORIGINS.includes(origin) || origin.endsWith('.vercel.app'))
      ? origin
      : METACRON_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-unicron-api-key',
  };
}

function validateApiKey(req: NextRequest): boolean {
  const key = req.headers.get('x-unicron-api-key');
  const expected = process.env.UNICRON_INGEST_API_KEY;
  if (!expected) return false;
  return key === expected;
}

type RouteContext = { params: Promise<{ slug: string }> };

export type ArchitectHistoryEntry = {
  session_id: string;
  session_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  total_cost_usd: number | null;
  goal: string | null;
  input_payload: Record<string, unknown> | null;
  output_payload: Record<string, unknown> | null;
  proposal: {
    id: string;
    type: string;
    headline: string;
    body: string | null;
    confidence: number | null;
    status: string;
    resolved_at: string | null;
    resolved_by_user_email: string | null;
  } | null;
};

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: NextRequest, context: RouteContext) {
  const origin = req.headers.get('origin');
  if (!validateApiKey(req)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: corsHeaders(origin) },
    );
  }

  const { slug } = await context.params;
  const admin = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const orgRes = await admin
    .from('organizations')
    .select('id, customer_org_id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (orgRes.error) {
    return NextResponse.json(
      { error: orgRes.error.message },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
  if (!orgRes.data) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: corsHeaders(origin) },
    );
  }
  const org = orgRes.data as { id: string; customer_org_id: string; slug: string };

  const adminQuery = supabaseAdmin() as unknown as {
    from: (t: string) => any;
  };
  const sessionsRes = (await adminQuery
    .from('architect_sessions')
    .select(
      [
        'id',
        'session_type',
        'status',
        'created_at',
        'completed_at',
        'duration_ms',
        'total_cost_usd',
        'goal',
        'input_payload',
        'output_payload',
      ].join(','),
    )
    .eq('customer_org_id', org.customer_org_id)
    .order('created_at', { ascending: false })) as {
    data: Array<Record<string, unknown>> | null;
    error: { message: string } | null;
  };

  if (sessionsRes.error) {
    return NextResponse.json(
      { error: sessionsRes.error.message },
      { status: 500, headers: corsHeaders(origin) },
    );
  }

  const sessions = (sessionsRes.data ?? []) as Array<{
    id: string;
    session_type: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    total_cost_usd: number | null;
    goal: string | null;
    input_payload: Record<string, unknown> | null;
    output_payload: Record<string, unknown> | null;
  }>;

  // Join proposals one-shot for status pills.
  const sessionIds = sessions.map((s) => s.id);
  let proposals: Array<{
    id: string;
    session_id: string;
    type: string;
    headline: string;
    body: string | null;
    confidence: number | null;
    status: string;
    resolved_at: string | null;
    resolved_by_user_email: string | null;
    created_at: string;
  }> = [];
  if (sessionIds.length > 0) {
    const proposalsRes = (await (adminQuery
      .from('architect_proposals')
      .select(
        'id, session_id, type, headline, body, confidence, status, resolved_at, resolved_by_user_email, created_at',
      )
      .in('session_id', sessionIds) as Promise<{
      data: typeof proposals | null;
      error: { message: string } | null;
    }>)) as { data: typeof proposals | null; error: { message: string } | null };
    if (proposalsRes.error) {
      return NextResponse.json(
        { error: proposalsRes.error.message },
        { status: 500, headers: corsHeaders(origin) },
      );
    }
    proposals = proposalsRes.data ?? [];
  }
  const proposalBySession = new Map<string, (typeof proposals)[number]>();
  for (const p of proposals) {
    const existing = proposalBySession.get(p.session_id);
    if (!existing || new Date(p.created_at) > new Date(existing.created_at)) {
      proposalBySession.set(p.session_id, p);
    }
  }

  const history: ArchitectHistoryEntry[] = sessions.map((s) => {
    const p = proposalBySession.get(s.id) ?? null;
    return {
      session_id: s.id,
      session_type: s.session_type,
      status: s.status,
      created_at: s.created_at,
      completed_at: s.completed_at,
      duration_ms: s.duration_ms,
      total_cost_usd: s.total_cost_usd,
      goal: s.goal,
      input_payload: s.input_payload,
      output_payload: s.output_payload,
      proposal: p
        ? {
            id: p.id,
            type: p.type,
            headline: p.headline,
            body: p.body,
            confidence: p.confidence,
            status: p.status,
            resolved_at: p.resolved_at,
            resolved_by_user_email: p.resolved_by_user_email,
          }
        : null,
    };
  });

  return NextResponse.json(
    { org_slug: org.slug, history },
    { headers: corsHeaders(origin) },
  );
}
