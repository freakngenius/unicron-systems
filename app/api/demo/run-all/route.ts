import { supabaseService } from "@/lib/supabase";
import { runPipeline } from "@/lib/patterns/beehive/run";
import { writeNotionRun as beehiveWriteNotion } from "@/lib/patterns/beehive/notion";
import { createJob, executeJob } from "@/lib/patterns/colony/dispatch";
import { writeNotionJob as colonyWriteNotion } from "@/lib/patterns/colony/notion";
import { createRun, runCycle } from "@/lib/patterns/slime/cycle";
import { writeFinalDecisions as slimeWriteNotion } from "@/lib/patterns/slime/notion";
import { runFlock } from "@/lib/patterns/murmuration/flock";
import { writeNotionFlock as murmurationWriteNotion } from "@/lib/patterns/murmuration/notion";
import { loadFixture } from "@/lib/patterns/slime/cycle";
import { classifySignal } from "@/lib/patterns/mycelium/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function encode(line: { step: string; ok: boolean; note?: string }) {
  return new TextEncoder().encode(JSON.stringify(line) + "\n");
}

export async function POST() {
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (step: string, ok: boolean, note?: string) =>
        controller.enqueue(encode({ step, ok, note }));

      const db = supabaseService();

      // 1. Mycelium — drop a demo signal
      try {
        const body = "Five PAs this week said missed-deadline claims cost them $8-12k each. Clearly the biggest leak.";
        const c = await classifySignal(body);
        const existing = await db.from("signals").select("id").eq("topic", c.topic_slug).eq("archived", false).limit(1);
        if (existing.data && existing.data.length) {
          await db
            .from("signals")
            .update({ strength: 6, last_touched: new Date().toISOString() })
            .eq("id", existing.data[0]!.id);
        } else {
          await db.from("signals").insert({
            topic: c.topic_slug,
            type: c.type,
            source_agent: "Kyle",
            body,
            strength: 3,
          });
        }
        emit("mycelium", true, `signal dropped · ${c.topic_slug}`);
      } catch (e) {
        emit("mycelium", false, String(e).slice(0, 80));
      }

      // 2. Beehive — run a pipeline on the first fixture URL
      try {
        const { data: br } = await db
          .from("pipeline_runs")
          .insert({ input_url: "publicadjustersflorida.com", status: "running" })
          .select("*")
          .single();
        if (!br) throw new Error("beehive run insert failed");
        const r = await runPipeline(br.id, br.input_url);
        if (r.status === "succeeded" && r.final_output) {
          await beehiveWriteNotion(br.id, br.input_url, r.final_output).catch(() => void 0);
        }
        emit("beehive", r.status === "succeeded", r.status === "succeeded" ? `retry ${r.retries} · ${r.final_output?.subject ?? ""}` : "pipeline failed");
      } catch (e) {
        emit("beehive", false, String(e).slice(0, 80));
      }

      // 3. Colony — dispatch 20 workers on mold fixtures (smaller for speed)
      try {
        const job_id = await createJob("mold-remediation", 20);
        emit("colony", true, "dispatched 20 workers");
        await executeJob(job_id);
        await colonyWriteNotion(job_id).catch(() => void 0);
        emit("colony", true, "clusters generated");
      } catch (e) {
        emit("colony", false, String(e).slice(0, 80));
      }

      // 4. Murmuration — run a flock (small: 5 agents × 3 cycles for speed)
      try {
        const { data: mr } = await db
          .from("flock_runs")
          .insert({
            prompt: "Landing-page headline for AcmeMold — an AI that stops mold from ruining your home. Tight, bold, distinct.",
            peer_n: 3,
            cycles: 3,
            agent_count: 5,
            status: "running",
          })
          .select("*")
          .single();
        if (!mr) throw new Error("flock insert failed");
        await runFlock(mr.id, mr.prompt, mr.agent_count, mr.peer_n, mr.cycles);
        await murmurationWriteNotion(mr.id).catch(() => void 0);
        emit("murmuration", true, `${mr.agent_count * mr.cycles} variants`);
      } catch (e) {
        emit("murmuration", false, String(e).slice(0, 80));
      }

      // 5. Slime — seed + 3 cycles
      try {
        const criteria = loadFixture().criteria;
        const run_id = await createRun(criteria);
        emit("slime", true, "seeded 10 hypotheses");
        for (let i = 0; i < 3; i++) {
          const r = await runCycle(run_id);
          if (r.status !== "running") break;
        }
        await slimeWriteNotion(run_id).catch(() => void 0);
        emit("slime", true, "converged to survivors");
      } catch (e) {
        emit("slime", false, String(e).slice(0, 80));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
