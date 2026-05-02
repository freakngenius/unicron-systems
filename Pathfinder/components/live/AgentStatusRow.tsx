'use client';

// AgentStatusRow — four-cell agent fleet strip + multi-model routing.
// Lives at top: 76, left: 16, right: 16 with the dark slate background
// (`#0e1116`) so it visually pairs with the map. Publishes its computed
// height through `setHeaderHeight()` so BranchDock + ProjectList know
// where to start.
//
// Layer-1 surfaces Ingestor / Ranker / Verifier / Adjacent. The Verifier
// sits next to Ranker because they're a Generator-Verifier pair. The
// 8-cell 2-row grid is Layer 2 Liveness's job — single row works here.
//
// Visual structure stays 1:1 with hifi-live.jsx AgentStatusRow.

import React, { useEffect, useState } from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { setHeaderHeight, useAgentRuns, useAgentAggregates, useEscalations } from '@/lib/realtime';
import { useSettings } from '@/lib/settings';
import type { AgentName } from '@/lib/types';
import { AgentCell, deriveCellData } from './AgentCell';
import { ModelRoutingStrip } from './ModelRoutingStrip';

export interface AgentStatusRowProps {
  /** Optional override for the routing strip's initial collapsed state. */
  initialCollapsed?: boolean;
}

export function AgentStatusRow({ initialCollapsed = true }: AgentStatusRowProps) {
  const runs = useAgentRuns();
  const aggregates = useAgentAggregates();
  const escalations = useEscalations();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // Operator-only toggle (Settings → Display). When false (the customer-
  // facing default), the model-routing strip is hidden entirely and the
  // header shrinks to just the four agent cells.
  const showModelBar = useSettings().showModelBar;

  const AGENTS_H = 64;
  // Expanded MODEL_H sized to fit ~10 model rows (header + footer + a few
  // px buffer). Each row is ~14px; cumulative model_calls today shows up to
  // 6 distinct names but Pulse/Briefing additions may push it higher.
  // When the operator toggle is off, MODEL_H collapses to 0 and the strip
  // doesn't render — the header becomes just the four agent cells.
  const MODEL_H = !showModelBar ? 0 : collapsed ? 28 : 200;
  const TOTAL = AGENTS_H + MODEL_H;

  useEffect(() => {
    // 76 (top offset) + TOTAL + 16 gap = where dock/list should start.
    setHeaderHeight(76 + TOTAL + 16);
  }, [TOTAL]);

  // 5-cell single row per Kyle 2026-04-28. Outreach sits between Verifier
  // and Adjacent (it's the next-after-verify step in the agent pipeline).
  // 5 × 20% width holds at 1280px+; if a future tier adds more cells, the
  // row drops to a 2-row grid (Layer 2 Liveness's job, see file header).
  const cellOrder: AgentName[] = ['ingestor', 'ranker', 'verifier', 'outreach', 'adjacent'];

  return (
    <div
      style={{
        position: 'absolute',
        top: 76,
        left: 16,
        right: 16,
        height: TOTAL,
        background: PF_TINTS.mapBg,
        border: `1px solid ${hexAlpha('#ffffff', 0.10)}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.sm,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 4,
        overflow: 'hidden',
        transition: 'height 180ms ease',
      }}
    >
      <div style={{ height: AGENTS_H, display: 'flex', alignItems: 'stretch' }}>
        {cellOrder.map((id, i) => (
          <AgentCell
            key={id}
            id={id}
            data={deriveCellData(id, runs[id], {
              escalatedCount: id === 'verifier' ? escalations.length : undefined,
              recordsToday: aggregates[id]?.recordsToday,
              recordsWeek: aggregates[id]?.recordsWeek,
            })}
            showDivider={i > 0}
          />
        ))}
      </div>
      {showModelBar && (
        <ModelRoutingStrip collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      )}
    </div>
  );
}

export default AgentStatusRow;
