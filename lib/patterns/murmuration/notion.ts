import { assertServer } from "@/lib/server-guard";
assertServer("lib/patterns/murmuration/notion");

import { supabaseService } from "@/lib/supabase";
import { notion } from "@/lib/notion";
import { getNotionDbId } from "@/lib/notion-ids";
import { logger } from "@/lib/logger";
import { convergenceHeat } from "./heat";
import type { Output } from "./peers";

export async function writeNotionFlock(run_id: string) {
  const dbId = await getNotionDbId("flock_runs");
  if (!dbId) {
    logger.warn("notion flock_runs DB not configured; skipping mirror", { run_id });
    return;
  }
  const db = supabaseService();
  const { data: run } = await db.from("flock_runs").select("*").eq("id", run_id).maybeSingle();
  if (!run) return;
  const { data: outs } = await db
    .from("flock_outputs")
    .select("*")
    .eq("run_id", run_id)
    .order("cycle", { ascending: true });

  const finalCycle = (run.cycles ?? 5) - 1;
  const finals = (outs ?? [])
    .filter((o) => o.cycle === finalCycle)
    .slice(0, 3)
    .map((o, i) => `${i + 1}. ${o.content}`)
    .join("\n");
  const heat = convergenceHeat((outs ?? []) as Output[], run.cycles);

  try {
    await notion().pages.create({
      parent: { database_id: dbId },
      properties: {
        Prompt: { title: [{ type: "text", text: { content: run.prompt.slice(0, 199) } }] },
        Cycles: { number: run.cycles },
        "Top Variants": { rich_text: [{ type: "text", text: { content: finals.slice(0, 1999) } }] },
        Convergence: { number: Number(heat.toFixed(3)) },
        "Run ID": { rich_text: [{ type: "text", text: { content: run.id } }] },
      } as never,
    });
  } catch (e) {
    logger.error("murmuration notion mirror failed", { err: String(e), run_id });
  }
}
