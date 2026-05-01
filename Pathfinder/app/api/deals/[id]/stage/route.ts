// POST /api/deals/[id]/stage  body: { to_stage, actor_email?, payload? }
//
// Stream B Gate B1 — drag-to-move in the Kanban writes here. Updates the
// deal's pipeline_stage and inserts a deal_activities row of type
// 'stage_change'. Idempotent on from === to (returns noop=true).

import { NextResponse, type NextRequest } from 'next/server';

import { isDealPipelineStage, moveDealStage } from '@/lib/deals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface StageBody {
  to_stage?: unknown;
  actor_email?: unknown;
  payload?: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const dealId = params.id;
  if (!dealId) {
    return NextResponse.json({ error: 'deal id required' }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const body = (raw ?? {}) as StageBody;
  if (!isDealPipelineStage(body.to_stage)) {
    return NextResponse.json({ error: 'invalid_to_stage' }, { status: 400 });
  }

  try {
    const result = await moveDealStage({
      dealId,
      toStage: body.to_stage,
      actorEmail: typeof body.actor_email === 'string' ? body.actor_email : null,
      payload:
        body.payload && typeof body.payload === 'object'
          ? (body.payload as Record<string, unknown>)
          : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (/not found/i.test(reason)) {
      return NextResponse.json({ error: 'deal_not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
