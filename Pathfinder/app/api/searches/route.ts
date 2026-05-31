// app/api/searches/route.ts — ICP Saved Search S1.
//
// POST /api/searches  body:{name, icp_text, region, radius_mi}
//   Creates a pathfinder.saved_searches row (Internal-scoped via
//   slug='internal'), seeds a pathfinder.search_runs row with the
//   six-phase progress shell, and emits
//   pathfinder/search.run.requested so the searchOrchestrator picks it
//   up. Returns 201 {id} where id is the saved_search id.
//
// GET  /api/searches
//   Lists the Internal org's saved_searches (newest first).
//
// SPEC: Pathfinder/docs/SPEC-ICP-Search.md, S1 slice.

import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { inngest } from '@/lib/inngest/client';
import { initialProgress, initialStats } from '@/lib/agents/search';
import { resolveInternalOrgId } from './_internal-org';
import type {
  SavedSearch,
  SearchRun,
} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PostBody {
  name?: unknown;
  icp_text?: unknown;
  region?: unknown;
  radius_mi?: unknown;
}

interface ValidPostBody {
  name: string;
  icp_text: string;
  region: string;
  radius_mi: number;
}

function validate(body: PostBody): ValidPostBody | { error: string } {
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return { error: 'name is required' };
  }
  if (typeof body.icp_text !== 'string' || body.icp_text.trim().length === 0) {
    return { error: 'icp_text is required' };
  }
  if (typeof body.region !== 'string' || body.region.trim().length === 0) {
    return { error: 'region is required' };
  }
  const radius =
    typeof body.radius_mi === 'number'
      ? body.radius_mi
      : typeof body.radius_mi === 'string'
        ? Number.parseInt(body.radius_mi, 10)
        : Number.NaN;
  if (!Number.isFinite(radius) || radius <= 0) {
    return { error: 'radius_mi must be a positive integer' };
  }
  return {
    name: body.name.trim(),
    icp_text: body.icp_text.trim(),
    region: body.region.trim(),
    radius_mi: Math.trunc(radius),
  };
}

type InsertOne<TPayload, TRow> = {
  insert: (row: TPayload) => {
    select: (cols: string) => {
      single: () => Promise<{ data: TRow | null; error: { message: string } | null }>;
    };
  };
};

export async function POST(req: NextRequest): Promise<Response> {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const validated = validate(body);
  if ('error' in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const orgId = await resolveInternalOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: 'internal_org_not_found' },
      { status: 404 },
    );
  }

  const admin = supabaseAdmin();
  const savedPayload = {
    organization_id: orgId,
    name: validated.name,
    icp_text: validated.icp_text,
    region: validated.region,
    radius_mi: validated.radius_mi,
    status: 'planning' as const,
  };
  const { data: savedRow, error: savedErr } = await (
    admin.from('saved_searches') as unknown as InsertOne<typeof savedPayload, SavedSearch>
  )
    .insert(savedPayload)
    .select('*')
    .single();
  if (savedErr || !savedRow) {
    return NextResponse.json(
      { error: `saved_search_insert_failed: ${savedErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const runPayload = {
    saved_search_id: savedRow.id,
    status: 'pending' as const,
    phase: null,
    progress: initialProgress(),
    stats: initialStats(),
    started_at: null,
    finished_at: null,
  };
  const { data: runRow, error: runErr } = await (
    admin.from('search_runs') as unknown as InsertOne<typeof runPayload, SearchRun>
  )
    .insert(runPayload)
    .select('*')
    .single();
  if (runErr || !runRow) {
    return NextResponse.json(
      { error: `search_run_insert_failed: ${runErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  await inngest.send({
    name: 'pathfinder/search.run.requested',
    data: {
      search_run_id: runRow.id,
      saved_search_id: savedRow.id,
    },
  });

  return NextResponse.json({ id: savedRow.id }, { status: 201 });
}

export async function GET(_req: NextRequest): Promise<Response> {
  const orgId = await resolveInternalOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: 'internal_org_not_found' },
      { status: 404 },
    );
  }
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('saved_searches')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json((data ?? []) as SavedSearch[]);
}
