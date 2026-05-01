// app/api/architect/inbox/route.ts — Phase 2 Stream E, Gate E3.
//
// Lists architect_inbox tickets for the operator UI. Default filter is
// status=open + category=source-discovery (Stream E). Stream D will add
// its own category filter.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const category = url.searchParams.get('category') ?? 'source-discovery';
  const status = url.searchParams.get('status') ?? 'open';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);

  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
  const result = await sb
    .from('architect_inbox')
    .select('*')
    .eq('category', category)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (result.error) {
    return NextResponse.json({ error: 'select_failed', detail: result.error.message }, { status: 500 });
  }
  return NextResponse.json({ tickets: result.data ?? [], category, status });
}
