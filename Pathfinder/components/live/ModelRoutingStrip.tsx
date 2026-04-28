'use client';

// ModelRoutingStrip — multi-model routing rollup for the last hour.
// Reads call counts from `pathfinder.agent_log` rows where
// `event_type='model_route'` and `model_used` is set.
//
// Two layouts:
//   - collapsed: single line  → `model 124 · model 71 · ... · TOTAL · $/lead [expand]`
//   - expanded:  per-model grid breakdown with footer total + cost per ranked lead.
//
// Visual structure stays 1:1 with hifi-live.jsx ModelRoutingStrip.

import React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { MODEL_META, useModels } from '@/lib/realtime';

export interface ModelRoutingStripProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function ModelRoutingStrip({ collapsed, onToggle }: ModelRoutingStripProps) {
  const { models, avgMs, ranked } = useModels();
  // Rows from MODEL_META, skip zero calls, sort cheapest → most expensive.
  const rows = Object.entries(MODEL_META)
    .map(([name, meta]) => {
      const calls = models[name] || 0;
      return { name, ...meta, calls, cost: calls * meta.costPerCall };
    })
    .filter((r) => r.calls > 0)
    .sort((a, b) => a.costPerCall - b.costPerCall);

  const totalCalls = rows.reduce((s, r) => s + r.calls, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const cpl = ranked > 0 ? totalCost / ranked : 0;
  const fmtCost = (n: number): string => (n === 0 ? '$0.00' : `$${n.toFixed(n < 0.01 ? 4 : 2)}`);

  const Chev = (
    <button
      onClick={onToggle}
      title={collapsed ? 'Expand routing detail' : 'Collapse routing detail'}
      style={{
        background: hexAlpha('#ffffff', 0.06),
        border: `1px solid ${hexAlpha('#ffffff', 0.10)}`,
        cursor: 'pointer',
        color: PF_TINTS.mapInk,
        font: `500 9px ${PF_TINTS.mono}`,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '3px 8px',
        borderRadius: 3,
        lineHeight: 1,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {collapsed ? 'expand' : 'collapse'}
      <span style={{ fontSize: 10, lineHeight: 1 }}>{collapsed ? '▾' : '▴'}</span>
    </button>
  );

  if (collapsed) {
    return (
      <div
        style={{
          height: 28,
          padding: '0 12px 0 16px',
          borderTop: `1px solid ${hexAlpha('#ffffff', 0.06)}`,
          background: hexAlpha('#000000', 0.18),
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        {rows.length === 0 ? (
          <span
            className="pf-mono"
            style={{
              fontSize: 10,
              color: PF_TINTS.mapInkDim,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            perplexity agents · awaiting routing telemetry
          </span>
        ) : (
          rows.map((r) => (
            <span
              key={r.name}
              className="pf-mono"
              style={{
                fontSize: 10,
                color: PF_TINTS.mapInk,
                letterSpacing: '0.01em',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {r.name}{' '}
              <span style={{ color: PF_TINTS.mapInkDim, marginLeft: 3 }}>{r.calls}</span>
            </span>
          ))
        )}
        <span style={{ flex: 1 }} />
        <span
          className="pf-mono"
          style={{
            fontSize: 9,
            color: PF_TINTS.mapInkDim,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          total <span style={{ color: PF_TINTS.mapInk, marginLeft: 4 }}>{fmtCost(totalCost)}</span>
          <span style={{ marginLeft: 8 }}>·</span>
          <span
            style={{
              marginLeft: 8,
              color: PF_TINTS.mapInk,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtCost(cpl)}
          </span>
          <span style={{ marginLeft: 4 }}>per lead</span>
        </span>
        {Chev}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '8px 12px 10px 16px',
        borderTop: `1px solid ${hexAlpha('#ffffff', 0.06)}`,
        background: hexAlpha('#000000', 0.18),
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          className="pf-mono"
          style={{
            fontSize: 8.5,
            color: PF_TINTS.mapInkDim,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          perplexity agents · last hour
        </span>
        <span style={{ flex: 1 }} />
        <span
          className="pf-mono"
          style={{
            fontSize: 8.5,
            color: PF_TINTS.mapInkDim,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          avg routing ·{' '}
          <span style={{ color: PF_TINTS.mapInk }}>{(avgMs / 1000).toFixed(1)}s</span>
        </span>
        {Chev}
      </div>

      {rows.length === 0 ? (
        <div
          className="pf-mono"
          style={{
            fontSize: 10,
            color: PF_TINTS.mapInkDim,
            letterSpacing: '0.04em',
            padding: '6px 0',
          }}
        >
          no model_route events in the last hour
        </div>
      ) : (
        rows.map((r) => (
          <div
            key={r.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '128px 1fr 72px 64px',
              columnGap: 12,
              alignItems: 'baseline',
              font: `400 10px ${PF_TINTS.mono}`,
              color: PF_TINTS.mapInk,
              letterSpacing: '0.01em',
              lineHeight: 1.3,
            }}
          >
            <span style={{ color: PF_TINTS.mapInk }}>{r.name}</span>
            <span style={{ color: PF_TINTS.mapInkDim }}>· {r.purpose}</span>
            <span style={{ color: PF_TINTS.mapInk, textAlign: 'right' }}>
              {r.calls} <span style={{ color: PF_TINTS.mapInkDim }}>calls</span>
            </span>
            <span
              style={{
                color: PF_TINTS.mapInk,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtCost(r.cost)}
            </span>
          </div>
        ))
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '128px 1fr 72px 64px',
          columnGap: 12,
          alignItems: 'baseline',
          font: `500 10px ${PF_TINTS.mono}`,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          lineHeight: 1.3,
          marginTop: 2,
          paddingTop: 4,
          borderTop: `1px dashed ${hexAlpha('#ffffff', 0.08)}`,
        }}
      >
        <span style={{ color: PF_TINTS.mapInkDim }}>total</span>
        <span style={{ color: PF_TINTS.mapInkDim }}>· {fmtCost(cpl)} per ranked lead</span>
        <span style={{ color: PF_TINTS.mapInk, textAlign: 'right' }}>{totalCalls}</span>
        <span
          style={{
            color: PF_TINTS.mapInk,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtCost(totalCost)}
        </span>
      </div>
    </div>
  );
}

export default ModelRoutingStrip;
