import { assertServer } from "@/lib/server-guard";
assertServer("lib/patterns/mycelium/promote");

import { supabaseService } from "@/lib/supabase";
import { notion } from "@/lib/notion";
import { getNotionDbId } from "@/lib/notion-ids";
import { logger } from "@/lib/logger";
import type { Signal } from "./types";

export const PROMOTE_STRENGTH_THRESHOLD = 5;
export const PROMOTE_AGE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isPromotable(s: Pick<Signal, "strength" | "created_at" | "promoted_at">) {
  if (s.promoted_at) return false;
  if (Number(s.strength) <= PROMOTE_STRENGTH_THRESHOLD) return false;
  const ageMs = Date.now() - new Date(s.created_at).getTime();
  return ageMs >= PROMOTE_AGE_DAYS * DAY_MS;
}

export async function promoteSignal(signalId: string): Promise<{ ok: true; notion_id: string } | { ok: false; reason: string }> {
  const log = logger.scoped({ pattern: "mycelium", job: "promote", signalId });
  const db = supabaseService();
  const { data: s, error } = await db.from("signals").select("*").eq("id", signalId).single();
  if (error || !s) return { ok: false, reason: "signal not found" };

  if (!isPromotable(s)) {
    return { ok: false, reason: "not yet promotable (strength or age threshold)" };
  }

  const dbId = await getNotionDbId("signals");
  if (!dbId) {
    log.warn("notion signals DB not set up; skipping promote");
    return { ok: false, reason: "notion DB not configured" };
  }

  try {
    const page = await notion().pages.create({
      parent: { database_id: dbId },
      properties: {
        Topic: { title: [{ type: "text", text: { content: s.topic } }] },
        Type: { select: { name: s.type } },
        Source: { select: { name: s.source_agent } },
        Body: { rich_text: [{ type: "text", text: { content: s.body.slice(0, 1999) } }] },
        Strength: { number: Number(s.strength) },
        "Last Touched": { date: { start: s.last_touched } },
        Created: { date: { start: s.created_at } },
        "Signal ID": { rich_text: [{ type: "text", text: { content: s.id } }] },
      } as never,
    });
    await db.from("signals").update({ promoted_at: new Date().toISOString() }).eq("id", signalId);
    log.info("promoted to Notion", { notion_id: page.id });
    return { ok: true, notion_id: page.id };
  } catch (e) {
    log.error("notion create failed", { err: e instanceof Error ? e.message : String(e) });
    return { ok: false, reason: "notion API error" };
  }
}
