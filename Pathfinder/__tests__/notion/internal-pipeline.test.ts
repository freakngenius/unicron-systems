// __tests__/notion/internal-pipeline.test.ts, Stream G.
//
// Pure tests for the Internal Pipeline Notion sync helpers. No live
// Notion or Supabase calls. The webhook signature path and the Supabase
// mapping ops are covered separately in __tests__/api/.

import { describe, expect, it } from 'vitest';

import {
  INTERNAL_STAGE_TO_NOTION,
  NOTION_STAGE_OPTIONS,
  NOTION_STAGE_TO_INTERNAL,
  PROP,
  databaseSchemaProperties,
  dealStageToNotion,
  notionStageToDeal,
  pagePropertiesFor,
  type DealSnapshot,
} from '@/lib/notion/internal-pipeline';
import {
  INTERNAL_PIPELINE_STAGES,
  type InternalPipelineStage,
} from '@/lib/catalog/modules/pipeline-kanban/internalStageMap';
import type { DealPipelineStage } from '@/lib/types';

describe('stage maps are bijective across the seven stages', () => {
  it('NOTION_STAGE_OPTIONS has the seven expected names', () => {
    expect(NOTION_STAGE_OPTIONS).toHaveLength(7);
    expect(new Set(NOTION_STAGE_OPTIONS).size).toBe(7);
  });

  it('every InternalPipelineStage maps to a unique NotionStageOption', () => {
    const seen = new Set<string>();
    for (const stage of INTERNAL_PIPELINE_STAGES) {
      const notion = INTERNAL_STAGE_TO_NOTION[stage];
      expect(notion, `missing notion for ${stage}`).toBeDefined();
      expect(seen.has(notion), `duplicate notion ${notion}`).toBe(false);
      seen.add(notion);
    }
    expect(seen.size).toBe(7);
  });

  it('every NotionStageOption reverses back to its InternalPipelineStage', () => {
    for (const stage of INTERNAL_PIPELINE_STAGES) {
      const notion = INTERNAL_STAGE_TO_NOTION[stage];
      expect(NOTION_STAGE_TO_INTERNAL[notion]).toBe(stage);
    }
  });

  it('dealStageToNotion / notionStageToDeal round-trip for every DealPipelineStage', () => {
    const dealStages: DealPipelineStage[] = ['NEW', 'CONTACTED', 'REPLIED', 'MEETING', 'PROPOSAL', 'WON', 'LOST'];
    for (const ds of dealStages) {
      const notion = dealStageToNotion(ds);
      const back = notionStageToDeal(notion);
      expect(back, `round-trip failed for ${ds}`).toBe(ds);
    }
  });

  it('notionStageToDeal returns null for unknown names', () => {
    expect(notionStageToDeal('Not a real stage')).toBeNull();
    expect(notionStageToDeal('')).toBeNull();
  });
});

describe('databaseSchemaProperties shape matches Notion API contract', () => {
  it('declares the eight expected properties with the right primitive kinds', () => {
    const schema = databaseSchemaProperties();
    expect(Object.keys(schema).sort()).toEqual(
      [PROP.company, PROP.score, PROP.serviceCategory, PROP.stage, PROP.hq, PROP.source, PROP.detail, PROP.dealId].sort(),
    );
    // Title goes to Company; Score is a number; Stage is a select with
    // exactly the seven option names.
    expect(schema[PROP.company]).toEqual({ title: {} });
    expect(schema[PROP.score]).toEqual({ number: { format: 'number' } });
    expect(schema[PROP.detail]).toEqual({ url: {} });
    expect(schema[PROP.dealId]).toEqual({ rich_text: {} });
    const stageOptions = ((schema[PROP.stage] as { select: { options: { name: string }[] } }).select.options).map((o) => o.name);
    expect(stageOptions.sort()).toEqual([...NOTION_STAGE_OPTIONS].sort());
  });
});

