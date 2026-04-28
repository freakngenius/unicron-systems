'use client';

// AgentCell — one of the three cells in the agent status row.
// Shows: agent name, status pill, 2-3 monospaced metrics (last cycle,
// records, avg latency). Status / metrics derive from the latest run row
// in `pathfinder.agent_runs` for the agent.
//
// Visual structure stays 1:1 with the prototype (hifi-live.jsx, AgentCell).

import React from 'react';

import { AGENTS, agentTintOnMap, PF_TINTS, hexAlpha } from '@/lib/agent-tints';
import type { AgentName, AgentRun } from '@/lib/types';
import { StatusPill } from './StatusPill';

// ────────────────────────────────────────────────────────────────────────
// Live cell shape — what the row needs to render. `runs` rows on their
// own don't have everything, so we accept either a derived `AgentCellData`
// (what the prototype called `_agents.<id>`) or build one from `AgentRun`.
// ────────────────────────────────────────────────────────────────────────

export interface AgentCellData {
  status: 'running' | 'idle' | 'scheduled' | 'failed';
  /** seconds since last cycle. -1 means "no recent run" → renders as em-dash. */
  lastCycleSec: number;
  /** ingestor: records this cycle. ranker: 0 if idle. adjacent: unused. */
  recordsThisCycle?: number;
  /** ranker: ranked today (rolling). */
  rankedToday?: number;
  /** ingestor: records today (rolling). */
  recordsToday?: number;
  /** verifier: projects verified in the latest run. */
  verifiedToday?: number;
  /** verifier: projects with verifier_pass_count >= 2 (escalated to human). */
  escalatedCount?: number;
  /** adjacent: humanized next-run label, e.g. 'fri 09:00 utc'. */
  nextRunLabel?: string;
  /** adjacent: targets surfaced last week. */
  targetsLastWeek?: number;
  /** average latency in ms (ingestor + ranker only). */
  latMs?: number;
}

export interface AgentCellProps {
  id: AgentName;
  data: AgentCellData;
  showDivider: boolean;
}

const AGENT_TOOLTIPS: Record<AgentName, string> = {
  ingestor:
    'Ingestor — runs every 6h. Pulls new construction permits, federal contracts, SAM.gov solicitations, and Google News mentions. Correlates them into one project record per opportunity.',
  ranker:
    'Ranker — every 30 min. Routes each record through cheap classifiers, then Claude Sonnet for the rationale + outreach hook. Writes the score, branch match, and warm-intro signal back to the project row.',
  adjacent:
    'Adjacent Discovery — weekly. Researches multi-branch field-sales orgs in the same shape as Zedcor (specialty trades, restoration, multi-location services) and surfaces them as new outreach targets.',
  // Layer-2 / Layer-3 agents — Agent Status row expansion lands later (see
  // docs/PLAN-AGENTS.md §4.2). Tooltips are stubbed so the AgentName union
  // type-checks; rendering for these cells is a Liveness-Subagent task.
  verifier:
    'Verifier — event-driven. Runs after the Ranker writes. Checks rationale, branch attribution, score sensibility, and customer references. Generator-Verifier pattern.',
  outreach:
    'Outreach — drafts personalized email / LinkedIn / voicemail copy per ranked project. Ships into ProjectModal as expandable channel tabs.',
  pulse:
    'Pulse — observes rep behavior and ranking outcomes; proposes scoring-config tunings for human approval.',
  competitive:
    'Competitive — surfaces competitor contract trends per geography. Anchored to BranchDock.',
  briefing:
    'Briefing — synthesizes weekly org-wide and per-branch briefs. Delivered to Slack + email.',
  'customer-intel':
    'Customer Intel — flags expansion / M&A / hiring / incident / filing / press signals on existing customers; renders icons on the customer map layer.',
  eval:
    'Eval — weekly retrospective against ground-truth seeds. Scores would-have-caught rate. System-meta pill in the TopBar.',
};

