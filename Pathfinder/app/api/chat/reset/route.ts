// app/api/chat/reset/route.ts — soft-delete all messages in a chat thread.
//
// POST /api/chat/reset  { threadId: string }
//   Stamps cleared_at = now() on every non-cleared message in the thread.
//   The thread row itself is preserved; only messages are hidden from display
//   and excluded from the history window on the next send.
//   Ownership is verified — the thread must belong to the authenticated user.
//
// Audit trail: no hard-deletes. cleared_at is additive; rows stay in DB.

import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function userEmailFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    const user = decoded.slice(0, idx).trim();
    return user || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const userEmail = userEmailFromRequest(req);
  if (!userEmail) return new Response('unauthorized', { status: 401 });

  const body = (await req.json()) as { threadId?: string };
  const { threadId } = body;

  if (!threadId) {
    return new Response(JSON.stringify({ ok: false, error: 'threadId required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const admin = supabaseAdmin();

  // Verify ownership before touching anything.
  const { data: thread } = await admin
    .from('chat_threads')
    .select('id')
    .eq('id', threadId)
    .eq('user_email', userEmail)
    .maybeSingle();

  if (!thread) {
    return new Response(JSON.stringify({ ok: false, error: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Supabase strict types don't include cleared_at (column added after type
  // generation). Same cast pattern as appendMessage in the main chat route.
  type ClearOp = {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => { is: (col: string, val: null) => Promise<unknown> };
    };
  };
  await (admin.from('chat_messages') as unknown as ClearOp)
    .update({ cleared_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .is('cleared_at', null);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json' },
  });
}