describe('pagePropertiesFor renders a clean Notion API payload', () => {
  const base: DealSnapshot = {
    dealId: 'deal-uuid-123',
    projectId: 'usaspending:ABC:C',
    companyName: 'ACME Construction',
    score: 87,
    serviceCategory: 'general-contractor',
    hq: 'Houston, TX',
    source: 'usaspending',
    dealStage: 'CONTACTED',
  };

  it('builds Company title, Score number, Stage select, Detail url, Deal ID rich_text', () => {
    const props = pagePropertiesFor(base, 'https://internal.unicron.systems/pathfinder') as Record<string, any>;
    expect(props[PROP.company].title[0].text.content).toBe('ACME Construction');
    expect(props[PROP.score].number).toBe(87);
    expect(props[PROP.stage].select.name).toBe('Contacted');
    expect(props[PROP.detail].url).toBe(
      'https://internal.unicron.systems/pathfinder/internal/leads/usaspending%3AABC%3AC',
    );
    expect(props[PROP.dealId].rich_text[0].text.content).toBe('deal-uuid-123');
    expect(props[PROP.serviceCategory].select.name).toBe('general-contractor');
    expect(props[PROP.hq].rich_text[0].text.content).toBe('Houston, TX');
    expect(props[PROP.source].rich_text[0].text.content).toBe('usaspending');
  });

  it('omits Score when null and leaves optional rich_text fields out when null', () => {
    const props = pagePropertiesFor(
      { ...base, score: null, hq: null, source: null, serviceCategory: null },
      'https://x.example/pathfinder/',
    ) as Record<string, any>;
    expect(props[PROP.score]).toBeUndefined();
    expect(props[PROP.hq]).toBeUndefined();
    expect(props[PROP.source]).toBeUndefined();
    expect(props[PROP.serviceCategory]).toBeUndefined();
    // Trailing slash on the base url is normalized.
    expect(props[PROP.detail].url).toBe('https://x.example/pathfinder/internal/leads/usaspending%3AABC%3AC');
  });

  it('falls back to (unknown) when companyName is empty', () => {
    const props = pagePropertiesFor({ ...base, companyName: '' }, 'https://x.example') as Record<string, any>;
    expect(props[PROP.company].title[0].text.content).toBe('(unknown)');
  });

  it('maps every DealPipelineStage onto the Stage select', () => {
    const stages: DealPipelineStage[] = ['NEW', 'CONTACTED', 'REPLIED', 'MEETING', 'PROPOSAL', 'WON', 'LOST'];
    for (const s of stages) {
      const props = pagePropertiesFor({ ...base, dealStage: s }, 'https://x.example') as Record<string, any>;
      expect(props[PROP.stage].select.name).toBe(dealStageToNotion(s));
    }
  });

  it('uses the configured base url for the Detail link', () => {
    const props = pagePropertiesFor(base, 'https://other.example/pf') as Record<string, any>;
    expect(props[PROP.detail].url.startsWith('https://other.example/pf/internal/leads/')).toBe(true);
  });

  // Stage selection always maps to one of the canonical Notion options.
  it('Stage value is always in NOTION_STAGE_OPTIONS', () => {
    const stages: InternalPipelineStage[] = [...INTERNAL_PIPELINE_STAGES];
    for (const s of stages) {
      const ds: DealPipelineStage = ({
        'new-outreach-ready': 'NEW',
        contacted: 'CONTACTED',
        'in-conversation': 'REPLIED',
        'demo-scheduled': 'MEETING',
        proposal: 'PROPOSAL',
        won: 'WON',
        lost: 'LOST',
      } as Record<InternalPipelineStage, DealPipelineStage>)[s];
      const props = pagePropertiesFor({ ...base, dealStage: ds }, 'https://x.example') as Record<string, any>;
      expect((NOTION_STAGE_OPTIONS as readonly string[]).includes(props[PROP.stage].select.name)).toBe(true);
    }
  });
});
