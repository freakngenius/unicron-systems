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
// Sprint 7.5 H1 Option 2 (2026-05-13): cron sourced from nervous_system.agents
// via generated-agent-cron.ts (rebuilt on every deploy from
// public.ns_list_agents() — see scripts/generate-agent-cron.mjs and the
// prebuild step in package.json). Fallback literal preserved so the build
// stays green if the DB is unreachable at build time.
import { agentCron } from './generated-agent-cron.js';

export const analystNightlyCron = inngest.createFunction(
  { id: 'analyst-nightly', name: 'Analyst Nightly Cron', retries: 1 },
  // Usefulness pass 2026-05-12: shifted to 05:00 ET so the digest is ready
  // before the working day starts on the east coast.
  { cron: agentCron('Analyst', 'TZ=America/New_York 0 5 * * *') },
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
// Vault embeddings rebuild — S5c
// ---------------------------------------------------------------------------

/**
 * Walk the vault tree, compute embeddings for .md files in raw/, wiki/, outputs/
 * via OpenAI text-embedding-3-small, upsert into nervous_system.vault_embeddings.
 * Idempotent via content_hash. Cron: daily at 03:30 PT.
 */
export const vaultEmbeddingsRebuildCron = inngest.createFunction(
  { id: 'vault-embeddings-rebuild-cron', name: 'Vault Embeddings Rebuild Cron', retries: 1 },
  { cron: 'TZ=America/Los_Angeles 30 3 * * *' },
  async ({ step }) => {
    const { vaultEmbeddingsRebuild } = await import('./vault-embeddings.js');
    return step.run('vault-embeddings-rebuild', () => vaultEmbeddingsRebuild());
  }
);

export const vaultEmbeddingsRebuildRun = inngest.createFunction(
  { id: 'vault-embeddings-rebuild-run', name: 'Vault Embeddings Rebuild Run', retries: 1 },
  { event: 'vault/embeddings.rebuild' },
  async ({ step }) => {
    const { vaultEmbeddingsRebuild } = await import('./vault-embeddings.js');
    return step.run('vault-embeddings-rebuild', () => vaultEmbeddingsRebuild());
  }
);

// ---------------------------------------------------------------------------
// Notion Internal Org Kanban sync — every 5 minutes
// ---------------------------------------------------------------------------

/**
 * Pulls the Internal Org Notion Kanban into nervous_system.notion_kanban_mirror
 * every 5 minutes. Atrium Work > Kanban reads from the mirror via
 * public.ns_notion_kanban_view, so the cron keeps the read view fresh without
 * the UI ever calling Notion directly.
 */
export const notionKanbanSyncCron = inngest.createFunction(
  { id: 'notion-kanban-sync-pull', name: 'Notion Kanban Sync Pull', retries: 2 },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    const { notionKanbanPull } = await import('./notion-kanban-sync.js');
    return step.run('notion-kanban-pull-internal', () => notionKanbanPull('internal', 'inngest_cron'));
  },
);

