// lib/agents/inngest-fns.ts — Sprint 2 Stream B
// Inngest function shells for persistent Unicron agents.
//
// Sprint 2 wires Orchestrator fully; Analyst, Elder, and Taboo Keeper
// are placeholder shells that will be filled in Sprint 3.
//
// Event routing:
//   orchestrator/slack.event  → orchestratorRun  (triggered by api/slack/events.ts — Stream A)
//   analyst/run               → analystRun       (placeholder — Sprint 3)
//   elder/run                 → elderRun          (placeholder — Sprint 3)
//   taboo-keeper/validate     → tabooKeeperRun    (placeholder — Sprint 3 wires full module)

import { inngest } from '../inngest/client.js';

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Subscribes to Slack events dispatched by api/slack/events.ts (Stream A).
 * Calls orchestratorProcess() which handles all 6 intent types.
 */
export const orchestratorRun = inngest.createFunction(
  {
    id: 'orchestrator-run',
    name: 'Orchestrator Run',
    retries: 2,
  },
  { event: 'orchestrator/slack.event' },
  async ({ event, step }) => {
    // Drop events older than 5 minutes — drains flood queues without spamming Slack.
    // event.ts is Unix ms when Inngest received the event.
    const ageMs = Date.now() - event.ts;
    if (ageMs > 5 * 60 * 1000) {
      console.log(`[orchestrator-run] skipping stale event age=${Math.round(ageMs / 1000)}s`);
      return { status: 'skipped', reason: 'stale', age_s: Math.round(ageMs / 1000) };
    }

    const { orchestratorProcess } = await import('./orchestrator.js');

    return step.run('orchestrator-process', () =>
      orchestratorProcess(event.data as Parameters<typeof orchestratorProcess>[0])
    );
  }
);

// ---------------------------------------------------------------------------
// Analyst — Sprint 3 placeholder
// ---------------------------------------------------------------------------

/**
 * Analyst agent: deep-dives on leads, surfaces actionable intelligence.
 * Logic ships in Sprint 3.
 */
export const analystRun = inngest.createFunction(
  {
    id: 'analyst-run',
    name: 'Analyst Run',
    retries: 1,
  },
  { event: 'analyst/run' },
  async () => ({
    status: 'not_yet_implemented',
    sprint: 3,
    note: 'Analyst agent logic ships in Sprint 3',
  })
);

// ---------------------------------------------------------------------------
// Elder — Sprint 3 placeholder
// ---------------------------------------------------------------------------

/**
 * Elder agent: long-term pattern recognition across the ledger.
 * Logic ships in Sprint 3.
 */
export const elderRun = inngest.createFunction(
  {
    id: 'elder-run',
    name: 'Elder Run',
    retries: 1,
  },
  { event: 'elder/run' },
  async () => ({
    status: 'not_yet_implemented',
    sprint: 3,
    note: 'Elder agent logic ships in Sprint 3',
  })
);

// ---------------------------------------------------------------------------
// Taboo Keeper — Sprint 3 placeholder
// ---------------------------------------------------------------------------

/**
 * Taboo Keeper Inngest function: validates actions against the taboo list.
 * The core validation function already lives at Pathfinder/lib/taboo-keeper.ts.
 * This shell allows the Orchestrator to trigger Taboo Keeper validation as a
 * separate Inngest step in Sprint 3 (currently inlined in orchestrator.ts).
 */
export const tabooKeeperRun = inngest.createFunction(
  {
    id: 'taboo-keeper-run',
    name: 'Taboo Keeper Run',
    retries: 0,
  },
  { event: 'taboo-keeper/validate' },
  async () => ({
    status: 'not_yet_implemented',
    sprint: 3,
    note: 'validateAction() lives in Pathfinder/lib/taboo-keeper.ts; wired as standalone Inngest fn in Sprint 3',
  })
);
