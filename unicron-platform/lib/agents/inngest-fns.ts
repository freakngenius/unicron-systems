// lib/agents/inngest-fns.ts — Sprint 3 Stream A upgrade
// Inngest function shells for persistent Unicron agents.
//
// Sprint 2 wired Orchestrator fully. Sprint 3 fills in Analyst with
// event-triggered run + 4 scheduled cron functions.
// Elder and Taboo Keeper remain placeholder shells for Sprint 3 Stream B.
//
// Event routing:
//   orchestrator/slack.event  → orchestratorRun       (Stream A Sprint 2)
//   analyst/run               → analystRun            (filled Sprint 3)
//   elder/run                 → elderRun              (placeholder — Sprint 3 Stream B)
//   taboo-keeper/validate     → tabooKeeperRun        (placeholder — Sprint 3 Stream B)
//
// Cron schedule (all PT via TZ= prefix):
//   analyst-nightly    → 02:00 PT daily
//   analyst-weekly     → 22:00 PT Sunday
//   analyst-monthly    → 01:00 PT 1st of month
//   analyst-quarterly  → 02:00 PT 1st of Jan/Apr/Jul/Oct

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
// Analyst — Sprint 3: event-triggered run
// ---------------------------------------------------------------------------

/**
 * Manually trigger analyst jobs via Inngest event: analyst/run
 * Runs decayTick + dailyDigest for on-demand execution.
 */
export const analystRun = inngest.createFunction(
  {
    id: 'analyst-run',
    name: 'Analyst Run',
    retries: 1,
  },
  { event: 'analyst/run' },
  async ({ step }) => {
    const { decayTick, dailyDigest } = await import('./analyst.js');

    const decayResult = await step.run('decay-tick', () => decayTick());
    await step.run('daily-digest', () => dailyDigest());

    return { status: 'ok', ...decayResult };
  }
);

// ---------------------------------------------------------------------------
// Analyst — Nightly cron (02:00 PT = 09:00 UTC)
// ---------------------------------------------------------------------------

/**
 * Nightly: decay signals/ledger, write daily digest, scan for drift.
 */
export const analystNightlyCron = inngest.createFunction(
  { id: 'analyst-nightly', name: 'Analyst Nightly Cron', retries: 1 },
  { cron: 'TZ=America/Los_Angeles 0 2 * * *' },
  async () => {
    const { decayTick, dailyDigest, driftFlagScan } = await import('./analyst.js');
    const decayResult = await decayTick();
    await dailyDigest();
    await driftFlagScan();
    return { status: 'ok', ...decayResult };
  }
);

// ---------------------------------------------------------------------------
// Analyst — Weekly cron (Sunday 22:00 PT)
// ---------------------------------------------------------------------------

/**
 * Weekly: retro doc, memory consolidation, rebuild master index, wiki lint.
 */
export const analystWeeklyCron = inngest.createFunction(
  { id: 'analyst-weekly', name: 'Analyst Weekly Cron', retries: 1 },
  { cron: 'TZ=America/Los_Angeles 0 22 * * 0' },
  async () => {
    const { weeklyRetro, memoryConsolidation, regenerateMasterIndex, wikiLint } =
      await import('./analyst.js');
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    await weeklyRetro({
      start: weekStart.toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
    });
    await memoryConsolidation();
    await regenerateMasterIndex();
    await wikiLint();
    return { status: 'ok' };
  }
);

// ---------------------------------------------------------------------------
// Analyst — Monthly cron (1st of month 01:00 PT)
// ---------------------------------------------------------------------------

/**
 * Monthly: continuity audit — flags Elder commitments expiring within 30 days.
 */
export const analystMonthlyCron = inngest.createFunction(
  { id: 'analyst-monthly', name: 'Analyst Monthly Cron', retries: 1 },
  { cron: 'TZ=America/Los_Angeles 0 1 1 * *' },
  async () => {
    const { continuityAudit } = await import('./analyst.js');
    await continuityAudit();
    return { status: 'ok' };
  }
);

// ---------------------------------------------------------------------------
// Analyst — Quarterly cron (1st of Jan/Apr/Jul/Oct 02:00 PT)
// ---------------------------------------------------------------------------

/**
 * Quarterly: taboo review — summarise bounce patterns from the last 90 days.
 */
export const analystQuarterlyCron = inngest.createFunction(
  { id: 'analyst-quarterly', name: 'Analyst Quarterly Cron', retries: 1 },
  { cron: 'TZ=America/Los_Angeles 0 2 1 1,4,7,10 *' },
  async () => {
    const { tabooReview } = await import('./analyst.js');
    await tabooReview();
    return { status: 'ok' };
  }
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
