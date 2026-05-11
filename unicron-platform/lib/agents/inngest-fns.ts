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
  async ({ step }) => {
    const { decayTick, dailyDigest, driftFlagScan, analystWikiSync } = await import('./analyst.js');
    const decayResult = await step.run('decay-tick', () => decayTick());
    await step.run('daily-digest', () => dailyDigest());
    await step.run('drift-flag-scan', () => driftFlagScan());
    // Sprint 6 Stream C: regenerate whats-connected.md from live Supabase data
    await step.run('wiki-sync', () => analystWikiSync());
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

// ---------------------------------------------------------------------------
// Pathfinder cross-project sync — S4a
// ---------------------------------------------------------------------------

/**
 * Polls the Pathfinder Supabase project (separate ref) via service-role
 * client and upserts summary metrics into nervous_system.pathfinder_sync.
 * Degrades to an audit_log row when PATHFINDER_SUPABASE_URL or
 * PATHFINDER_SUPABASE_SERVICE_ROLE_KEY is absent.
 *
 * Event-triggered: pathfinder/sync
 * Cron: every 30 minutes
 */
export const pathfinderSyncRun = inngest.createFunction(
  { id: 'pathfinder-sync-run', name: 'Pathfinder Sync Run', retries: 1 },
  { event: 'pathfinder/sync' },
  async ({ step }) => {
    const { pathfinderSync } = await import('./pathfinder-sync.js');
    return step.run('pathfinder-sync', () => pathfinderSync());
  }
);

export const pathfinderSyncCron = inngest.createFunction(
  { id: 'pathfinder-sync-cron', name: 'Pathfinder Sync Cron', retries: 1 },
  { cron: '*/30 * * * *' },
  async ({ step }) => {
    const { pathfinderSync } = await import('./pathfinder-sync.js');
    return step.run('pathfinder-sync', () => pathfinderSync());
  }
);

// ---------------------------------------------------------------------------
// Vault stats + continuity ingestion — S4b + S4c
// ---------------------------------------------------------------------------

/**
 * Polls the unicron-knowledge vault, counts docs per Karpathy folder
 * (raw/, wiki/, outputs/), and tracks last-commit recency.
 * Cron: every hour at :05.
 */
export const vaultStatsCron = inngest.createFunction(
  { id: 'vault-stats-cron', name: 'Vault Stats Cron', retries: 1 },
  { cron: '5 * * * *' },
  async ({ step }) => {
    const { vaultStatsSync } = await import('./vault-ingest.js');
    return step.run('vault-stats-sync', () => vaultStatsSync());
  }
);

export const vaultStatsRun = inngest.createFunction(
  { id: 'vault-stats-run', name: 'Vault Stats Run', retries: 1 },
  { event: 'vault/stats.sync' },
  async ({ step }) => {
    const { vaultStatsSync } = await import('./vault-ingest.js');
    return step.run('vault-stats-sync', () => vaultStatsSync());
  }
);

/**
 * Pulls wiki/memory/elder/continuity.md, parses entries, upserts new ones
 * into nervous_system.continuity_log. Idempotent via entry_hash.
 * Cron: every hour at :15.
 */
export const continuityIngestCron = inngest.createFunction(
  { id: 'continuity-ingest-cron', name: 'Continuity Ingest Cron', retries: 1 },
  { cron: '15 * * * *' },
  async ({ step }) => {
    const { continuityIngest } = await import('./vault-ingest.js');
    return step.run('continuity-ingest', () => continuityIngest());
  }
);

export const continuityIngestRun = inngest.createFunction(
  { id: 'continuity-ingest-run', name: 'Continuity Ingest Run', retries: 1 },
  { event: 'continuity/ingest' },
  async ({ step }) => {
    const { continuityIngest } = await import('./vault-ingest.js');
    return step.run('continuity-ingest', () => continuityIngest());
  }
);
