/**
 * scripts/seed-internal-deals.ts, Stream G.
 *
 * Internal-only. Idempotent. Additive. Inserts a pathfinder.deals row at
 * pipeline_stage='NEW' for every pathfinder.projects row belonging to the
 * Internal org that does not already have a deal. Existing deals are not
 * touched.
 *
 * The Internal pipeline-kanban module reads from `deals JOIN projects`.
 * Internal had 229 projects but only 1 deal before this seed, which is
 * why all 229 companies appeared in New / Outreach Ready (via the static
 * funder fallback) but no card was persistable.
 *
 * Usage: pnpm tsx scripts/seed-internal-deals.ts
 */

import { supabaseAdmin } from '@/lib/supabase';

async function main(): Promise<void> {
  const admin = supabaseAdmin() as unknown as { from: (t: string) => any };

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'internal')
    .single();
  if (orgErr || !org) {
    throw new Error(`internal org lookup: ${orgErr?.message ?? 'no row'}`);
  }
  const internalOrgId = (org as { id: string }).id;

  // Fetch all project ids for Internal. Page in case of large sets.
  const projectIds: string[] = [];
  const PAGE = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin
      .from('projects')
      .select('id')
      .eq('organization_id', internalOrgId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`projects fetch: ${error.message}`);
    const rows = (data ?? []) as { id: string }[];
    projectIds.push(...rows.map((r) => r.id));
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  // Fetch existing deal project_ids for Internal so we can skip them.
  const { data: existing, error: existingErr } = await admin
    .from('deals')
    .select('project_id, project:projects!project_id(organization_id)')
    .limit(10000);
  if (existingErr) throw new Error(`existing deals fetch: ${existingErr.message}`);
  const existingProjectIds = new Set(
    ((existing ?? []) as { project_id: string; project?: { organization_id?: string } | null }[])
      .filter((r) => r.project?.organization_id === internalOrgId)
      .map((r) => r.project_id),
  );

  const missing = projectIds.filter((id) => !existingProjectIds.has(id));
  if (missing.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`OK: nothing to seed; ${projectIds.length} projects already have deals`);
    return;
  }

  const rows = missing.map((projectId) => ({
    project_id: projectId,
    pipeline_stage: 'NEW' as const,
  }));

  const { data: inserted, error: insertErr } = await admin
    .from('deals')
    .insert(rows)
    .select('id');
  if (insertErr) throw new Error(`deals insert: ${insertErr.message}`);

  // eslint-disable-next-line no-console
  console.log(
    `OK: inserted ${(inserted ?? []).length} deals at pipeline_stage='NEW' for Internal ` +
      `(of ${projectIds.length} projects; ${existingProjectIds.size} already had deals).`,
  );
}

void main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
