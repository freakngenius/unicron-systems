// lib/catalog/modules/pipeline-kanban/PipelineKanbanModule.tsx, Stream D.
//
// Server entry for the pipeline-kanban catalog module (slot pipeline.board).
// Hydrates the org's deals joined with projects, buckets them by the
// Internal pipeline stage taxonomy (via DEAL_TO_INTERNAL), and hands the
// pre-grouped shape to the client-island that owns drag-and-drop state.
//
// Stream A's catalog renderer hands this component the standard
// ModuleComponentProps shape: { org, architecture, config, affordances }.
// The slot is hard-gated on `data_signal/pipeline_stages` so the renderer
// only mounts this module when at least one project row exists for the org.

import * as React from 'react';

import { supabaseAdmin } from '@/lib/supabase';
import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Deal, DealPipelineStage, Project } from '@/lib/types';
import type { ModuleComponentProps } from '@/lib/catalog/types';

import { PipelineKanbanIsland, type IslandDealCard } from './PipelineKanbanIsland';
import {
  DEAL_TO_INTERNAL,
  INTERNAL_PIPELINE_STAGES,
  type InternalPipelineStage,
} from './internalStageMap';

interface RawDealRow extends Deal {
  project: {
    id: string;
    title: string | null;
    score: number | null;
    raw_payload?: Project['raw_payload'];
  } | null;
}

function readServiceCategory(project: RawDealRow['project']): string | null {
  if (!project) return null;
  const payload = (project.raw_payload as Record<string, unknown> | null) ?? {};
  const enr = (payload.internal_enrichment as Record<string, unknown> | undefined) ?? {};
  const service =
    (enr.service_category as string | undefined) ??
    (payload.internal_inferred_service_category as string | undefined) ??
    null;
  return service ?? null;
}

function bucketize(
  rows: RawDealRow[],
): Record<InternalPipelineStage, IslandDealCard[]> {
  const buckets: Record<InternalPipelineStage, IslandDealCard[]> = {
    'new-outreach-ready': [],
    contacted: [],
    'in-conversation': [],
    'demo-scheduled': [],
    proposal: [],
    won: [],
    lost: [],
  };
  for (const row of rows) {
    if (!row.project || !row.project.id) continue;
    const internalStage: InternalPipelineStage =
      DEAL_TO_INTERNAL[row.pipeline_stage as DealPipelineStage] ?? 'new-outreach-ready';
    buckets[internalStage].push({
      dealId: row.id,
      projectId: row.project.id,
      companyName: row.project.title ?? '(unknown)',
      score: row.project.score,
      serviceCategory: readServiceCategory(row.project),
      stage: internalStage,
    });
  }
  return buckets;
}

export default async function PipelineKanbanModule(
  props: ModuleComponentProps,
): Promise<React.ReactElement> {
  const architecture = props.architecture as OrgArchitecture;
  const stages = (architecture.pipeline?.stages ?? INTERNAL_PIPELINE_STAGES) as readonly string[];
  const stageLabels = (architecture.pipeline?.stage_labels ?? {}) as Record<string, string>;

  // The catalog renderer has already passed the hard gate on
  // `data_signal/pipeline_stages` for this org, so we know at least one
  // project row exists. The deal hydration may still return zero deals if
  // the digest cron has not seeded any yet; we render empty columns.
  const adminAny = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data: rows, error } = await adminAny
    .from('deals')
    .select(
      'id, project_id, owner_email, pipeline_stage, value_usd, notes, created_at, updated_at, project:projects!project_id(id, title, score, raw_payload, organization_id)',
    )
    .eq('project.organization_id', props.org.id)
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[pipeline-kanban] deal load failed for org ${props.org.slug}: ${error.message}`);
  }

  // The postgrest `eq('project.organization_id', ...)` filter only excludes
  // rows whose joined project is null when null-filter chaining is enabled;
  // we defensively drop any row whose project did not hydrate to the org.
  const orgRows: RawDealRow[] = (rows as RawDealRow[] | null ?? []).filter(
    (r): r is RawDealRow => !!r.project && (r.project as { organization_id?: string }).organization_id === props.org.id,
  );

  const initialBuckets = bucketize(orgRows);

  // Stage order respects architecture.pipeline.stages; unknown stage ids in
  // architecture are skipped so a misconfigured org never renders an
  // empty unknown-stage column.
  const orderedStages: InternalPipelineStage[] = stages
    .filter((s): s is InternalPipelineStage =>
      (INTERNAL_PIPELINE_STAGES as readonly string[]).includes(s),
    );

  return (
    <PipelineKanbanIsland
      orgSlug={props.org.slug}
      stages={orderedStages}
      stageLabels={stageLabels}
      initialBuckets={initialBuckets}
    />
  );
}