export const notionKanbanSyncRun = inngest.createFunction(
  { id: 'notion-kanban-sync-run', name: 'Notion Kanban Sync Run', retries: 1 },
  { event: 'notion-kanban/sync' },
  async ({ event, step }) => {
    const { notionKanbanPull } = await import('./notion-kanban-sync.js');
    const workspace = (event.data as { workspace?: string } | undefined)?.workspace ?? 'internal';
    return step.run('notion-kanban-pull', () => notionKanbanPull(workspace, 'inngest_cron'));
  },
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

// ---------------------------------------------------------------------------
// Slack daily scan — Stream S2
// ---------------------------------------------------------------------------

/**
 * Daily 06:00 PT scan of every bot-member Slack channel: per-channel summary,
 * action-item + decision extraction, top-theme synthesis, digest upsert.
 * Idempotent at the day level (slack_daily_digest.digest_date unique).
 */
export const slackDailyScanCron = inngest.createFunction(
  { id: 'slack-daily-scan', name: 'Slack Daily Scan Cron', retries: 1 },
  // Usefulness pass 2026-05-12: aligned with analyst-nightly at 05:00 ET so
  // the morning briefing is consistent across coasts.
  { cron: 'TZ=America/New_York 0 5 * * *' },
  async ({ step }) => {
    const { runSlackDailyScan } = await import('./slack-daily-scan.js');
    const result = await step.run('slack-daily-scan', () => runSlackDailyScan());

    // Fire S4 post-back trigger. The slack-daily-digest-post listener handles
    // the SLACK_DAILY_DIGEST_CHANNEL_ID feature-flag gate; if the env var is
    // unset the listener silently skips. No-op if S4 is not yet shipped.
    await step.sendEvent('emit-digest-posted', {
      name: 'slack/daily-digest.posted',
      data: result,
    });

    return result;
  }
);

/**
 * Manual trigger via Inngest event: slack/daily-scan.run
 * Useful from the Atrium Skills tray ("Run Slack Daily Scan") or from the
 * Inngest dashboard "Invoke" button. Accepts optional { date, dryRun } in
 * event.data.
 */
export const slackDailyScanRun = inngest.createFunction(
  { id: 'slack-daily-scan-run', name: 'Slack Daily Scan Run', retries: 1 },
  { event: 'slack/daily-scan.run' },
  async ({ event, step }) => {
    const { runSlackDailyScan } = await import('./slack-daily-scan.js');
    const data = (event.data ?? {}) as { date?: string; dryRun?: boolean };
    const result = await step.run('slack-daily-scan', () => runSlackDailyScan(data));

    if (!data.dryRun) {
      await step.sendEvent('emit-digest-posted', {
        name: 'slack/daily-digest.posted',
        data: result,
      });
    }
    return result;
  }
);

// ---------------------------------------------------------------------------
// Slack daily digest post-back — Stream S4 (optional, env-gated)
// ---------------------------------------------------------------------------

/**
 * Listens for slack/daily-digest.posted (fired by the cron + manual run on
 * completion). If SLACK_DAILY_DIGEST_CHANNEL_ID is set, posts a Block Kit
 * summary to that channel. Otherwise silently skips with a structured
 * 'skipped' return value — the listener stays registered regardless so that
 * setting the env var on Vercel "switches on" post-back without a redeploy.
 */
export const slackDailyDigestPost = inngest.createFunction(
  { id: 'slack-daily-digest-post', name: 'Slack Daily Digest Post', retries: 1 },
  { event: 'slack/daily-digest.posted' },
  async ({ event, step }) => {
    const { postSlackDailyDigest } = await import('./slack-daily-digest-post.js');
    return step.run('slack-daily-digest-post', () => postSlackDailyDigest(event.data));
  }
);

// ---------------------------------------------------------------------------
// Notion Call Transcripts sync — Stream C4 of the Calls Ingestion sprint
// ---------------------------------------------------------------------------

/**
 * Pulls the Notion Call Transcripts DB into nervous_system.calls every
 * 10 minutes. Same architecture as notionKanbanSyncCron — the mirror keeps
 * the read view fresh without the UI ever calling Notion directly.
 */
export const notionCallsSyncCron = inngest.createFunction(
  { id: 'notion-calls-sync-pull', name: 'Notion Calls Sync Pull', retries: 2 },
  { cron: '*/10 * * * *' },
  async ({ step }) => {
    const { notionCallsPull } = await import('./notion-calls-sync.js');
    return step.run('notion-calls-pull', () => notionCallsPull('inngest_cron'));
  },
);

export const notionCallsSyncRun = inngest.createFunction(
  { id: 'notion-calls-sync-run', name: 'Notion Calls Sync Run', retries: 1 },
  { event: 'notion-calls/sync' },
  async ({ step }) => {
    const { notionCallsPull } = await import('./notion-calls-sync.js');
    return step.run('notion-calls-pull', () => notionCallsPull('inngest_cron'));
  },
);

// ---------------------------------------------------------------------------
// Call action-item extraction — Stream C6 of the Calls Ingestion sprint
// ---------------------------------------------------------------------------

/**
 * Listens for `call/transcript.uploaded` events fired by lib/calls-ingest.ts
 * after a successful Notion + ledger write. Runs the LLM extractor on the
 * transcript, inserts each action item into nervous_system.action_items,
 * creates a corresponding card on the Internal Org Notion Kanban, and
 * back-links each item as a bullet on the call's Notion page.
 *
 * Idempotency: best-effort. Re-firing the event currently creates duplicate
 * action_items (no dedupe key on (call_id, title) yet — Bug Fix follow-up).
 */
export const extractCallActionItemsRun = inngest.createFunction(
  { id: 'extract-call-action-items', name: 'Extract Call Action Items', retries: 1 },
  { event: 'call/transcript.uploaded' },
  async ({ event, step }) => {
    type EventData = {
      call_id: string;
      call_notion_page_id: string;
      call_notion_url: string;
      call_title?: string | null;
      participants?: string[];
      transcript_text?: string;
      uploaded_by?: string;
    };
    const data = event.data as EventData;

    if (!data.transcript_text || !data.transcript_text.trim()) {
      return { status: 'skipped', reason: 'empty transcript_text', call_id: data.call_id };
    }

    const { runActionItemExtraction } = await import('../calls-action-item-flow.js');
    return step.run('extract-call-action-items', () =>
      runActionItemExtraction({
        call_id:             data.call_id,
        call_notion_page_id: data.call_notion_page_id,
        call_notion_url:     data.call_notion_url,
        call_title:          data.call_title ?? null,
        transcript_text:     data.transcript_text!,
        participants:        data.participants ?? [],
        uploaded_by:         data.uploaded_by,
      }),
    );
  },
);

// ---------------------------------------------------------------------------
// Calendar pull — Item 4 of the Atrium usefulness pass (2026-05-12)
// ---------------------------------------------------------------------------

/**
 * Hourly pull of every team member's Google Calendar (today + tomorrow) into
 * nervous_system.calendar_events. No-op when GOOGLE_OAUTH_CLIENT_ID/SECRET
 * are unset — see the credential-gap Bug Fix card.
 */
export const calendarPullHourlyCron = inngest.createFunction(
  { id: 'calendar-pull-hourly', name: 'Calendar Pull Hourly', retries: 1 },
  { cron: '0 * * * *' },
  async ({ step }) => {
    const { runCalendarPull } = await import('./calendar-pull.js');
    return step.run('calendar-pull', () => runCalendarPull());
  },
);

export const calendarPullRun = inngest.createFunction(
  { id: 'calendar-pull-run', name: 'Calendar Pull Run', retries: 1 },
  { event: 'calendar/pull.run' },
  async ({ step }) => {
    const { runCalendarPull } = await import('./calendar-pull.js');
    return step.run('calendar-pull', () => runCalendarPull());
  },
);

// ---------------------------------------------------------------------------
// Atrium incremental refresh — Item 7 of the usefulness pass
// ---------------------------------------------------------------------------

/**
 * Lightweight 3-hour refresh that augments today's slack_daily_digest with
 * in-progress takeaways since the last full scan. Cron times below match the
 * spec (08/11/14/17/20/23 America/New_York).
 */
export const atriumIncrementalRefreshCron = inngest.createFunction(
  { id: 'atrium-incremental-refresh', name: 'Atrium Incremental Refresh', retries: 1 },
  { cron: 'TZ=America/New_York 0 8,11,14,17,20,23 * * *' },
  async ({ step }) => {
    const { runIncrementalRefresh } = await import('./atrium-incremental-refresh.js');
    return step.run('atrium-incremental-refresh', () => runIncrementalRefresh());
  },
);

export const atriumIncrementalRefreshRun = inngest.createFunction(
  { id: 'atrium-incremental-refresh-run', name: 'Atrium Incremental Refresh Run', retries: 1 },
  { event: 'atrium/incremental-refresh.run' },
  async ({ step }) => {
    const { runIncrementalRefresh } = await import('./atrium-incremental-refresh.js');
    return step.run('atrium-incremental-refresh', () => runIncrementalRefresh());
  },
);

// ---------------------------------------------------------------------------
// Janitor — Sprint 7.5 reification
// ---------------------------------------------------------------------------

/**
 * Sweeps stale state across the platform and flags maintenance issues.
 * NEVER auto-rotates secrets — flagging only. Triggerable by event or HTTP.
 */
export const janitorSweepRun = inngest.createFunction(
  { id: 'janitor-sweep-run', name: 'Janitor Sweep Run', retries: 1 },
  { event: 'janitor/sweep.run' },
  async ({ event, step }) => {
    const { janitorSweep } = await import('./janitor.js');
    const forDate = (event.data as { for_date?: string } | undefined)?.for_date;
    return step.run('janitor-sweep', () => janitorSweep({ forDate }));
  },
);

// ---------------------------------------------------------------------------
// Curator — Sprint 7.5 reification
// ---------------------------------------------------------------------------

export const curatorSweepRun = inngest.createFunction(
  { id: 'curator-sweep-run', name: 'Curator Sweep Run', retries: 1 },
  { event: 'curator/sweep.run' },
  async ({ event, step }) => {
    const { curatorSweep } = await import('./curator.js');
    const forDate = (event.data as { for_date?: string } | undefined)?.for_date;
    return step.run('curator-sweep', () => curatorSweep({ forDate }));
  },
);
