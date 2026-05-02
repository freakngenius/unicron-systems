'use client';

// AgentCell — one of the three cells in the agent status row.
// Shows: agent name, status pill, 2-3 monospaced metrics (last cycle,
// records, avg latency). Status / metrics derive from the latest run row
// in `pathfinder.agent_runs` for the agent.
//
// Visual structure stays 1:1 with the prototype (hifi-live.jsx, AgentCell).

import React from 'react';

import { AGENTS, agentTintOnMap, PF_TINTS } from '@/lib/agent-tints';
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
    'Ranker — every 30 min. Routes each record through a cheap classifier, then a heavier model for the rationale + outreach hook. Writes the score, branch match, and warm-intro signal back to the project row.',
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
  'contact-resolver':
    'Contact Resolver — every 10 min. Extracts source-side contacts from raw_payload on verified projects. v1 = Phase 1 only (free, no third-party API spend).',
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
            // Universal: active = runningGreen + glow + pulse. Inactive = gray, no glow, no pulse.
            background: isRunning ? PF_TINTS.runningGreen : 'rgba(255,255,255,0.20)',
            boxShadow: isRunning ? `0 0 0 3px ${PF_TINTS.runningGreenGlow}` : 'none',
            animation: isRunning ? 'pf-pulse 1200ms ease-in-out infinite' : 'none',
          }}
        />
        <span
          style={{
            font: `600 13px ${PF_TINTS.sans}`,
            // Agent name color stays per-tint — that's how the fleet stays
            // visually distinguishable. Status (active/inactive) is the
            // universal signal; identity (which agent) is the per-tint one.
            color: ag.tintKey ? tint : PF_TINTS.mapInk,
            letterSpacing: '0.02em',
          }}
        >
          {ag.label}
        </span>
        <span style={{ flex: 1 }} />
        <StatusPill status={data.status} />
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
  if (id === 'outreach') {
    return [
      { label: 'last cycle', value: fmtAgo(d.lastCycleSec) },
      { label: 'drafts today', value: d.recordsToday ?? 0 },
      { label: 'avg lat', value: ((d.latMs ?? 0) / 1000).toFixed(1) + 's' },
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
 * Verifier branch can pull in its escalation count and every cell can
 * pull in 24h/7d aggregates from `/api/agents`.
 */
export interface DeriveCellExtras {
  /** Verifier-only: count of projects with `verifier_pass_count >= 2`. */
  escalatedCount?: number;
  /** Sum of records_processed across agent_runs started in the last 24h.
   *  Used for "ranked today" / "verified today" / "records" counters so
   *  the cell shows cumulative activity rather than just the latest cycle. */
  recordsToday?: number;
  /** Sum of records_processed across agent_runs started in the last 7d.
   *  Used by Adjacent for "targets / wk". */
  recordsWeek?: number;
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
      // True 7d sum from /api/agents aggregates; falls back to the latest
      // cycle's records_processed if aggregates haven't loaded yet.
      targetsLastWeek: extras?.recordsWeek ?? run?.records_processed ?? 0,
    };
  }

  if (!run) {
    return {
      status: 'idle',
      lastCycleSec: -1,
      recordsThisCycle: extras?.recordsToday ?? 0,
      rankedToday: extras?.recordsToday ?? 0,
      recordsToday: extras?.recordsToday ?? 0,
      verifiedToday: extras?.recordsToday ?? 0,
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
      // "records" header reads as a 24h cumulative count when /api/agents
      // aggregates have loaded; falls back to records_new for this cycle.
      recordsThisCycle: extras?.recordsToday ?? run.records_new ?? 0,
      recordsToday: extras?.recordsToday ?? run.records_processed ?? 0,
      latMs,
    };
  }
  if (id === 'verifier') {
    // True 24h sum of records_processed when aggregates available; falls
    // back to the latest cycle's records_processed.
    return {
      status,
      lastCycleSec,
      verifiedToday: extras?.recordsToday ?? run.records_processed ?? 0,
      escalatedCount: extras?.escalatedCount ?? 0,
    };
  }
  if (id === 'outreach') {
    // 24h cumulative drafts produced; falls back to records_new from the
    // latest cycle. The Outreach cron writes records_new = drafted_clean
    // + drafted_with_warnings (see app/api/cron/outreach/route.ts), so
    // this counts every draft regardless of warning status.
    return {
      status,
      lastCycleSec,
      recordsToday: extras?.recordsToday ?? run.records_new ?? 0,
      latMs,
    };
  }
  // ranker
  return {
    status,
    lastCycleSec,
    rankedToday: extras?.recordsToday ?? run.records_processed ?? 0,
    latMs,
  };
}

export default AgentCell;
