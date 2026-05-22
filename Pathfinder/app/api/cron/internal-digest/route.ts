// app/api/cron/internal-digest/route.ts
//
// Internal onboarding Stage 8 — Daily morning digest cron.
//
// Runtime: Vercel cron weekday morning UTC.
// Auth: Authorization: Bearer ${CRON_SECRET} per the existing cron pattern.
//
// Behavior:
//   1. Look up Internal's organization_id by slug.
//   2. Pull verified=true projects for Internal posted in the last 24h.
//   3. Compose the digest via composeInternalDigest().
//   4. Post to Slack if INTERNAL_SLACK_WEBHOOK_URL is set (graceful skip
//      otherwise — the operator still gets the digest in the response).
//   5. Seed deals at pipeline_stage='NEW' for any verified company that
//      doesn't already have one (idempotent by project_id).
//
// Spec: Pathfinder/Pathfinder-Internal-Blueprint.md §9.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { composeInternalDigest } from '@/lib/agents/internal/digest';
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

async function postToSlack(webhookUrl: string, text: string, blocks: Array<Record<string, unknown>>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, blocks }),
    });
    if (!res.ok) {
      return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface SeedDealsArgs {
  adminAny: { from: (t: string) => any };
  projectIds: string[];
}

interface SeedDealsResult {
  considered: number;
  already_existed: number;
  created: number;
  errors: string[];
}

async function seedDealsForVerifiedProjects(args: SeedDealsArgs): Promise<SeedDealsResult> {
  const { adminAny, projectIds } = args;
  const result: SeedDealsResult = { considered: projectIds.length, already_existed: 0, created: 0, errors: [] };
  if (projectIds.length === 0) return result;

  // Dedupe against existing deals.
  const { data: existing, error: existErr } = await adminAny
    .from('deals')
    .select('project_id')
    .in('project_id', projectIds);
  if (existErr) {
    result.errors.push(`deals_select_failed: ${existErr.message}`);
    return result;
  }
  const existingSet = new Set(
    (existing as Array<{ project_id: string }> | null ?? []).map((r) => r.project_id),
  );
  result.already_existed = existingSet.size;
  const fresh = projectIds.filter((id) => !existingSet.has(id));
  if (fresh.length === 0) return result;

  const rows = fresh.map((id) => ({
    project_id: id,
    pipeline_stage: 'NEW',
    notes: 'Auto-loaded by internal-digest cron at New / Outreach Ready stage.',
  }));
  const { error: insertErr } = await adminAny.from('deals').insert(rows);
  if (insertErr) {
    result.errors.push(`deals_insert_failed: ${insertErr.message}`);
    return result;
  }
  result.created = rows.length;
  return result;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminAny = supabaseAdmin() as unknown as { from: (t: string) => any };

  const orgLookup = await adminAny
    .from('organizations')
    .select('id, name, architecture')
    .eq('slug', 'internal')
    .maybeSingle();
  if (!orgLookup.data) {
    return NextResponse.json({ error: 'Internal org not found' }, { status: 404 });
  }
  const orgId: string = orgLookup.data.id;
  const displayName: string =
    orgLookup.data.architecture?.branding?.display_name ?? orgLookup.data.name ?? 'Unicron Internal';

  const url = new URL(req.url);
  const windowHours = Number(url.searchParams.get('hours') ?? '24');
  const topN = Number(url.searchParams.get('top_n') ?? '10');
  const dryRun = url.searchParams.get('dry_run') === '1';

  const sinceIso = new Date(Date.now() - windowHours * 3_600_000).toISOString();
  const { data: projectsRaw, error: projErr } = await adminAny
    .from('projects')
    .select('*')
    .eq('organization_id', orgId)
    .eq('verified', true)
    .gte('ranked_at', sinceIso)
    .order('score', { ascending: false })
    .limit(100);

  if (projErr) {
    return NextResponse.json({ error: `projects fetch failed: ${projErr.message}` }, { status: 500 });
  }

  const projects = (projectsRaw ?? []) as Project[];
  const digest = composeInternalDigest({
    projects,
    display_name: displayName,
    top_n: topN,
    window_hours: windowHours,
  });

  // Slack delivery (gated on env var, graceful skip otherwise).
  let slack_result: { ok: boolean; error?: string } | { skipped: 'no_webhook' | 'dry_run' } = { skipped: 'no_webhook' };
  const slackWebhook = process.env.INTERNAL_SLACK_WEBHOOK_URL;
  if (dryRun) {
    slack_result = { skipped: 'dry_run' };
  } else if (slackWebhook) {
    slack_result = await postToSlack(slackWebhook, digest.slack_text, digest.slack_blocks);
  }

  // Kanban load: seed deals at NEW stage for each verified project in the window.
  const allVerifiedIds = projects.map((p) => p.id);
  const kanban_result = dryRun
    ? { considered: allVerifiedIds.length, already_existed: 0, created: 0, errors: [] as string[], skipped: 'dry_run' as const }
    : await seedDealsForVerifiedProjects({ adminAny, projectIds: allVerifiedIds });

  return NextResponse.json({
    generated_at: digest.generated_at,
    organization_id: orgId,
    window_hours: digest.window_hours,
    total_verified: digest.total_verified,
    top_n: digest.top_n,
    entries: digest.entries,
    slack_text: digest.slack_text,
    slack_result,
    kanban_result,
  });
}
