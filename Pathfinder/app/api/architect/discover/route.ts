// app/api/architect/discover/route.ts — Phase 2 Stream D Gate D3.
// Spec: SPEC - Architect Agent.md §5 (manual + AdjacencyMapper trigger).
//
// POST /api/architect/discover
// Auth: Bearer ARCHITECT_API_TOKEN.

import { NextResponse, type NextRequest } from 'next/server';
import { runDiscovery } from '@/services/architect/sessions/discovery';
import type { ArchitectTrigger, DiscoveryInput } from '@/services/architect/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Discovery spec §9 wants 15 min; Vercel Pro plan caps at 800. Sessions
// that need longer must run via Inngest, not Vercel function.
export const maxDuration = 800;

function authorize(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.ARCHITECT_API_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, status: 503, error: 'ARCHITECT_API_TOKEN not configured' };
    }
    return { ok: true };
  }
  const header = req.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (token !== expected) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true };
}

const VALID_TRIGGERS: ArchitectTrigger[] = [
  'manual',
  'cron',
  'adjacency_threshold',
  'operator_action',
  'periodic',
];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const triggerCandidate = typeof b.trigger === 'string' ? b.trigger : 'manual';
  const trigger: ArchitectTrigger = (
    VALID_TRIGGERS.includes(triggerCandidate as ArchitectTrigger)
      ? triggerCandidate
      : 'manual'
  ) as ArchitectTrigger;
  const input: DiscoveryInput = {
    vertical_id: typeof b.vertical_id === 'string' ? b.vertical_id : 'pathfinder-default',
    trigger,
    context: typeof b.context === 'object' && b.context ? (b.context as Record<string, unknown>) : undefined,
  };
  try {
    const response = await runDiscovery({ input });
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[architect.discover] session failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
