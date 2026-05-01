// app/api/architect/inbox/[id]/resolve/route.ts — Phase 2 Stream E, Gate E3.
//
// Operator resolution endpoint. Supports two completion modes:
//   1. resolution: 'manual' — operator handled the ticket out-of-band
//      (e.g. went directly to source, supplied data manually). Marks ticket
//      resolved; no agent action.
//   2. resolution: 'resume' — operator supplied a missing piece (api_key_env,
//      a rendered URL, a converted endpoint). Source Onboarder is re-dispatched
//      with the supplemental input. Original ticket transitions to resolved
//      once the resume run completes (downstream operation).
//
// The resume flow is the SPEC §"E3 — Tier 2 human-assist queue" requirement:
// "Operator picks up the ticket, supplies the missing piece (auth token,
// rendered HTML, etc.), Source Onboarder resumes."

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { inngest } from '@/lib/inngest/client';

export const dynamic = 'force-dynamic';

interface ResolveBody {
  resolution: 'manual' | 'resume' | 'dismiss';
  resolved_by_user_email?: string;
  resolution_note?: string;
  // Resume-specific payload
  resume_url?: string;            // override the original candidate_url
  resume_api_key_env?: string;
  resume_hint?: 'socrata' | 'rest' | 'rss' | 'json-dump';
  resume_jurisdiction?: string;
}

export async function POST(req: Request, ctx: { params: { id: string } }): Promise<Response> {
  let body: ResolveBody;
  try {
    body = (await req.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!['manual', 'resume', 'dismiss'].includes(body.resolution)) {
    return NextResponse.json({ error: 'invalid_resolution' }, { status: 400 });
  }

  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
      update: (cols: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  const ticketResult = await sb.from('architect_inbox').select('*').eq('id', ctx.params.id).single();
  if (ticketResult.error || !ticketResult.data) {
    return NextResponse.json({ error: 'ticket_not_found' }, { status: 404 });
  }
  const ticket = ticketResult.data as Record<string, unknown>;

  if (body.resolution === 'dismiss') {
    await sb.from('architect_inbox').update({
      status: 'dismissed',
      resolved_at: new Date().toISOString(),
      resolved_by_user_email: body.resolved_by_user_email ?? null,
      resolution_note: body.resolution_note ?? null,
    }).eq('id', ctx.params.id);
    return NextResponse.json({ status: 'dismissed' });
  }

  if (body.resolution === 'manual') {
    await sb.from('architect_inbox').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by_user_email: body.resolved_by_user_email ?? null,
      resolution_note: body.resolution_note ?? 'manual resolution',
    }).eq('id', ctx.params.id);
    return NextResponse.json({ status: 'resolved' });
  }

  // resolution === 'resume': dispatch Source Onboarder with the operator's
  // supplemental input and mark ticket in_progress.
  const candidateContext = ticket.context as Record<string, unknown> | null;
  const candidateUrl =
    body.resume_url ?? (candidateContext && typeof candidateContext.candidate_url === 'string' ? candidateContext.candidate_url : null);
  if (!candidateUrl) {
    return NextResponse.json({ error: 'resume_url_required' }, { status: 400 });
  }
  const requestId = crypto.randomUUID();
  await inngest.send({
    name: 'pathfinder/source.onboard.requested',
    data: {
      kind: 'url',
      url: candidateUrl,
      hint: body.resume_hint,
      api_key_env: body.resume_api_key_env,
      jurisdiction: body.resume_jurisdiction,
      created_by_user_email: body.resolved_by_user_email ?? null,
      request_id: requestId,
    },
  });
  await sb.from('architect_inbox').update({
    status: 'in_progress',
    resolution_note: `resume dispatched (request_id=${requestId}). ${body.resolution_note ?? ''}`.trim(),
    resolved_by_user_email: body.resolved_by_user_email ?? null,
  }).eq('id', ctx.params.id);

  return NextResponse.json({ status: 'in_progress', request_id: requestId });
}
