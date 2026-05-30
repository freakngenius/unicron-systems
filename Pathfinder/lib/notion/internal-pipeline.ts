// lib/notion/internal-pipeline.ts, Stream G.
//
// Notion two-way sync for the Internal Pipeline kanban. A new dedicated
// Notion database (configured via env NOTION_DB_INTERNAL_PIPELINE) mirrors
// the Internal org's deals. App drag updates flow through
// updateNotionStage(); Notion stage edits arrive on
// /api/notion/internal-pipeline/webhook and call lib/deals.moveDealStage
// with notionSyncSource='notion' so the loop terminates.
//
// This file is additive and Internal-only. It does NOT touch the existing
// dev-kanban env vars NOTION_DB_INTERNAL_KANBAN, NOTION_DB_METACRON_KANBAN,
// NOTION_DB_PATHFINDER_KANBAN, nor lib/notion/zedcor-writer.ts.

import { Client } from '@notionhq/client';

import type { DealPipelineStage } from '@/lib/types';
import type { InternalPipelineStage } from '@/lib/catalog/modules/pipeline-kanban/internalStageMap';
import { DEAL_TO_INTERNAL, INTERNAL_TO_DEAL } from '@/lib/catalog/modules/pipeline-kanban/internalStageMap';

// Notion Select option names. Title Case for human readability in the
// Notion UI. Bidirectional with InternalPipelineStage so the webhook can
// reverse-map a Notion select edit to a DealPipelineStage.
export const NOTION_STAGE_OPTIONS = [
  'New / Outreach Ready',
  'Contacted',
  'In Conversation',
  'Demo Scheduled',
  'Proposal',
  'Won',
  'Lost',
] as const;

export type NotionStageOption = (typeof NOTION_STAGE_OPTIONS)[number];

export const INTERNAL_STAGE_TO_NOTION: Record<InternalPipelineStage, NotionStageOption> = {
  'new-outreach-ready': 'New / Outreach Ready',
  contacted: 'Contacted',
  'in-conversation': 'In Conversation',
  'demo-scheduled': 'Demo Scheduled',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};

export const NOTION_STAGE_TO_INTERNAL: Record<NotionStageOption, InternalPipelineStage> = {
  'New / Outreach Ready': 'new-outreach-ready',
  Contacted: 'contacted',
  'In Conversation': 'in-conversation',
  'Demo Scheduled': 'demo-scheduled',
  Proposal: 'proposal',
  Won: 'won',
  Lost: 'lost',
};

export function dealStageToNotion(stage: DealPipelineStage): NotionStageOption {
  return INTERNAL_STAGE_TO_NOTION[DEAL_TO_INTERNAL[stage]];
}

export function notionStageToDeal(name: string): DealPipelineStage | null {
  if (!(NOTION_STAGE_OPTIONS as readonly string[]).includes(name)) return null;
  const internal = NOTION_STAGE_TO_INTERNAL[name as NotionStageOption];
  return INTERNAL_TO_DEAL[internal];
}

// Property names. Kept stable; the seed script and the webhook both
// reference these.
export const PROP = {
  company: 'Company',
  score: 'Score',
  serviceCategory: 'Service category',
  stage: 'Stage',
  hq: 'HQ',
  source: 'Source',
  detail: 'Detail',
  dealId: 'Deal ID',
} as const;

// Schema for notion.databases.create. Stage uses select (universally
// available via the API). The launch prompt accepted "status/select"; we
// pick select for reliability.
export function databaseSchemaProperties() {
  return {
    [PROP.company]: { title: {} },
    [PROP.score]: { number: { format: 'number' as const } },
    [PROP.serviceCategory]: { select: { options: [] } },
    [PROP.stage]: {
      select: {
        options: NOTION_STAGE_OPTIONS.map((name) => ({ name })),
      },
    },
    [PROP.hq]: { rich_text: {} },
    [PROP.source]: { rich_text: {} },
    [PROP.detail]: { url: {} },
    [PROP.dealId]: { rich_text: {} },
  };
}

// Page properties for a single deal. Used by both the seed script and
// the on-drag sync path (the latter via updateNotionStage which only
// touches Stage; this builder is for create + initial sync).
export interface DealSnapshot {
  dealId: string;
  projectId: string;
  companyName: string;
  score: number | null;
  serviceCategory: string | null;
  hq: string | null;
  source: string | null;
  dealStage: DealPipelineStage;
}

