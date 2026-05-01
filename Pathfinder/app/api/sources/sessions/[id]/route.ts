// app/api/sources/sessions/[id]/route.ts — Phase 2 Stream E.
//
// Read-only endpoint for the operator UI to poll Source Onboarder progress.
// Returns architect_sessions row including reasoning_log + outcome.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: { id: string } }): Promise<Response> {
  const id = ctx.params.id;
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const result = await sb
    .from('architect_sessions')
    .select('id,agent_role,goal,status,reasoning_log,outcome,total_cost_usd,total_llm_calls,total_tool_calls,started_at,completed_at')
    .eq('id', id)
    .single();
  if (result.error || !result.data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(result.data);
}
