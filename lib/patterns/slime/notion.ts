import { assertServer } from "@/lib/server-guard";
assertServer("lib/patterns/slime/notion");

import { supabaseService } from "@/lib/supabase";
import { notion } from "@/lib/notion";
import { getNotionDbId } from "@/lib/notion-ids";
import { logger } from "@/lib/logger";

export async function writeFinalDecisions(run_id: string) {
  const dbId = await getNotionDbId("vertical_decisions");
  if (!dbId) {
    logger.warn("notion vertical_decisions DB not configured; skipping mirror", { run_id });
    return;
  }
  const db = supabaseService();
  const { data: run } = await db.from("selection_runs").select("*").eq("id", run_id).maybeSingle();
  if (!run) return;
  const { data: winners } = await db
    .from("candidates")
    .select("*")
    .eq("run_id", run_id)
    .eq("alive", true);
  for (const w of winners ?? []) {
    const { data: events } = await db
      .from("score_events")
      .select("cycle,score,reasoning,criteria_breakdown")
      .eq("candidate_id", w.id)
      .order("cycle", { ascending: true });
    const reasoningTrail = (events ?? [])
      .map((e) => `cycle ${e.cycle}: ${Number(e.score).toFixed(0)} — ${e.reasoning}`)
      .join("\n\n")
      .slice(0, 1999);
    const ctx = (w.context as { tam_usd?: string }) ?? {};
    try {
      await notion().pages.create({
        parent: { database_id: dbId },
        properties: {
          Hypothesis: { title: [{ type: "text", text: { content: w.hypothesis } }] },
          "Composite Score": { number: w.current_score ?? 0 },
          TAM: { rich_text: [{ type: "text", text: { content: ctx.tam_usd ?? "" } }] },
          Reasoning: { rich_text: [{ type: "text", text: { content: reasoningTrail } }] },
          Cycle: { number: run.current_cycle },
          "Run ID": { rich_text: [{ type: "text", text: { content: run.id } }] },
        } as never,
      });
    } catch (e) {
      logger.error("slime notion mirror failed", { err: String(e), run_id, candidate_id: w.id });
    }
  }
}
