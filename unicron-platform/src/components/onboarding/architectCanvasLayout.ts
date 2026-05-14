// Pure layout helpers for the Architect Canvas Flowchart.
// Takes a DecompositionArchitecture and produces top-down React Flow
// nodes + edges. No React, no DOM — testable in isolation.

import type { Node, Edge } from '@xyflow/react';
import type { DecompositionArchitecture } from '../../lib/contracts/architect';

export type ArchitectNodeKind = 'source' | 'watcher' | 'agent' | 'dashboard';

export type ArchitectNodeDetail =
  | { kind: 'source'; index: number; source: DecompositionArchitecture['data_sources_proposed'][number] }
  | { kind: 'watcher'; index: number; watcher: DecompositionArchitecture['layer_2_watchers'][number] }
  | { kind: 'agent'; layer: 3 | 4; index: number; agent: DecompositionArchitecture['layer_3_agents'][number] }
  | { kind: 'dashboard'; estimates: DecompositionArchitecture['estimates']; businessSummary: DecompositionArchitecture['business_summary'] };

export type ArchitectNodeData = {
  label: string;
  sublabel?: string;
  kind: ArchitectNodeKind;
  layer: number; // 0=source, 1=L2, 2=L3, 3=L4, 4=dashboard
  detail: ArchitectNodeDetail;
};

const ROW_GAP_Y = 130;
const COL_GAP_X = 220;
const ROW_TOP_Y = 40;

function spreadX(count: number): number[] {
  if (count <= 0) return [];
  // Center the row of nodes horizontally around 0.
  const span = (count - 1) * COL_GAP_X;
  const start = -span / 2;
  return Array.from({ length: count }, (_, i) => start + i * COL_GAP_X);
}

export function buildArchitectGraph(
  architecture: DecompositionArchitecture,
): { nodes: Node<ArchitectNodeData>[]; edges: Edge[] } {
  const sources = architecture.data_sources_proposed ?? [];
  const watchers = architecture.layer_2_watchers ?? [];
  const l3 = architecture.layer_3_agents ?? [];
  const l4 = architecture.layer_4_agents ?? [];

  const nodes: Node<ArchitectNodeData>[] = [];
  const edges: Edge[] = [];

  // Row 0: data sources.
  const srcXs = spreadX(sources.length);
  sources.forEach((s, i) => {
    nodes.push({
      id: `src-${i}`,
      type: 'dataSource',
      position: { x: srcXs[i], y: ROW_TOP_Y },
      data: {
        label: s.type,
        sublabel: s.jurisdictions?.join(', '),
        kind: 'source',
        layer: 0,
        detail: { kind: 'source', index: i, source: s },
      },
    });
  });

  // Row 1: L2 watchers.
  const w2Xs = spreadX(watchers.length);
  watchers.forEach((w, i) => {
    nodes.push({
      id: `l2-${i}`,
      type: 'agent',
      position: { x: w2Xs[i], y: ROW_TOP_Y + ROW_GAP_Y },
      data: {
        label: `L2 · ${w.source_type}`,
        sublabel: 'Watcher',
        kind: 'watcher',
        layer: 1,
        detail: { kind: 'watcher', index: i, watcher: w },
      },
    });
  });

  // Row 2: L3 agents.
  const l3Xs = spreadX(l3.length);
  l3.forEach((a, i) => {
    nodes.push({
      id: `l3-${i}`,
      type: 'agent',
      position: { x: l3Xs[i], y: ROW_TOP_Y + ROW_GAP_Y * 2 },
      data: {
        label: a.role,
        sublabel: 'L3 agent',
        kind: 'agent',
        layer: 2,
        detail: { kind: 'agent', layer: 3, index: i, agent: a },
      },
    });
  });

  // Row 3: L4 agents.
  const l4Xs = spreadX(l4.length);
  l4.forEach((a, i) => {
    nodes.push({
      id: `l4-${i}`,
      type: 'agent',
      position: { x: l4Xs[i], y: ROW_TOP_Y + ROW_GAP_Y * 3 },
      data: {
        label: a.role,
        sublabel: 'L4 agent',
        kind: 'agent',
        layer: 3,
        detail: { kind: 'agent', layer: 4, index: i, agent: a },
      },
    });
  });

  // Row 4: dashboard terminal.
  const lastLayerCount = [sources.length, watchers.length, l3.length, l4.length].filter((n) => n > 0).length;
  const dashboardY = ROW_TOP_Y + ROW_GAP_Y * (lastLayerCount > 0 ? lastLayerCount : 1);
  nodes.push({
    id: 'dashboard',
    type: 'dashboard',
    position: { x: 0, y: dashboardY },
    data: {
      label: 'Dashboard',
      sublabel: architecture.business_summary?.what_they_get ?? 'Customer surface',
      kind: 'dashboard',
      layer: 4,
      detail: {
        kind: 'dashboard',
        estimates: architecture.estimates,
        businessSummary: architecture.business_summary,
      },
    },
  });

  // Edges — Source → L2 by source_type match; bipartite fallback otherwise.
  // Then L2 → L3 → L4 → dashboard as fan-out / fan-in between adjacent layers.
  const sourceIds = sources.map((_, i) => `src-${i}`);
  const watcherIds = watchers.map((_, i) => `l2-${i}`);
  const l3Ids = l3.map((_, i) => `l3-${i}`);
  const l4Ids = l4.map((_, i) => `l4-${i}`);

  // Match each watcher to the source whose `type` equals watcher.source_type.
  // Watchers with no matching source connect from every source (fallback).
  watchers.forEach((w, wi) => {
    const matched = sources
      .map((s, si) => (s.type === w.source_type ? `src-${si}` : null))
      .filter((id): id is string => !!id);
    const upstream = matched.length > 0 ? matched : sourceIds;
    upstream.forEach((u) => {
      edges.push(edge(u, `l2-${wi}`));
    });
  });

  // Adjacent-layer bipartite for the agent layers + dashboard.
  connectLayers(watcherIds, l3Ids, edges);
  connectLayers(l3Ids, l4Ids, edges);

  // Final layer (whichever is non-empty among l4, l3, l2, sources) connects to dashboard.
  const finalLayer =
    l4Ids.length > 0 ? l4Ids :
    l3Ids.length > 0 ? l3Ids :
    watcherIds.length > 0 ? watcherIds :
    sourceIds;
  finalLayer.forEach((id) => {
    edges.push(edge(id, 'dashboard'));
  });

  return { nodes, edges };
}

function connectLayers(upstream: string[], downstream: string[], edges: Edge[]): void {
  if (upstream.length === 0 || downstream.length === 0) return;
  upstream.forEach((u) => {
    downstream.forEach((d) => {
      edges.push(edge(u, d));
    });
  });
}

function edge(source: string, target: string): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    type: 'smoothstep',
    animated: false,
  };
}
