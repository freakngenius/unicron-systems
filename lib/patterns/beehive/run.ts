import { supabaseService } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { research } from "./stages/research";
import { strategy } from "./stages/strategy";
import { copy as copyStage } from "./stages/copy";
import { validate } from "./stages/validate";
import { bounceLoop } from "./bounce";
import { CopyOutput, ResearchOutput, StrategyOutput, ValidatorOutput } from "./schemas";

type Stage = "research" | "strategy" | "copy" | "validate";

type Deps = {
  research: (url: string) => Promise<ResearchOutput>;
  strategy: (r: ResearchOutput) => Promise<StrategyOutput>;
  copy: (s: StrategyOutput, issues?: string[]) => Promise<CopyOutput>;
  validate: (c: CopyOutput) => ValidatorOutput;
};

export const realDeps: Deps = {
  research,
  strategy,
  copy: copyStage,
  validate,
};

async function recordStage(
  run_id: string,
  stage: Stage,
  input_json: unknown,
  output_json: unknown,
  extras: { validation_status?: "pass" | "fail" | "bounced"; retry_count?: number } = {},
) {
  const db = supabaseService();
  await db.from("pipeline_stages").insert({
    run_id,
    stage_name: stage,
    input_json: input_json as never,
    output_json: output_json as never,
    validation_status: extras.validation_status ?? null,
    retry_count: extras.retry_count ?? 0,
    completed_at: new Date().toISOString(),
  });
}

export async function runPipeline(run_id: string, input_url: string, deps: Deps = realDeps) {
  const log = logger.scoped({ pattern: "beehive", run_id });
  const db = supabaseService();
  try {
    const r = await deps.research(input_url);
    await recordStage(run_id, "research", { input_url }, r);

    const s = await deps.strategy(r);
    await recordStage(run_id, "strategy", r, s);

    const result = await bounceLoop(s, deps.copy, deps.validate);

    // Persist every trajectory step so UI can replay the bounces visually.
    for (let i = 0; i < result.trajectory.length; i++) {
      const step = result.trajectory[i]!;
      const isLast = i === result.trajectory.length - 1;
      await recordStage(run_id, "copy", s, step.copy, { retry_count: i });
      await recordStage(run_id, "validate", step.copy, step.validator, {
        retry_count: i,
        validation_status: isLast ? (step.validator.pass ? "pass" : "fail") : "bounced",
      });
    }

    const v = result.validator;
    const c = result.copy;
    const status = v.pass ? "succeeded" : "failed";
    const retries = result.retries;
    await db
      .from("pipeline_runs")
      .update({
        status,
        final_output: v.pass ? (c as never) : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run_id);

    log.info("pipeline done", { status, retries });
    return { status, final_output: v.pass ? c : null, retries, issues: v.issues };
  } catch (e) {
    log.error("pipeline error", { err: e instanceof Error ? e.message : String(e) });
    await db
      .from("pipeline_runs")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("id", run_id);
    throw e;
  }
}
