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
    const ageMs = event.ts != null ? Date.now() - event.ts : 0;
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
// Elder — Sprint 3 Stream B
// ---------------------------------------------------------------------------

/**
 * Elder agent: continuity advisory — checks decisions against prior commitments.
 * Triggered via event: elder/advise
 * Event data: { decision_type: string, scope: string, summary: string }
 */
export const elderRun = inngest.createFunction(
  { id: 'elder-run', name: 'Elder Run', retries: 1 },
  { event: 'elder/advise' },
  async ({ event }) => {
    const { elderAdvise } = await import('./elder.js');
    const { decision_type, scope, summary } = event.data as {
      decision_type: string;
      scope: string;
      summary: string;
    };
    return elderAdvise(decision_type, scope, summary);
  }
);

// ---------------------------------------------------------------------------
// Taboo Keeper — Sprint 3 Stream B
// ---------------------------------------------------------------------------

/**
 * Taboo Keeper registered as an auditable Inngest agent.
 * Validates an intent against the live taboo register (wiki/memory/taboos.md).
 * Triggered via event: taboo-keeper/validate
 * Event data: { intent: string, taboos: string }
 *
 * Replicates the same claude-haiku-4-5 check used inline in orchestrator.ts
 * so the Taboo Keeper runs as a first-class registered agent with full Inngest
 * audit trail.
 */
export const tabooKeeperRun = inngest.createFunction(
  { id: 'taboo-keeper-run', name: 'Taboo Keeper Validate', retries: 0 },
  { event: 'taboo-keeper/validate' },
  async ({ event }) => {
    const { intent, taboos } = event.data as { intent: string; taboos: string };
    if (!taboos) return { verdict: 'pass' };

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: `You are a taboo checker. Given an intent and a list of taboos, return JSON: {"verdict":"pass"|"bounce","reason":"..."}.\nTaboos:\n${taboos}`,
      messages: [{ role: 'user', content: `Intent: ${intent}` }],
    });

    try {
      const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
      const match = text.match(/\{.*\}/s);
      return match ? JSON.parse(match[0]) : { verdict: 'pass' };
    } catch {
      return { verdict: 'pass' };
    }
  }
);
