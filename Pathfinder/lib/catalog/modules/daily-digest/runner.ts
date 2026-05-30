// lib/catalog/modules/daily-digest/runner.ts, Stream D.
//
// Daily digest runner for the Internal organization (#4). Reuses the
// existing briefer (composeInternalDigest) and Slack posting path; does
// not rebuild either. Hard-gated per the catalog registry on:
//   - integration/slack          -> INTERNAL_SLACK_WEBHOOK_URL must be set
//   - data_signal/verified_companies -> at least one verified project in window
//
// When either gate fails the runner returns a skipped result and does not
// post to Slack or insert into deals. The cron route at
// app/api/cron/internal-digest/route.ts delegates to this function.
//
// Newly verified projects without a deal row are seeded at
// pipeline_stage='NEW' (which maps to Internal's `new-outreach-ready`
// stage per lib/catalog/modules/pipeline-kanban/internalStageMap.ts).

import { supabaseAdmin } from '@/lib/supabase';
import {
  composeInternalDigest,
  type InternalDigestPayload,
} from '@/lib/agents/internal/digest';
import type { Project } from '@/lib/types';
import { INTERNAL_TO_DEAL } from '@/lib/catalog/modules/pipeline-kanban/internalStageMap';

export type SlackPostResult = { ok: boolean; error?: string };
export type SkippedReason =
  | 'no_slack_integration'
  | 'no_verified_companies'
  | 'dry_run';

export interface KanbanLoadResult {
  considered: number;
  already_existed: number;
  created: number;
  errors: string[];
  /** Set when the runner skipped seeding because a hard gate or dry_run blocked it. */
  skipped?: SkippedReason;
}

export interface DigestRunResult {
  generated_at: string;
  organization_id: string;
  organization_slug: string;
  window_hours: number;
  total_verified: number;
  top_n: number;
  digest: InternalDigestPayload | null;
  slack_result:
    | SlackPostResult
    | { skipped: SkippedReason };
  kanban_result: KanbanLoadResult;
}

export interface DigestRunOptions {
  /** Window size in hours for the verified-projects query (default 24). */
  windowHours?: number;
  /** Max number of entries in the digest message (default 10). */
  topN?: number;
  /** When true, compose the digest but do not post or seed. */
  dryRun?: boolean;
  /** Org slug to look up. Defaults to 'internal'; exposed for tests. */
  orgSlug?: string;
  /** Override the Slack webhook URL (tests). */
  slackWebhookUrl?: string | null;
  /** Override the Slack POST implementation (tests). */
  slackPoster?: (
    url: string,
    text: string,
    blocks: Array<Record<string, unknown>>,
  ) => Promise<SlackPostResult>;
  /** Override the Supabase client (tests). */
  supabaseClient?: { from: (t: string) => any };
}

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_TOP_N = 10;

