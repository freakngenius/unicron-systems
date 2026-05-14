// Custom node renderers for the Architect Canvas Flowchart.
// All styling uses v3 light tokens (--v3-surface, --v3-line, --v3-ink, --v3-blue,
// --v3-orange, --v3-purple). Layer-distinguishing accents pull from the v3 palette.

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ArchitectNodeData } from './architectCanvasLayout';

const ACCENT_BY_LAYER: Record<number, string> = {
  0: 'var(--v3-blue)',     // sources
  1: 'var(--v3-purple)',   // L2 watchers
  2: 'var(--v3-orange)',   // L3
  3: 'var(--v3-green)',    // L4
  4: 'var(--v3-blue)',     // dashboard (terminal)
};

function rectStyle(layer: number): React.CSSProperties {
  return {
    background: 'var(--v3-surface)',
    color: 'var(--v3-ink)',
    border: `1px solid var(--v3-line)`,
    borderTop: `3px solid ${ACCENT_BY_LAYER[layer] ?? 'var(--v3-line)'}`,
    borderRadius: 8,
    padding: '10px 14px',
    minWidth: 160,
    boxShadow: '0 1px 2px rgba(11,21,48,0.04)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    lineHeight: 1.35,
    cursor: 'pointer',
  };
}

function handleStyle(): React.CSSProperties {
  return {
    background: 'var(--v3-blue)',
    border: '1px solid var(--v3-surface)',
    width: 8,
    height: 8,
  };
}

export function DataSourceNode({ data }: NodeProps<{ data: ArchitectNodeData } & ArchitectNodeData>) {
  // React Flow passes data as the prop's `data` key, not nested.
  // The `data` prop is already typed as ArchitectNodeData.
  const d = data as unknown as ArchitectNodeData;
  return (
    <div data-testid={`arch-node-source-${d.label}`} style={rectStyle(0)}>
      <div style={{ fontWeight: 600, letterSpacing: 0.2 }}>{d.label}</div>
      {d.sublabel ? (
        <div style={{ color: 'var(--v3-ink-lo)', marginTop: 2, fontSize: 11 }}>
          {d.sublabel}
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} style={handleStyle()} isConnectable={false} />
    </div>
  );
}

export function AgentNode({ data }: NodeProps<{ data: ArchitectNodeData } & ArchitectNodeData>) {
  const d = data as unknown as ArchitectNodeData;
  return (
    <div data-testid={`arch-node-agent-${d.label}`} style={rectStyle(d.layer)}>
      <div style={{ fontWeight: 600 }}>{d.label}</div>
      {d.sublabel ? (
        <div style={{ color: 'var(--v3-ink-lo)', marginTop: 2, fontSize: 11 }}>
          {d.sublabel}
        </div>
      ) : null}
      <Handle type="target" position={Position.Top} style={handleStyle()} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={handleStyle()} isConnectable={false} />
    </div>
  );
}

export function DashboardNode({ data }: NodeProps<{ data: ArchitectNodeData } & ArchitectNodeData>) {
  const d = data as unknown as ArchitectNodeData;
  return (
    <div
      data-testid="arch-node-dashboard"
      style={{
        background: 'var(--v3-surface)',
        color: 'var(--v3-ink)',
        border: `2px solid var(--v3-blue)`,
        borderRadius: '999px',
        width: 150,
        height: 150,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '14px',
        textAlign: 'center',
        boxShadow: '0 2px 8px rgba(11,21,48,0.06)',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13 }}>{d.label}</div>
      {d.sublabel ? (
        <div style={{ color: 'var(--v3-ink-lo)', marginTop: 4, fontSize: 10, lineHeight: 1.3 }}>
          {truncate(d.sublabel, 50)}
        </div>
      ) : null}
      <Handle type="target" position={Position.Top} style={handleStyle()} isConnectable={false} />
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}
