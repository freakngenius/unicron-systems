'use client';

// StatusPill — universal agent status label.
//
// Two visible states drive the demo:
//   - 'running'   → green "RUNNING" (`PF_TINTS.runningGreen`)
//   - everything else → gray "SCHEDULED" (`PF_TINTS.mapInkDim`, no glow)
//
// 'failed' is preserved as a third state with an amber-red so genuine
// failures stay distinguishable from idle/scheduled. The agent name's tint
// is independent of this pill — see `lib/agent-tints.ts` AGENTS for that.

import React from 'react';

import { PF_TINTS } from '@/lib/agent-tints';

export type AgentStatus = 'running' | 'idle' | 'scheduled' | 'failed' | string;

export interface StatusPillProps {
  status: AgentStatus;
  /** Deprecated — pill color is now universal. Prop kept for call-site
   *  back-compat; ignored. */
  tint?: string | null;
}

export function StatusPill({ status }: StatusPillProps) {
  let color: string;
  let label: string;
  if (status === 'running') {
    color = PF_TINTS.runningGreen;
    label = 'RUNNING';
  } else if (status === 'failed') {
    color = '#f87171';
    label = 'FAILED';
  } else {
    // 'idle' and 'scheduled' both render as SCHEDULED — there's no
    // visual distinction in the demo. The cron / Computer schedule is
    // the truth; in-between cycles the agent is "scheduled to run again."
    color = PF_TINTS.mapInkDim;
    label = 'SCHEDULED';
  }
  return (
    <span
      className="pf-mono"
      style={{
        fontSize: 9,
        color,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

export default StatusPill;
