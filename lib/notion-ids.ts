import { assertServer } from "./server-guard";
assertServer("lib/notion-ids");
import { supabaseService } from "./supabase";

export type NotionKey =
  | "signals"
  | "pipeline_runs"
  | "swarm_jobs"
  | "flock_runs"
  | "vertical_decisions";

let _cache: Partial<Record<NotionKey, string>> = {};

export async function getNotionDbId(key: NotionKey): Promise<string | null> {
  if (_cache[key]) return _cache[key]!;
  const db = supabaseService();
  const { data } = await db.from("notion_meta").select("database_id").eq("key", key).maybeSingle();
  if (data?.database_id) {
    _cache[key] = data.database_id;
    return data.database_id;
  }
  return null;
}

export async function setNotionDbId(key: NotionKey, database_id: string): Promise<void> {
  const db = supabaseService();
  await db.from("notion_meta").upsert({ key, database_id });
  _cache[key] = database_id;
}

export function clearNotionCache() {
  _cache = {};
}
