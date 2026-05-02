import { z } from "zod";

export const SIGNAL_TYPES = ["FACT", "QUESTION", "PATTERN", "RISK"] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const SOURCE_AGENTS = [
  "CEO",
  "CMO",
  "CTO",
  "COO",
  "Research",
  "Kyle",
  "Keenan",
] as const;
export type SourceAgent = (typeof SOURCE_AGENTS)[number];

export const SignalIn = z.object({
  topic: z.string().min(1).max(64).optional(),
  type: z.enum(SIGNAL_TYPES).optional(),
  source_agent: z.string().min(1),
  body: z.string().min(3).max(2000),
  ttl_days: z.number().int().positive().max(365).optional(),
});
export type SignalIn = z.infer<typeof SignalIn>;

export const Signal = z.object({
  id: z.string().uuid(),
  topic: z.string(),
  type: z.enum(SIGNAL_TYPES),
  source_agent: z.string(),
  body: z.string(),
  strength: z.number().nonnegative(),
  last_touched: z.string(),
  ttl_days: z.number().int().positive(),
  promoted_at: z.string().nullable(),
  created_at: z.string(),
  archived: z.boolean(),
});
export type Signal = z.infer<typeof Signal>;

export const ClassifyOut = z.object({
  type: z.enum(SIGNAL_TYPES),
  topic_slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "topic slug must be lowercase-kebab-case")
    .min(1)
    .max(48),
});
export type ClassifyOut = z.infer<typeof ClassifyOut>;

export const SimilarityOut = z.object({
  match_id: z.string().uuid().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(160).optional(),
});
export type SimilarityOut = z.infer<typeof SimilarityOut>;
