import { assertServer } from "@/lib/server-guard";
assertServer("lib/patterns/beehive/notion");

import { notion } from "@/lib/notion";
import { getNotionDbId } from "@/lib/notion-ids";
import { logger } from "@/lib/logger";
import type { CopyOutput } from "./schemas";

export async function writeNotionRun(run_id: string, input_url: string, copy: CopyOutput) {
  const dbId = await getNotionDbId("pipeline_runs");
  if (!dbId) {
    logger.warn("notion pipeline_runs DB not configured; skipping mirror", { run_id });
    return;
  }
  const emailBody = [copy.line1, copy.line2, copy.line3, "", copy.cta].join("\n");
  try {
    await notion().pages.create({
      parent: { database_id: dbId },
      properties: {
        "Input URL": { title: [{ type: "text", text: { content: input_url } }] },
        Status: { select: { name: "succeeded" } },
        Subject: { rich_text: [{ type: "text", text: { content: copy.subject } }] },
        "Final Email": { rich_text: [{ type: "text", text: { content: emailBody.slice(0, 1999) } }] },
        "Completed At": { date: { start: new Date().toISOString() } },
        "Run ID": { rich_text: [{ type: "text", text: { content: run_id } }] },
      } as never,
    });
  } catch (e) {
    logger.error("beehive notion mirror failed", { err: String(e), run_id });
  }
}
