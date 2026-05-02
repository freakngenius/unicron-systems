import { z } from "zod";

export const Criteria = z.object({
  tam: z.number().min(0).max(1),
  fit: z.number().min(0).max(1),
  risk: z.number().min(0).max(1),
  speed: z.number().min(0).max(1),
  demoable: z.number().min(0).max(1),
});
export type Criteria = z.infer<typeof Criteria>;

export const JudgeOutput = z.object({
  score_0_100: z.number().min(0).max(100),
  per_criterion: z.object({
    tam: z.number().min(0).max(100),
    fit: z.number().min(0).max(100),
    risk: z.number().min(0).max(100),
    speed: z.number().min(0).max(100),
    demoable: z.number().min(0).max(100),
  }),
  reasoning: z.string().min(10).max(1500),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;

export const HypothesisContext = z.object({
  tam_usd: z.string(),
  competition_notes: z.string(),
  traction_notes: z.string(),
  why_it_wins: z.string(),
});
export type HypothesisContext = z.infer<typeof HypothesisContext>;

export const SeedHypothesis = z.object({
  hypothesis: z.string().min(3).max(200),
  context: HypothesisContext,
});
export type SeedHypothesis = z.infer<typeof SeedHypothesis>;
