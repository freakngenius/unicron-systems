'use client';

// StatusPill — agent status label pill. running / idle / scheduled / failed.
// Tinted only when `running` and the agent has a tint; everything else is
// monospaced gray ink. Failed earns amber.

import React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';

export type AgentStatus = 'running' | 'idle' | 'scheduled' | 'failed' | string;

export interface StatusPillProps {
  status: AgentStatus;
  /** Hex color for the running tint (Ingestor cyan, Ranker lime, Adjacent null). */
  tint?: string | null;
}

export function StatusPill({ status, tint }: StatusPillProps) {
  const map: Record<string, { color: string; label: string }> = {
    running: { color: tint || PF_TINTS.mapInk, label: 'RUNNING' },
    idle: { color: PF_TINTS.mapInkDim, label: 'IDLE' },
    scheduled: { color: PF_TINTS.mapInkDim, label: 'SCHEDULED' },
    failed: { color: '#f87171', label: 'FAILED' },
  };
  const m = map[status] || map.idle;
  return (
    <span
      className="pf-mono"
      style={{
        fontSize: 9,
        color: m.color,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
      }}
    >
      {m.label}
    </span>
  );
}

export default StatusPill;
