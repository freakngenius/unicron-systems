import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseService } from "../lib/supabase";

async function seedMycelium() {
  const db = supabaseService();
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures/mycelium-seed.json"), "utf8"),
  ) as Array<{
    topic: string;
    type: string;
    source_agent: string;
    body: string;
    strength: number;
    days_ago: number;
    ttl_days: number;
  }>;

  const now = Date.now();
  const rows = raw.map((r) => ({
    topic: r.topic,
    type: r.type,
    source_agent: r.source_agent,
    body: r.body,
    strength: r.strength,
    ttl_days: r.ttl_days,
    last_touched: new Date(now - r.days_ago * 86_400_000).toISOString(),
    created_at: new Date(now - r.days_ago * 86_400_000).toISOString(),
  }));

  // Wipe and reload (idempotent).
  const { error: delErr } = await db.from("signals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) throw delErr;
  const { error } = await db.from("signals").insert(rows);
  if (error) throw error;
  console.log(`  ✓ mycelium: ${rows.length} signals`);
}

async function main() {
  console.log("Seeding Supabase tables…");
  await seedMycelium();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
