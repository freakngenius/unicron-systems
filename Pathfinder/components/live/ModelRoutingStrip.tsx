'use client';

// ModelRoutingStrip — multi-model routing rollup.
//
// Pulls cumulative model-call counts from `/api/cost-summary` (which
// aggregates `pathfinder.agent_log` rows with model_used set across the
// fleet's full history). The TOTAL spent + per-lead cost are persistent —
// they survive page refreshes, new visitors, and quiet windows where no
// agent has fired in the last hour. `useModels()` is still used for the
// last-hour avg-routing-latency chip.
//
// Two layouts:
//   - collapsed: single line  → `model 124 · model 71 · ... · TOTAL · $/lead [expand]`
//   - expanded:  per-model grid breakdown with footer total + cost per ranked lead.

import React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { MODEL_META, tallyModelCost, useCostSummary, useModels } from '@/lib/realtime';
import { useSettings } from '@/lib/settings';

export interface ModelRoutingStripProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function ModelRoutingStrip({ collapsed, onToggle }: ModelRoutingStripProps) {
  // avgMs is still last-hour (it's a live latency reading, not a total).
  const { avgMs } = useModels();
  // Cumulative — counts + total_ranked from /api/cost-summary.
  const summary = useCostSummary();
  // Lead-cost gate (Settings → Display). Customer users (Zedcor side)
  // never see the toggle in /settings, so this stays false for them.
  // Operators can flip it on. Hides per-model cost column, the total
  // cost footer, and the per-lead figure when off.
  const showLeadCost = useSettings().showLeadCost;

  // Build rows from the cumulative model_calls map. Each call is priced
  // via MODEL_META; rows without a price entry render at $0 but still
  // contribute to the call count so the user sees what fired.
  const rows = Object.entries(summary.modelCalls)
    .map(([name, calls]) => {
      const meta = MODEL_META[name];
      return {
        name,
        purpose: meta?.purpose ?? 'unmapped model',
        costPerCall: meta?.costPerCall ?? 0,
        calls,
        cost: calls * (meta?.costPerCall ?? 0),
      };
    })
    .filter((r) => r.calls > 0)
    .sort((a, b) => a.costPerCall - b.costPerCall || a.name.localeCompare(b.name));

  const { totalCalls, totalCost } = tallyModelCost(summary.modelCalls);
  const cpl = summary.totalRanked > 0 ? totalCost / summary.totalRanked : 0;
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
            perplexity agents · awaiting first model_route event
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
        {showLeadCost && (
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
        )}
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
          perplexity agents · cumulative
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
          awaiting first model_route event
        </div>
      ) : (
        rows.map((r) => (
          <div
            key={r.name}
            style={{
              display: 'grid',
              gridTemplateColumns: showLeadCost ? '128px 1fr 72px 64px' : '128px 1fr 72px',
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
            {showLeadCost && (
              <span
                style={{
                  color: PF_TINTS.mapInk,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCost(r.cost)}
              </span>
            )}
          </div>
        ))
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: showLeadCost ? '128px 1fr 72px 64px' : '128px 1fr 72px',
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
        <span style={{ color: PF_TINTS.mapInkDim }}>
          {showLeadCost ? `· ${fmtCost(cpl)} per ranked lead` : ''}
        </span>
        <span style={{ color: PF_TINTS.mapInk, textAlign: 'right' }}>{totalCalls}</span>
        {showLeadCost && (
          <span
            style={{
              color: PF_TINTS.mapInk,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtCost(totalCost)}
          </span>
        )}
      </div>
    </div>
  );
}

export default ModelRoutingStrip;
