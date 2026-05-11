// api/inngest.ts — Sprint 2 Nervous System
// Inngest serve endpoint: registers unicron-platform functions with Inngest Cloud.
//   GET  /api/inngest → introspection (Inngest dashboard sync)
//   PUT  /api/inngest → sync (Inngest pushes function manifest to cloud)
//   POST /api/inngest → step execution (Inngest invokes a function step)
//
// Uses inngest/node (not inngest/next) because unicron-platform is Vite, not Next.js.
// bodyParser must be disabled so Inngest can read the raw request stream directly.

import { serve } from 'inngest/node';
import { inngest } from '../lib/inngest/client.js';
import {
  orchestratorRun,
  analystRun,
  analystNightlyCron,
  analystWeeklyCron,
  analystMonthlyCron,
  analystQuarterlyCron,
  elderRun,
  tabooKeeperRun,
  pathfinderSyncRun,
  pathfinderSyncCron,
  vaultStatsCron,
  vaultStatsRun,
  continuityIngestCron,
  continuityIngestRun,
  vaultEmbeddingsRebuildCron,
  vaultEmbeddingsRebuildRun,
  notionKanbanSyncCron,
  notionKanbanSyncRun,
} from '../lib/agents/inngest-fns.js';

// Disable Vercel's automatic JSON body parsing — inngest/node reads the raw stream.
export const config = { api: { bodyParser: false } };

export default serve({
  client: inngest,
  functions: [
    // Orchestrator (Sprint 2)
    orchestratorRun,
    // Analyst (Sprint 3)
    analystRun,
    analystNightlyCron,
    analystWeeklyCron,
    analystMonthlyCron,
    analystQuarterlyCron,
    // Elder + Taboo Keeper (Sprint 3 Stream B — placeholder shells)
    elderRun,
    tabooKeeperRun,
    // Pathfinder cross-project sync (S4a)
    pathfinderSyncRun,
    pathfinderSyncCron,
    // Vault stats + continuity ingestion (S4b + S4c)
    vaultStatsCron,
    vaultStatsRun,
    continuityIngestCron,
    continuityIngestRun,
    // Vault semantic search index (S5c)
    vaultEmbeddingsRebuildCron,
    vaultEmbeddingsRebuildRun,
    // Notion Internal Org Kanban bidirectional sync
    notionKanbanSyncCron,
    notionKanbanSyncRun,
  ],
});