async function defaultPostToSlack(
  webhookUrl: string,
  text: string,
  blocks: Array<Record<string, unknown>>,
): Promise<SlackPostResult> {
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

interface SeedArgs {
  adminAny: { from: (t: string) => any };
  projectIds: string[];
}

async function seedDealsAtNewOutreachReady(args: SeedArgs): Promise<KanbanLoadResult> {
  const { adminAny, projectIds } = args;
  const result: KanbanLoadResult = {
    considered: projectIds.length,
    already_existed: 0,
    created: 0,
    errors: [],
  };
  if (projectIds.length === 0) return result;

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

  const newOutreachReadyDealStage = INTERNAL_TO_DEAL['new-outreach-ready'];
  const rows = fresh.map((id) => ({
    project_id: id,
    pipeline_stage: newOutreachReadyDealStage,
    notes: `Auto-loaded by daily-digest module at ${INTERNAL_TO_DEAL['new-outreach-ready']} (Internal: new-outreach-ready).`,
  }));
  const { error: insertErr } = await adminAny.from('deals').insert(rows);
  if (insertErr) {
    result.errors.push(`deals_insert_failed: ${insertErr.message}`);
    return result;
  }
  result.created = rows.length;
  return result;
}

interface InternalOrgRow {
  id: string;
  slug: string;
  name: string | null;
  architecture: { branding?: { display_name?: string } } | null;
}

export async function runInternalDailyDigest(
  options: DigestRunOptions = {},
): Promise<DigestRunResult> {
  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS;
  const topN = options.topN ?? DEFAULT_TOP_N;
  const orgSlug = options.orgSlug ?? 'internal';
  const dryRun = options.dryRun ?? false;
  const slackPoster = options.slackPoster ?? defaultPostToSlack;

  const adminAny =
    options.supabaseClient ?? (supabaseAdmin() as unknown as { from: (t: string) => any });

  const orgLookup = (await adminAny
    .from('organizations')
    .select('id, slug, name, architecture')
    .eq('slug', orgSlug)
    .maybeSingle()) as { data: InternalOrgRow | null };
  if (!orgLookup.data) {
    throw new Error(`org ${orgSlug} not found`);
  }
  const orgRow = orgLookup.data;
  const orgId = orgRow.id;
  const displayName =
    orgRow.architecture?.branding?.display_name ?? orgRow.name ?? 'Unicron Internal';

  const sinceIso = new Date(Date.now() - windowHours * 3_600_000).toISOString();
  const { data: projectsRaw } = (await adminAny
    .from('projects')
    .select('*')
    .eq('organization_id', orgId)
    .eq('verified', true)
    .gte('ranked_at', sinceIso)
    .order('score', { ascending: false })
    .limit(100)) as { data: Project[] | null };

  const projects = (projectsRaw ?? []) as Project[];

  // Hard gate: verified_companies non-empty.
  if (projects.length === 0) {
    return {
      generated_at: new Date().toISOString(),
      organization_id: orgId,
      organization_slug: orgRow.slug,
      window_hours: windowHours,
      total_verified: 0,
      top_n: topN,
      digest: null,
      slack_result: { skipped: 'no_verified_companies' },
      kanban_result: { considered: 0, already_existed: 0, created: 0, errors: [], skipped: 'no_verified_companies' },
    };
  }

  // Hard gate: integration/slack present.
  const slackWebhook = options.slackWebhookUrl !== undefined
    ? options.slackWebhookUrl
    : process.env.INTERNAL_SLACK_WEBHOOK_URL ?? null;
  if (!slackWebhook) {
    return {
      generated_at: new Date().toISOString(),
      organization_id: orgId,
      organization_slug: orgRow.slug,
      window_hours: windowHours,
      total_verified: projects.length,
      top_n: topN,
      digest: null,
      slack_result: { skipped: 'no_slack_integration' },
      kanban_result: { considered: projects.length, already_existed: 0, created: 0, errors: [], skipped: 'no_slack_integration' },
    };
  }

  // Reuse the existing briefer rather than rebuilding the digest shape.
  const digest = composeInternalDigest({
    projects,
    display_name: displayName,
    top_n: topN,
    window_hours: windowHours,
  });

  let slackResult: DigestRunResult['slack_result'];
  let kanbanResult: DigestRunResult['kanban_result'];

  if (dryRun) {
    slackResult = { skipped: 'dry_run' };
    kanbanResult = { considered: projects.length, already_existed: 0, created: 0, errors: [], skipped: 'dry_run' };
  } else {
    slackResult = await slackPoster(slackWebhook, digest.slack_text, digest.slack_blocks);
    kanbanResult = await seedDealsAtNewOutreachReady({ adminAny, projectIds: projects.map((p) => p.id) });
  }

  return {
    generated_at: digest.generated_at,
    organization_id: orgId,
    organization_slug: orgRow.slug,
    window_hours: digest.window_hours,
    total_verified: digest.total_verified,
    top_n: digest.top_n,
    digest,
    slack_result: slackResult,
    kanban_result: kanbanResult,
  };
}
