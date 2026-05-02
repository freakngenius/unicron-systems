import { z } from "zod";

export const WorkerOutput = z.object({
  pain_quote: z.string().min(3).max(280),
  tool_named: z.string().max(80).nullable(),
  price_named: z.string().max(80).nullable(),
  urgency_1_5: z.number().int().min(1).max(5),
});
export type WorkerOutput = z.infer<typeof WorkerOutput>;

export const Cluster = z.object({
  theme: z.string().min(3).max(120),
  size: z.number().int().min(1),
  examples: z.array(z.string()).min(1).max(5),
});
export type Cluster = z.infer<typeof Cluster>;

export const AggregatorOutput = z.object({
  clusters: z.array(Cluster).min(1).max(12),
});
export type AggregatorOutput = z.infer<typeof AggregatorOutput>;
