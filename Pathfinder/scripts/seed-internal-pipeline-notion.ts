/**
 * scripts/seed-internal-pipeline-notion.ts, Stream G.
 *
 * One-shot: creates the "Internal Pipeline" Notion database under the
 * parent page id in env, then seeds one Notion page per Internal deal
 * with the seven-stage Select property mapped from pipeline_stage.
 *
 * Required env:
 *   NOTION_API_KEY                          shared with the dev kanbans
 *   NOTION_PARENT_PAGE_INTERNAL_PIPELINE    where the new DB lives
 *
 * Outputs the new database id; the operator copies it to
 *   NOTION_DB_INTERNAL_PIPELINE             (Vercel production env)
 *
 * Idempotent on the seed step (mapping table is upserted on deal_id).
 * The create-DB step is not idempotent; do not re-run with the same
 * parent page unless the previous DB has been archived.
 *
 * Usage:
 *   NOTION_PARENT_PAGE_INTERNAL_PIPELINE=<page-id> \
 *     pnpm tsx scripts/seed-internal-pipeline-notion.ts
 */

import {
  createInternalPipelineDatabase,
  notionClient,
  pagePropertiesFor,
  recordMapping,
  type DealSnapshot,
} from '@/lib/notion/internal-pipeline';
import { supabaseAdmin } from '@/lib/supabase';

const BASE_PATHFINDER_URL =
  process.env.PATHFINDER_BASE_URL ?? 'https://internal.unicron.systems/pathfinder';

interface DealJoinRow {
  id: string;
  pipeline_stage: string;
  project: {
    id: string;
    title: string | null;
    score: number | null;
    raw_payload: Record<string, unknown> | null;
    organization_id: string;
  } | null;
}

function readServiceCategory(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const enr = (payload.internal_enrichment as Record<string, unknown> | undefined) ?? {};
  return (
    (enr.service_category as string | undefined) ??
    (payload.internal_inferred_service_category as string | undefined) ??
    null
  );
}

function readHq(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const enr = (payload.internal_enrichment as Record<string, unknown> | undefined) ?? {};
  return (
    (enr.hq_location as string | undefined) ??
    (payload.hq_location as string | undefined) ??
    null
  );
}

function readSource(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const enr = (payload.internal_enrichment as Record<string, unknown> | undefined) ?? {};
  return (
    (enr.source as string | undefined) ??
    (payload.source as string | undefined) ??
    null
  );
}

async function main(): Promise<void> {
  const parentPageId = process.env.NOTION_PARENT_PAGE_INTERNAL_PIPELINE;
  if (!parentPageId) {
    throw new Error('NOTION_PARENT_PAGE_INTERNAL_PIPELINE not set');
  }
  const existingDb = process.env.NOTION_DB_INTERNAL_PIPELINE;

  let databaseId: string;
  if (existingDb) {
    // eslint-disable-next-line no-console
    console.log(`reusing existing NOTION_DB_INTERNAL_PIPELINE=${existingDb}`);
    databaseId = existingDb;
  } else {
    // eslint-disable-next-line no-console
    console.log(`creating new database under parent ${parentPageId} ...`);
    const created = await createInternalPipelineDatabase(parentPageId);
    databaseId = created.databaseId;
    // eslint-disable-next-line no-console
    console.log(`OK: database ${databaseId} created`);
    if (created.url) {
      // eslint-disable-next-line no-console
      console.log(`     url: ${created.url}`);
    }
    // eslint-disable-next-line no-console
    console.log(`     set NOTION_DB_INTERNAL_PIPELINE=${databaseId} in Vercel production`);
  }

  const admin = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: orgRow, error: orgErr } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'internal')
    .single();
  if (orgErr || !orgRow) {
    throw new Error(`internal org: ${orgErr?.message ?? 'no row'}`);
  }
  const orgId = (orgRow as { id: string }).id;

  const { data: deals, error: dealsErr } = await admin
    .from('deals')
    .select('id, pipeline_stage, project:projects!project_id(id, title, score, raw_payload, organization_id)')
    .limit(10000);
  if (dealsErr) throw new Error(`deals fetch: ${dealsErr.message}`);

  const rows = ((deals ?? []) as DealJoinRow[]).filter(
    (r) => r.project && r.project.organization_id === orgId,
  );

  // eslint-disable-next-line no-console
  console.log(`seeding ${rows.length} pages ...`);

  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.project) continue;
    const snapshot: DealSnapshot = {
      dealId: row.id,
      projectId: row.project.id,
      companyName: row.project.title ?? '(unknown)',
      score: row.project.score,
      serviceCategory: readServiceCategory(row.project.raw_payload),
      hq: readHq(row.project.raw_payload),
      source: readSource(row.project.raw_payload),
      dealStage: row.pipeline_stage as DealJoinRow['pipeline_stage'] as
        | 'NEW'
        | 'CONTACTED'
        | 'REPLIED'
        | 'MEETING'
        | 'PROPOSAL'
        | 'WON'
        | 'LOST',
    };

    // Skip if mapping already exists.
    const { data: existingMapping } = await admin
      .from('notion_pipeline_pages')
      .select('notion_page_id')
      .eq('deal_id', row.id)
      .maybeSingle();
    if (existingMapping) {
      skipped++;
      continue;
    }

    const client = notionClient();
    const page = await (client as unknown as {
      pages: {
        create: (args: {
          parent: { type: 'database_id'; database_id: string };
          properties: Record<string, unknown>;
        }) => Promise<{ id: string }>;
      };
    }).pages.create({
      parent: { type: 'database_id', database_id: databaseId },
      properties: pagePropertiesFor(snapshot, BASE_PATHFINDER_URL) as Record<string, unknown>,
    });
    await recordMapping(row.id, page.id, 'seed');
    created++;
    if (created % 25 === 0) {
      // eslint-disable-next-line no-console
      console.log(`  ${created} pages created ...`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`OK: created ${created} pages, skipped ${skipped} already-mapped (database ${databaseId})`);
}

void main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