export function AgentCell({ id, data, showDivider }: AgentCellProps) {
  const ag = AGENTS[id];
  const tint = agentTintOnMap(id);
  const isRunning = data.status === 'running';
  const metrics = metricsFor(id, data);

  return (
    <div
      style={{
        flex: 1,
        padding: '8px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        position: 'relative',
        minWidth: 0,
      }}
    >
      {showDivider && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 12,
            bottom: 12,
            width: 1,
            background: 'rgba(255,255,255,0.10)',
          }}
        />
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'help',
        }}
        title={AGENT_TOOLTIPS[id]}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isRunning ? (ag.tintKey ? tint : '#e6e9ef') : 'rgba(255,255,255,0.20)',
            boxShadow: isRunning
              ? `0 0 0 3px ${hexAlpha(ag.tintKey ? tint : '#e6e9ef', 0.18)}`
              : 'none',
            animation: isRunning ? 'pf-pulse 1200ms ease-in-out infinite' : 'none',
          }}
        />
        <span
          style={{
            font: `600 13px ${PF_TINTS.sans}`,
            color: ag.tintKey ? tint : PF_TINTS.mapInk,
            letterSpacing: '0.02em',
          }}
        >
          {ag.label}
        </span>
        <span style={{ flex: 1 }} />
        <StatusPill status={data.status} tint={ag.tintKey ? tint : null} />
      </div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'baseline' }}>
        {metrics.map((m, i) => (
          <div
            key={i}
            style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}
          >
            <span
              className="pf-mono"
              style={{
                fontSize: 13,
                color: PF_TINTS.mapInk,
                lineHeight: 1.1,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {m.value}
            </span>
            <span
              className="pf-mono"
              style={{
                fontSize: 8.5,
                color: PF_TINTS.mapInkDim,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              {m.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function metricsFor(id: AgentName, d: AgentCellData): { label: string; value: string | number }[] {
  if (id === 'ingestor') {
    return [
      { label: 'last cycle', value: fmtAgo(d.lastCycleSec) },
      { label: 'records', value: d.recordsThisCycle ?? 0 },
      { label: 'avg lat', value: ((d.latMs ?? 0) / 1000).toFixed(1) + 's' },
    ];
  }
  if (id === 'ranker') {
    return [
      { label: 'last run', value: fmtAgo(d.lastCycleSec) },
      { label: 'ranked today', value: d.rankedToday ?? 0 },
      { label: 'avg lat', value: ((d.latMs ?? 0) / 1000).toFixed(1) + 's' },
    ];
  }
  if (id === 'verifier') {
    return [
      { label: 'last verify', value: fmtAgo(d.lastCycleSec) },
      { label: 'verified today', value: d.verifiedToday ?? 0 },
      { label: 'escalated', value: d.escalatedCount ?? 0 },
    ];
  }
  // adjacent
  return [
    { label: 'next run', value: d.nextRunLabel ?? '—' },
    { label: 'targets / wk', value: d.targetsLastWeek ?? 0 },
  ];
}

function fmtAgo(sec: number): string {
  if (sec < 0) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

// ────────────────────────────────────────────────────────────────────────
// Helper used by AgentStatusRow — convert an `AgentRun` row into the
// `AgentCellData` shape this component expects. Keeps the call site clean.
// ────────────────────────────────────────────────────────────────────────

/**
 * Optional extras passed in by the row container — fields that don't live
 * on `agent_runs` but the cell still needs to render. Kept as a separate
 * arg so the simple ingestor/ranker call sites stay clean while the
 * Verifier branch can pull in its escalation count.
 */
export interface DeriveCellExtras {
  /** Verifier-only: count of projects with `verifier_pass_count >= 2`. */
  escalatedCount?: number;
}

export function deriveCellData(
  id: AgentName,
  run: AgentRun | null,
  extras?: DeriveCellExtras,
): AgentCellData {
  if (id === 'adjacent') {
    // Adjacent is always a scheduled cadence; the next-run label is fixed
    // weekly per the prototype. Run state can override to 'running' / 'failed'
    // but the metrics stay schedule-shaped.
    const status: AgentCellData['status'] =
      run?.status === 'running'
        ? 'running'
        : run?.status === 'failed'
          ? 'failed'
          : 'scheduled';
    return {
      status,
      lastCycleSec: -1,
      nextRunLabel: 'fri 09:00 utc',
      targetsLastWeek: run?.records_processed ?? 0,
    };
  }

  if (!run) {
    return {
      status: 'idle',
      lastCycleSec: -1,
      recordsThisCycle: 0,
      rankedToday: 0,
      recordsToday: 0,
      verifiedToday: 0,
      escalatedCount: extras?.escalatedCount ?? 0,
      latMs: 0,
    };
  }

  const startedMs = +new Date(run.started_at);
  const completedMs = run.completed_at ? +new Date(run.completed_at) : Date.now();
  const lastCycleSec = Math.max(0, Math.floor((Date.now() - completedMs) / 1000));
  const latMs =
    run.completed_at && run.records_processed > 0
      ? Math.max(0, Math.floor((completedMs - startedMs) / Math.max(1, run.records_processed)))
      : 0;

  let status: AgentCellData['status'] = 'idle';
  if (run.status === 'running') status = 'running';
  else if (run.status === 'failed') status = 'failed';
  else status = 'idle';

  if (id === 'ingestor') {
    return {
      status,
      lastCycleSec,
      recordsThisCycle: run.records_new ?? 0,
      recordsToday: run.records_processed ?? 0,
      latMs,
    };
  }
  if (id === 'verifier') {
    // Verifier processes one project per pass; `records_processed` on the
    // latest run is "verified in this cycle". Escalations come from the
    // projects table via the `extras` arg (no `agent_runs` column for it).
    return {
      status,
      lastCycleSec,
      verifiedToday: run.records_processed ?? 0,
      escalatedCount: extras?.escalatedCount ?? 0,
    };
  }
  // ranker
  return {
    status,
    lastCycleSec,
    rankedToday: run.records_processed ?? 0,
    latMs,
  };
}

export default AgentCell;
