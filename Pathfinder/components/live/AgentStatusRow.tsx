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

  const AGENTS_H = 64;
  const MODEL_H = collapsed ? 28 : 92;
  const TOTAL = AGENTS_H + MODEL_H;

  useEffect(() => {
    // 76 (top offset) + TOTAL + 16 gap = where dock/list should start.
    setHeaderHeight(76 + TOTAL + 16);
  }, [TOTAL]);

  const cellOrder: AgentName[] = ['ingestor', 'ranker', 'verifier', 'adjacent'];

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
      <ModelRoutingStrip collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
    </div>
  );
}

export default AgentStatusRow;
