// GET /api/dev/wrapper-probe — Phase 1 G2 synthetic verification probe.
//
// Phase 1 G2 wrapped the legacy `anthropic()` factory in lib/anthropic.ts so
// inline `client.messages.create(...)` callers (Ranker + Verifier crons) write
// to pathfinder.llm_calls. The natural verification path (waiting for a cron
// tick to fire and write a row) is blocked: at the time this route ships, the
// ranker + verifier queues are empty (every project has score / verified set),
// so both routes early-return at their `queue.length === 0` gate without ever
// invoking Anthropic. This probe is the deterministic substitute — one trivial
// Haiku call through the wrapper, then a poll-back to confirm the row landed.
//
// The route is intentionally temporary: Phase 1 close-out removes it.
//
// Auth: same Bearer ${CRON_SECRET} gate as the cron routes; falls open in
// non-production when CRON_SECRET is unset for local debug.

import { NextResponse } from 'next/server';
import { anthropic, setAgentContext } from '@/lib/anthropic';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim() === expected;
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('secret');
    if (q && q === expected) return true;
  } catch {
    // ignore URL parse errors
  }
  return false;
}

interface ProbeRow {
  id: string;
  cost_usd: string | number;
  latency_ms: number;
  agent_name: string | null;
  model: string;
  surface: string;
  input_tokens: number;
  output_tokens: number;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Floor for the poll-back query. recordLLMCall is fire-and-forget, so we
  // search for any wrapper-probe row created at or after this instant.
  const tFloor = new Date().toISOString();

  // 'test' (not 'dev') because pathfinder.llm_calls.surface has a CHECK
  // constraint llm_calls_surface_check restricting values to
  // ('cron','chat','architect','manual','test'). The probe is a synthetic
  // call from a test harness, so 'test' is the correct existing taxonomy.
  setAgentContext({ agentName: 'wrapper-probe', surface: 'test' });

  const t0 = Date.now();
  try {
    await anthropic().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ok' }],
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, stage: 'anthropic_call', error: (err as Error).message },
      { status: 500 },
    );
  }
  const callLatencyMs = Date.now() - t0;

  // Poll pathfinder.llm_calls. recordLLMCall fires async with no awaitable
  // handle; ~1.5s is a comfortable bound for Supabase REST round-trips.
  let row: ProbeRow | null = null;
  for (let i = 0; i < 8; i++) {
    const { data } = await (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            gte: (col: string, val: string) => {
              order: (c: string, o: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: ProbeRow[] | null; error: { message: string } | null }>;
              };
            };
          };
        };
      };
    })
      .from('llm_calls')
      .select('id, cost_usd, latency_ms, agent_name, model, surface, input_tokens, output_tokens')
      .eq('agent_name', 'wrapper-probe')
      .gte('created_at', tFloor)
      .order('created_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      row = data[0];
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!row) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'recorder_poll',
        reason: 'no_llm_calls_row_within_1600ms',
        call_latency_ms: callLatencyMs,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    llm_call_id: row.id,
    agent_name: row.agent_name,
    surface: row.surface,
    model: row.model,
    cost_usd: row.cost_usd,
    latency_ms: row.latency_ms,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    call_latency_ms: callLatencyMs,
  });
}