export function pagePropertiesFor(deal: DealSnapshot, basePathfinderUrl: string) {
  const detailUrl = `${basePathfinderUrl.replace(/\/$/, '')}/internal/leads/${encodeURIComponent(deal.projectId)}`;
  const props: Record<string, unknown> = {
    [PROP.company]: {
      title: [{ type: 'text', text: { content: deal.companyName || '(unknown)' } }],
    },
    [PROP.stage]: { select: { name: dealStageToNotion(deal.dealStage) } },
    [PROP.detail]: { url: detailUrl },
    [PROP.dealId]: {
      rich_text: [{ type: 'text', text: { content: deal.dealId } }],
    },
  };
  if (deal.score !== null && Number.isFinite(deal.score)) {
    props[PROP.score] = { number: deal.score };
  }
  if (deal.serviceCategory) {
    props[PROP.serviceCategory] = { select: { name: deal.serviceCategory } };
  }
  if (deal.hq) {
    props[PROP.hq] = {
      rich_text: [{ type: 'text', text: { content: deal.hq } }],
    };
  }
  if (deal.source) {
    props[PROP.source] = {
      rich_text: [{ type: 'text', text: { content: deal.source } }],
    };
  }
  return props;
}

// Single shared client. Lazy so build environments without
// NOTION_API_KEY do not crash on import.
let _client: Client | null = null;
export function notionClient(): Client {
  if (_client) return _client;
  const auth = process.env.NOTION_API_KEY;
  if (!auth) {
    throw new Error('NOTION_API_KEY not set');
  }
  _client = new Client({ auth });
  return _client;
}

export interface CreateDatabaseResult {
  databaseId: string;
  url: string;
}

export async function createInternalPipelineDatabase(parentPageId: string): Promise<CreateDatabaseResult> {
  const client = notionClient();
  const res = await (client as unknown as {
    databases: {
      create: (args: {
        parent: { type: 'page_id'; page_id: string };
        title: Array<{ type: 'text'; text: { content: string } }>;
        properties: Record<string, unknown>;
      }) => Promise<{ id: string; url?: string }>;
    };
  }).databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: 'Internal Pipeline' } }],
    properties: databaseSchemaProperties() as Record<string, unknown>,
  });
  return { databaseId: res.id, url: res.url ?? '' };
}

// Look up a Notion page id by deal id via the mapping table. Returns
// null if no mapping exists yet (initial seed). Uses supabaseAdmin so RLS
// does not block server-side reads.
export async function findNotionPageId(dealId: string): Promise<string | null> {
  const { supabaseAdmin } = await import('@/lib/supabase');
  const admin = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data, error } = await admin
    .from('notion_pipeline_pages')
    .select('notion_page_id')
    .eq('deal_id', dealId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[internal-pipeline] mapping read for deal ${dealId}: ${error.message}`);
    return null;
  }
  return data?.notion_page_id ?? null;
}

export async function recordMapping(dealId: string, notionPageId: string, syncedFrom: 'app' | 'notion' | 'seed'): Promise<void> {
  const { supabaseAdmin } = await import('@/lib/supabase');
  const admin = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { error } = await admin
    .from('notion_pipeline_pages')
    .upsert(
      {
        deal_id: dealId,
        notion_page_id: notionPageId,
        last_synced_at: new Date().toISOString(),
        synced_from: syncedFrom,
      },
      { onConflict: 'deal_id' },
    );
  if (error) {
    throw new Error(`recordMapping: ${error.message}`);
  }
}

// Find a deal id given a notion_page_id. Used by the webhook receiver.
export async function findDealIdByNotionPage(notionPageId: string): Promise<string | null> {
  const { supabaseAdmin } = await import('@/lib/supabase');
  const admin = supabaseAdmin() as unknown as { from: (t: string) => any };
  const { data, error } = await admin
    .from('notion_pipeline_pages')
    .select('deal_id')
    .eq('notion_page_id', notionPageId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[internal-pipeline] reverse lookup ${notionPageId}: ${error.message}`);
    return null;
  }
  return data?.deal_id ?? null;
}

// Propagate an app-side stage move to Notion. Idempotent. If no mapping
// exists yet (seed not run), this is a no-op and a warning is logged.
export async function updateNotionStage(dealId: string, toStage: DealPipelineStage): Promise<{ updated: boolean; reason?: string }> {
  if (!process.env.NOTION_DB_INTERNAL_PIPELINE) {
    return { updated: false, reason: 'NOTION_DB_INTERNAL_PIPELINE not set' };
  }
  if (!process.env.NOTION_API_KEY) {
    return { updated: false, reason: 'NOTION_API_KEY not set' };
  }
  const pageId = await findNotionPageId(dealId);
  if (!pageId) {
    return { updated: false, reason: 'no mapping for deal' };
  }
  const client = notionClient();
  await (client as unknown as {
    pages: {
      update: (args: { page_id: string; properties: Record<string, unknown> }) => Promise<unknown>;
    };
  }).pages.update({
    page_id: pageId,
    properties: {
      [PROP.stage]: { select: { name: dealStageToNotion(toStage) } },
    },
  });
  await recordMapping(dealId, pageId, 'app');
  return { updated: true };
}
