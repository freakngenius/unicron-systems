import { assertServer } from "@/lib/server-guard";
assertServer("lib/patterns/meta");

import { supabaseService } from "@/lib/supabase";

export type MetaSummary = {
  mycelium: {
    top_signals: { id: string; body: string; topic: string; strength: number; source_agent: string }[];
  };
  beehive: {
    latest: {
      id: string;
      input_url: string;
      status: string;
      completed_at: string | null;
      subject: string | null;
    } | null;
  };
  colony: {
    latest: {
      id: string;
      market_query: string;
      status: string;
      completed_count: number;
      target_count: number;
      clusters: { theme: string; size: number }[];
    } | null;
  };
  murmuration: {
    latest: {
      id: string;
      prompt: string;
      status: string;
      top_variants: string[];
    } | null;
  };
  slime: {
    latest: {
      id: string;
      status: string;
      current_cycle: number;
      cycles_planned: number;
      alive: { hypothesis: string; score: number | null }[];
    } | null;
  };
};

export async function getMetaSummary(): Promise<MetaSummary> {
  const db = supabaseService();

  const [myc, bee, col, mur, slm] = await Promise.all([
    db.from("signals").select("id,body,topic,strength,source_agent").eq("archived", false).order("strength", { ascending: false }).limit(3),
    db.from("pipeline_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("swarm_jobs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("flock_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("selection_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  let latestColony: MetaSummary["colony"]["latest"] = null;
  if (col.data) {
    const { data: clusters } = await db
      .from("swarm_clusters")
      .select("theme,size")
      .eq("job_id", col.data.id)
      .order("size", { ascending: false })
      .limit(4);
    latestColony = {
      id: col.data.id,
      market_query: col.data.market_query,
      status: col.data.status,
      completed_count: col.data.completed_count,
      target_count: col.data.target_count,
      clusters: (clusters ?? []).map((c) => ({ theme: c.theme, size: c.size })),
    };
  }

  let latestMurm: MetaSummary["murmuration"]["latest"] = null;
  if (mur.data) {
    const { data: finals } = await db
      .from("flock_outputs")
      .select("content,cycle,agent_idx")
      .eq("run_id", mur.data.id)
      .eq("cycle", Math.max(0, mur.data.cycles - 1))
      .order("agent_idx", { ascending: true })
      .limit(3);
    latestMurm = {
      id: mur.data.id,
      prompt: mur.data.prompt,
      status: mur.data.status,
      top_variants: (finals ?? []).map((f) => f.content),
    };
  }

  let latestSlime: MetaSummary["slime"]["latest"] = null;
  if (slm.data) {
    const { data: cands } = await db
      .from("candidates")
      .select("hypothesis,current_score")
      .eq("run_id", slm.data.id)
      .eq("alive", true)
      .order("current_score", { ascending: false });
    latestSlime = {
      id: slm.data.id,
      status: slm.data.status,
      current_cycle: slm.data.current_cycle,
      cycles_planned: slm.data.cycles_planned,
      alive: (cands ?? []).map((c) => ({ hypothesis: c.hypothesis, score: c.current_score })),
    };
  }

  let latestBee: MetaSummary["beehive"]["latest"] = null;
  if (bee.data) {
    const fo = bee.data.final_output as { subject?: string } | null;
    latestBee = {
      id: bee.data.id,
      input_url: bee.data.input_url,
      status: bee.data.status,
      completed_at: bee.data.completed_at,
      subject: fo?.subject ?? null,
    };
  }

  return {
    mycelium: {
      top_signals: (myc.data ?? []).map((s) => ({
        id: s.id,
        body: s.body,
        topic: s.topic,
        strength: Number(s.strength),
        source_agent: s.source_agent,
      })),
    },
    beehive: { latest: latestBee },
    colony: { latest: latestColony },
    murmuration: { latest: latestMurm },
    slime: { latest: latestSlime },
  };
}
