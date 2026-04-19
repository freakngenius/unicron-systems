import { z } from "zod";
import { callJSON, DEFAULT_SONNET } from "@/lib/anthropic";
import { supabaseService } from "@/lib/supabase";
import { runWithConcurrency } from "@/lib/patterns/colony/semaphore";
import { logger } from "@/lib/logger";
import { selectPeers, type Output } from "./peers";

export type { Output };

const VariantOut = z.object({
  variant: z.string().min(2).max(400),
});

async function generateVariant(
  agent_idx: number,
  cycle: number,
  prompt: string,
  peers: Output[],
): Promise<string> {
  const peerText = peers.length
    ? peers.map((p) => `- "${p.content}"`).join("\n")
    : "(no peer variants yet)";
  const out = await callJSON(
    {
      model: DEFAULT_SONNET,
      max_tokens: 240,
      temperature: 0.85,
      system:
        `You are agent ${agent_idx} in a flock of 7. The flock is co-writing headline variants.\n` +
        "You see the most recent peer variants. You MUST produce one that is inspired but distinct.\n" +
        "Hard rule: differentiate from peers — don't re-say their phrasing. Keep it punchy (< 14 words).\n" +
        "Return strict JSON: {variant: string}.",
      user: `PROMPT: ${prompt}\n\nPEER VARIANTS:\n${peerText}\n\nProduce your variant.`,
    },
    VariantOut,
  );
  return out.variant;
}

export async function runFlock(run_id: string, prompt: string, agent_count: number, peer_n: number, cycles: number) {
  const log = logger.scoped({ pattern: "murmuration", run_id });
  const db = supabaseService();
  const outputs: Output[] = [];

  for (let cycle = 0; cycle < cycles; cycle++) {
    const agents = Array.from({ length: agent_count }, (_, i) => i);
    const results = await runWithConcurrency(agents, agent_count, async (agent_idx) => {
      const peers = selectPeers(outputs, agent_idx, peer_n);
      try {
        const content = await generateVariant(agent_idx, cycle, prompt, peers);
        return { agent_idx, content, peer_refs: peers.map((p) => p.id), ok: true as const };
      } catch (e) {
        log.warn("agent failed", { cycle, agent_idx, err: String(e) });
        return { agent_idx, content: "(generation failed)", peer_refs: [], ok: false as const };
      }
    });

    // Persist and fold back into outputs array with db ids.
    const insertRows = results.map((r) => ({
      run_id,
      agent_idx: r.agent_idx,
      cycle,
      content: r.content,
      peer_refs: r.peer_refs as never,
    }));
    const { data: inserted, error } = await db.from("flock_outputs").insert(insertRows).select("*");
    if (error) throw error;
    for (const row of inserted ?? []) {
      outputs.push({
        id: row.id,
        agent_idx: row.agent_idx,
        cycle: row.cycle,
        content: row.content,
        created_at: row.created_at,
      });
    }
  }

  await db
    .from("flock_runs")
    .update({ status: "succeeded", completed_at: new Date().toISOString() })
    .eq("id", run_id);
  return { outputs };
}

export { convergenceHeat } from "./heat";
