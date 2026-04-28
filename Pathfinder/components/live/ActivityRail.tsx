'use client';

// ActivityRail — bottom-right tail-f log of `pathfinder.agent_log`.
// Default state: collapsed single-line preview (380px wide × 36px tall).
// Expanded:  full-width drawer at bottom (200px tall).
// Each line: `[HH:MM:SS] computer/<agent> → <event_data.text>`.
// Newest-first; capped at 120 events buffered. Old lines fade in opacity.
//
// Publishes its height through `setRailHeight()` so other panels can offset.
// Visual structure stays 1:1 with hifi-live.jsx ActivityRail.

import React, { useEffect } from 'react';

import { agentTint, AGENTS, PF_TINTS } from '@/lib/agent-tints';
import { setRailHeight, useAgentLog, useLiveKeyframes } from '@/lib/realtime';
import type { AgentLogRow, AgentName } from '@/lib/types';
import { LastIngestCounter } from './LastIngestCounter';
import { PulsingDot } from './PulsingDot';

export interface ActivityRailProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

function logLineText(row: AgentLogRow): string {
  const data = row.event_data ?? {};
  if (typeof data === 'object' && data && 'text' in data && typeof (data as { text: unknown }).text === 'string') {
    return (data as { text: string }).text;
  }
  // Fallback: synthesize a one-liner from event_type + a short JSON tail.
  const head = row.event_type || 'event';
  const tail = (() => {
    try {
      const s = JSON.stringify(data);
      return s.length > 120 ? `${s.slice(0, 117)}...` : s;
    } catch {
      return '';
    }
  })();
  return tail && tail !== '{}' ? `${head} · ${tail}` : head;
}

function fmtClock(ts: string | Date): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function ActivityRail({ open, setOpen }: ActivityRailProps) {
  useLiveKeyframes();
  const log = useAgentLog();

  useEffect(() => {
    setRailHeight(open ? 216 : 52); // panel height + 16 gap (or 36 + 16)
  }, [open]);

  const lastLine = log[0]
    ? `computer/${log[0].agent_name} · ${logLineText(log[0])}`
    : '—';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'absolute',
          right: 16,
          bottom: 16,
          width: 380,
          height: 36,
          padding: '0 14px',
          background: PF_TINTS.bg,
          border: `1px solid ${PF_TINTS.ruleSoft}`,
          borderRadius: PF_TINTS.r.md,
          boxShadow: PF_TINTS.shadow.sm,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          zIndex: 4,
          textAlign: 'left',
        }}
      >
        <PulsingDot color={PF_TINTS.warm} />
        <span className="pf-label" style={{ color: PF_TINTS.ink, flexShrink: 0 }}>
          Agent log
        </span>
        <span
          className="pf-mono"
          style={{
            fontSize: 10,
            color: PF_TINTS.inkDim,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {lastLine}
        </span>
        <span
          className="pf-mono"
          style={{ fontSize: 11, color: PF_TINTS.inkDim, flexShrink: 0 }}
        >
          ↑
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 16,
        height: 200,
        background: PF_TINTS.bg,
        border: `1px solid ${PF_TINTS.ruleSoft}`,
        borderRadius: PF_TINTS.r.md,
        boxShadow: PF_TINTS.shadow.md,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 5,
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${PF_TINTS.ruleSoft}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <PulsingDot color={PF_TINTS.warm} />
        <span className="pf-label" style={{ color: PF_TINTS.ink }}>
          Agent log
        </span>
        <span className="pf-mono" style={{ fontSize: 10, color: PF_TINTS.inkDim }}>
          tail -f /computer/agent_log · {log.length} events buffered
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <LastIngestCounter small />
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: PF_TINTS.inkDim,
              font: `500 14px ${PF_TINTS.mono}`,
              padding: '0 4px',
            }}
          >
            ↓
          </button>
        </span>
      </div>
      <div
        className="pf-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 14px',
          font: `400 11px/1.55 ${PF_TINTS.mono}`,
          color: PF_TINTS.ink,
        }}
      >
        {log.length === 0 ? (
          <div style={{ color: PF_TINTS.inkDim, padding: '6px 0' }}>
            no agent_log events yet · waiting for the next Computer cycle
          </div>
        ) : (
          log.map((e, i) => {
            const ag = AGENTS[e.agent_name as AgentName];
            const tint = agentTint(e.agent_name);
            // Mono-ink agents (Adjacent) get a subtle dim treatment so they
            // still read as a tagged agent, just without a hue claim.
            const prefixColor = ag && ag.tintKey ? tint : PF_TINTS.inkSub;
            return (
              <div
                key={e.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '78px 158px 1fr',
                  columnGap: 12,
                  padding: '2px 0',
                  opacity: i === 0 ? 1 : Math.max(0.45, 1 - i * 0.018),
                }}
              >
                <span style={{ color: PF_TINTS.inkDim }}>{fmtClock(e.ts)}</span>
                <span
                  style={{
                    color: prefixColor,
                    fontWeight: 500,
                    opacity: 0.85,
                    letterSpacing: '0.01em',
                  }}
                >
                  computer/{e.agent_name} →
                </span>
                <span style={{ color: PF_TINTS.ink }}>{logLineText(e)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ActivityRail;
