// Infinite-canvas top-down flowchart visualizing an Architect decomposition.
// Replaces the static circle on the Architect decomposition view.
//
// Renders:
//   - Top row: data source nodes (rectangle, labeled)
//   - Middle rows: L2 watcher → L3 → L4 agent nodes (layer-colored)
//   - Bottom: dashboard circle (terminal)
//   - Edges: source→watcher (matched by source_type), then bipartite layer→layer
//
// Interactions:
//   - fitView on initial render
//   - + / − zoom buttons bottom-left
//   - click-drag background to pan
//   - click any node → ArchitectNodeDetailModal opens

import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  type NodeMouseHandler,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DecompositionArchitecture } from '../../lib/contracts/architect';
import {
  buildArchitectGraph,
  type ArchitectNodeData,
  type ArchitectNodeDetail,
} from './architectCanvasLayout';
import { AgentNode, DashboardNode, DataSourceNode } from './ArchitectCanvasNodes';
import { ArchitectNodeDetailModal } from './ArchitectNodeDetailModal';

type Props = {
  architecture: DecompositionArchitecture | null;
  /** Optional placeholder shown when the architecture has not yet streamed in. */
  loadingLabel?: string;
  /**
   * When true the canvas drops its rounded border + radius so it can be
   * flush-attached to the edge of a layout pane (SPEC v2). When omitted the
   * canvas renders as a standalone card with a v3 border (back-compat).
   */
  edgeAttached?: boolean;
};

const nodeTypes: NodeTypes = {
  dataSource: DataSourceNode,
  agent: AgentNode,
  dashboard: DashboardNode,
};

export function ArchitectCanvas({ architecture, loadingLabel, edgeAttached }: Props) {
  const { nodes, edges } = useMemo(() => {
    if (!architecture) return { nodes: [], edges: [] };
    return buildArchitectGraph(architecture);
  }, [architecture]);

  const [selectedDetail, setSelectedDetail] = useState<ArchitectNodeDetail | null>(null);

  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const data = node.data as ArchitectNodeData | undefined;
    if (data?.detail) setSelectedDetail(data.detail);
  }, []);

  const isEmpty = nodes.length === 0;

  return (
    <div
      data-testid="architect-canvas"
      style={{
        width: '100%',
        height: '100%',
        minHeight: edgeAttached ? 0 : 420,
        position: 'relative',
        background: 'var(--v3-bg-soft)',
        border: edgeAttached ? 'none' : '1px solid var(--v3-line)',
        borderRadius: edgeAttached ? 0 : 12,
        overflow: 'hidden',
      }}
    >
      {isEmpty ? (
        <div
          data-testid="architect-canvas-empty"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--v3-ink-lo)',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          {loadingLabel ?? 'Architect · awaiting decomposition'}
        </div>
      ) : (
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.18, includeHiddenNodes: false }}
            onNodeClick={handleNodeClick}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnDrag={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { stroke: 'var(--v3-blue)', strokeWidth: 1.4 },
            }}
            style={{ background: 'var(--v3-bg-soft)' }}
          >
            <Background color="var(--v3-line)" gap={20} size={1} />
            <Controls
              position="bottom-left"
              showInteractive={false}
              showFitView={true}
              data-testid="architect-canvas-controls"
            />
          </ReactFlow>
        </ReactFlowProvider>
      )}

      {selectedDetail ? (
        <ArchitectNodeDetailModal
          detail={selectedDetail}
          onClose={() => setSelectedDetail(null)}
        />
      ) : null}
    </div>
  );
}
