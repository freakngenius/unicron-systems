// app/api/cron/funder-weekly-memo/route.ts
//
// Funder onboarding Stage 7 — Weekly Deal Memo cron.
//
// Runtime: Vercel cron at `0 14 * * MON` (every Monday 14:00 UTC = ~7am PT).
// Auth: Authorization: Bearer ${CRON_SECRET} per the existing cron pattern.
//
// Behavior:
//   1. Look up Funder's organization_id by slug.
//   2. Pull verified=true projects for Funder posted in the last 7 days.
//   3. Compose the deal memo via composeDealMemo().
//   4. If FUNDER_MEMO_TO is set, send via Resend (existing dep). Else
//      degrade gracefully: still write the memo HTML to disk-equivalent
//      via the response body and return totals.
//
// Spec: Pathfinder/Pathfinder-Funder-Build-Spec.md §4 Stage 7.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { composeDealMemo } from '@/lib/agents/funder/dealMemo';
import type { Project } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim() === expected;
  try {
    const q = new URL(req.url).searchParams.get('secret');
    if (q && q === expected) return true;
  } catch {
    // ignore
  }
  return false;
}

async function sendViaResend(to: string, from: string, subject: string, html: string, plain: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };
  // Use direct REST so we don't depend on the SDK being hoisted into
  // worktree node_modules (matches the pattern in scripts/emit-funder-org-created.ts).
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text: plain }),
  });
  if (!res.ok) {
    return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
  }
  const data = (await res.json()) as { id?: string };
  return { ok: true, id: data.id };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminAny = supabaseAdmin() as unknown as { from: (t: string) => any };

  const orgLookup = await adminAny.from('organizations').select('id, name, architecture').eq('slug', 'funder').maybeSingle();
  if (!orgLookup.data) {
    return NextResponse.json({ error: 'Funder org not found' }, { status: 404 });
  }
  const orgId: string = orgLookup.data.id;
  const displayName: string = orgLookup.data.architecture?.branding?.display_name ?? orgLookup.data.name ?? 'Funder';

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: projectsRaw, error: projErr } = await adminAny
    .from('projects')
    .select('*')
    .eq('organization_id', orgId)
    .eq('verified', true)
    .gte('ranked_at', weekAgo)
    .order('score', { ascending: false })
    .limit(40);

  if (projErr) {
    return NextResponse.json({ error: `projects fetch failed: ${projErr.message}` }, { status: 500 });
  }

  const projects = (projectsRaw ?? []) as Project[];
  const memo = composeDealMemo({ projects, display_name: displayName });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === '1';

  const to = process.env.FUNDER_MEMO_TO;
  const from = process.env.FUNDER_MEMO_FROM ?? 'pathfinder@unicron.systems';

  let send_result: { ok: boolean; error?: string; id?: string } | { skipped: 'dry_run' | 'no_to_env' } = { skipped: 'no_to_env' };
  if (dryRun) {
    send_result = { skipped: 'dry_run' };
  } else if (to) {
    send_result = await sendViaResend(to, from, memo.subject, memo.html, memo.plain);
  }

  return NextResponse.json({
    week_ending: memo.week_ending,
    subject: memo.subject,
    totals: memo.totals,
    by_thesis_counts: Object.fromEntries(Object.entries(memo.by_thesis).map(([k, v]) => [k, v.length])),
    send_result,
    // Return the HTML so an operator can curl the route to preview the memo
    // even without sending. Truncated to 100k chars to keep payloads sane.
    html_preview: memo.html.slice(0, 100_000),
  });
}
