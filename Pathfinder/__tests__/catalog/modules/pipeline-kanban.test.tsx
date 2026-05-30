// @vitest-environment jsdom
//
// __tests__/catalog/modules/pipeline-kanban.test.tsx, Stream D.
//
// Unit tests for the pipeline-kanban catalog module's client island.
// Asserts:
//   - INTERNAL_TO_DEAL and DEAL_TO_INTERNAL are inverse and cover all seven stages.
//   - The island renders seven columns in the right order with stage labels.
//   - A drag from one stage to another POSTs to /pathfinder/api/deals/<id>/stage
//     with the mapped DealPipelineStage and optimistically moves the card.
//   - On a non-2xx response the card snaps back to the original stage.
//   - Card click renders an href that preserves the org slug
//     (via orgPaths.leadDetail).

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
void React;

import {
  DEAL_TO_INTERNAL,
  INTERNAL_PIPELINE_STAGES,
  INTERNAL_TO_DEAL,
  type InternalPipelineStage,
} from '@/lib/catalog/modules/pipeline-kanban/internalStageMap';
import {
  PipelineKanbanIsland,
  type IslandDealCard,
} from '@/lib/catalog/modules/pipeline-kanban/PipelineKanbanIsland';
import { DEAL_PIPELINE_STAGES } from '@/lib/types';

const STAGE_LABELS: Record<string, string> = {
  'new-outreach-ready': 'New / Outreach Ready',
  contacted: 'Contacted',
  'in-conversation': 'In conversation',
  'demo-scheduled': 'Demo scheduled',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};

function emptyBuckets(): Record<InternalPipelineStage, IslandDealCard[]> {
  return {
    'new-outreach-ready': [],
    contacted: [],
    'in-conversation': [],
    'demo-scheduled': [],
    proposal: [],
    won: [],
    lost: [],
  };
}

function card(overrides: Partial<IslandDealCard> = {}): IslandDealCard {
  return {
    dealId: 'deal-1',
    projectId: 'p1',
    companyName: 'Acme Site Services',
    score: 80,
    serviceCategory: 'temp-fence',
    stage: 'new-outreach-ready',
    ...overrides,
  };
}

describe('internalStageMap', () => {
  it('covers every Internal stage and maps to a DealPipelineStage', () => {
    expect(INTERNAL_PIPELINE_STAGES).toHaveLength(7);
    for (const s of INTERNAL_PIPELINE_STAGES) {
      const mapped = INTERNAL_TO_DEAL[s];
      expect(DEAL_PIPELINE_STAGES).toContain(mapped);
    }
  });

  it('round-trips: DEAL_TO_INTERNAL is the inverse of INTERNAL_TO_DEAL', () => {
    for (const s of INTERNAL_PIPELINE_STAGES) {
      expect(DEAL_TO_INTERNAL[INTERNAL_TO_DEAL[s]]).toBe(s);
    }
  });

  it('targets new-outreach-ready when seeding the new-verified loader', () => {
    expect(INTERNAL_TO_DEAL['new-outreach-ready']).toBe('NEW');
  });
});

let container: HTMLDivElement;
let root: Root;
let fetchSpy: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

