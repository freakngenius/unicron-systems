import { assertServer } from "@/lib/server-guard";
assertServer("lib/patterns/colony/notion");

import { supabaseService } from "@/lib/supabase";
import { notion } from "@/lib/notion";
import { getNotionDbId } from "@/lib/notion-ids";
import { logger } from "@/lib/logger";

export async function writeNotionJob(job_id: string) {
  const dbId = await getNotionDbId("swarm_jobs");
  if (!dbId) {
    logger.warn("notion swarm_jobs DB not configured; skipping mirror", { job_id });
    return;
  }
  const db = supabaseService();
  const { data: job } = await db.from("swarm_jobs").select("*").eq("id", job_id).maybeSingle();
  if (!job) return;
  const { data: clusters } = await db.from("swarm_clusters").select("*").eq("job_id", job_id).order("size", { ascending: false });
  const clusterSummary = (clusters ?? [])
    .map((c) => `• ${c.theme} (${c.size})`)
    .join("\n")
    .slice(0, 1999);
  try {
    await notion().pages.create({
      parent: { database_id: dbId },
      properties: {
        Market: { title: [{ type: "text", text: { content: job.market_query } }] },
        "Target Count": { number: job.target_count },
        Clusters: { rich_text: [{ type: "text", text: { content: clusterSummary } }] },
        "Completed At": { date: { start: job.completed_at ?? new Date().toISOString() } },
        "Job ID": { rich_text: [{ type: "text", text: { content: job.id } }] },
      } as never,
    });
  } catch (e) {
    logger.error("colony notion mirror failed", { err: String(e), job_id });
  }
}
