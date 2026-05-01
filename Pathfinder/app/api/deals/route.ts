// GET  /api/deals?stage=NEW&owner=alice@zedcor.com → DealWithProject[]
// POST /api/deals                                  → create deal
//
// Stream B Gate B1 — pipeline Kanban data feed. Anon-readable per
// migration 0050 RLS; writes are server-side only via supabaseAdmin.

import { NextResponse, type NextRequest } from 'next/server';

import { createDeal, isDealPipelineStage, listDealsWithProjects } from '@/lib/deals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get('stage');
  const owner = searchParams.get('owner');
  const limit = searchParams.get('limit');

  if (stage && !isDealPipelineStage(stage)) {
    return NextResponse.json({ error: 'invalid_stage' }, { status: 400 });
  }

  try {
    const data = await listDealsWithProjects({
      stage: stage as ReturnType<typeof isDealPipelineStage> extends true ? never : null,
      ownerEmail: owner ?? null,
      limit: limit ? Math.min(Math.max(Number(limit) || 0, 1), 1000) : undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}

interface CreateDealBody {
  project_id?: unknown;
  owner_email?: unknown;
  pipeline_stage?: unknown;
  value_usd?: unknown;
  notes?: unknown;
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const body = (raw ?? {}) as CreateDealBody;
  if (typeof body.project_id !== 'string' || !body.project_id) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 });
  }
  if (body.pipeline_stage !== undefined && !isDealPipelineStage(body.pipeline_stage)) {
    return NextResponse.json({ error: 'invalid_pipeline_stage' }, { status: 400 });
  }

  let valueUsd: number | null = null;
  if (body.value_usd !== undefined && body.value_usd !== null) {
    const n = Number(body.value_usd);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: 'value_usd must be a number' }, { status: 400 });
    }
    valueUsd = n;
  }

  try {
    const deal = await createDeal({
      projectId: body.project_id,
      ownerEmail: typeof body.owner_email === 'string' ? body.owner_email : null,
      pipelineStage: isDealPipelineStage(body.pipeline_stage) ? body.pipeline_stage : 'NEW',
      valueUsd,
      notes: typeof body.notes === 'string' ? body.notes : null,
    });
    return NextResponse.json(deal, { status: 201 });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    // Unique-violation on (project_id, owner_email) maps to 409.
    if (/duplicate key|unique constraint/i.test(reason)) {
      return NextResponse.json({ error: 'deal_exists', detail: reason }, { status: 409 });
    }
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