function render(node: React.ReactElement): void {
  act(() => {
    root.render(node);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchSpy = vi.fn();
  global.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  global.fetch = originalFetch;
});

describe('PipelineKanbanIsland render', () => {
  it('renders seven columns in declared stage order with the right labels', () => {
    const buckets = emptyBuckets();
    buckets['new-outreach-ready'] = [card()];
    render(
      <PipelineKanbanIsland
        orgSlug="internal"
        stages={INTERNAL_PIPELINE_STAGES}
        stageLabels={STAGE_LABELS}
        initialBuckets={buckets}
      />,
    );
    const columns = Array.from(
      container.querySelectorAll<HTMLElement>('[data-pipeline-column]'),
    );
    expect(columns).toHaveLength(7);
    expect(columns.map((c) => c.getAttribute('data-pipeline-column'))).toEqual(
      INTERNAL_PIPELINE_STAGES.slice(),
    );
    const firstHeader = columns[0].querySelector('header')?.textContent ?? '';
    expect(firstHeader).toContain('New / Outreach Ready');
    expect(firstHeader).toContain('1');
  });

  it('renders card links via orgPaths.leadDetail so the slug is intact', () => {
    const buckets = emptyBuckets();
    buckets['new-outreach-ready'] = [card({ projectId: 'propublica:824334368' })];
    render(
      <PipelineKanbanIsland
        orgSlug="internal"
        stages={INTERNAL_PIPELINE_STAGES}
        stageLabels={STAGE_LABELS}
        initialBuckets={buckets}
      />,
    );
    const link = container.querySelector<HTMLAnchorElement>('[data-pipeline-card]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe(
      '/internal/leads/propublica%3A824334368',
    );
  });
});

describe('PipelineKanbanIsland drag persistence', () => {
  function dropCard(opts: { dealId: string; toColumnStage: InternalPipelineStage }) {
    const data = new Map<string, string>();
    data.set('text/plain', opts.dealId);
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      dropEffect: 'move',
      effectAllowed: 'move',
    } as unknown as DataTransfer;

    const sourceCard = container.querySelector<HTMLElement>(
      `[data-pipeline-card="${opts.dealId}"]`,
    );
    if (!sourceCard) throw new Error(`source card ${opts.dealId} not found`);
    const targetColumn = container.querySelector<HTMLElement>(
      `[data-pipeline-column="${opts.toColumnStage}"]`,
    );
    if (!targetColumn) throw new Error(`target column ${opts.toColumnStage} not found`);

    act(() => {
      const dragStart = new Event('dragstart', { bubbles: true });
      Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer });
      sourceCard.dispatchEvent(dragStart);
    });
    act(() => {
      const dropEvt = new Event('drop', { bubbles: true });
      Object.defineProperty(dropEvt, 'dataTransfer', { value: dataTransfer });
      targetColumn.dispatchEvent(dropEvt);
    });
  }

  it('POSTs the mapped DealPipelineStage and optimistically moves the card', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ deal: { id: 'deal-1', pipeline_stage: 'CONTACTED' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const buckets = emptyBuckets();
    buckets['new-outreach-ready'] = [card()];
    render(
      <PipelineKanbanIsland
        orgSlug="internal"
        stages={INTERNAL_PIPELINE_STAGES}
        stageLabels={STAGE_LABELS}
        initialBuckets={buckets}
      />,
    );

    dropCard({ dealId: 'deal-1', toColumnStage: 'contacted' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/pathfinder/api/deals/deal-1/stage');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ to_stage: 'CONTACTED' });

    // Optimistic: card already moved before fetch resolves.
    const moved = container.querySelector<HTMLElement>('[data-pipeline-card="deal-1"]');
    expect(moved?.getAttribute('data-pipeline-stage')).toBe('contacted');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const stillThere = container.querySelector<HTMLElement>(
      '[data-pipeline-card="deal-1"]',
    );
    expect(stillThere?.getAttribute('data-pipeline-stage')).toBe('contacted');
  });

  it('reverts the optimistic move when the API returns a non-2xx', async () => {
    fetchSpy.mockResolvedValue(
      new Response('forbidden', { status: 403 }),
    );

    const buckets = emptyBuckets();
    buckets['new-outreach-ready'] = [card()];
    render(
      <PipelineKanbanIsland
        orgSlug="internal"
        stages={INTERNAL_PIPELINE_STAGES}
        stageLabels={STAGE_LABELS}
        initialBuckets={buckets}
      />,
    );

    dropCard({ dealId: 'deal-1', toColumnStage: 'contacted' });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const reverted = container.querySelector<HTMLElement>(
      '[data-pipeline-card="deal-1"]',
    );
    expect(reverted?.getAttribute('data-pipeline-stage')).toBe('new-outreach-ready');
    const errorBanner = container.querySelector('[data-pipeline-kanban-error]');
    expect(errorBanner).not.toBeNull();
  });

  it('is a no-op when dropping into the same column', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    const buckets = emptyBuckets();
    buckets['new-outreach-ready'] = [card()];
    render(
      <PipelineKanbanIsland
        orgSlug="internal"
        stages={INTERNAL_PIPELINE_STAGES}
        stageLabels={STAGE_LABELS}
        initialBuckets={buckets}
      />,
    );
    dropCard({ dealId: 'deal-1', toColumnStage: 'new-outreach-ready' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
