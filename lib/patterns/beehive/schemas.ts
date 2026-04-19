import { z } from "zod";

export const ResearchOutput = z.object({
  company_name: z.string().min(1).max(120),
  one_line_desc: z.string().min(10).max(300),
  recent_signal: z.string().min(5).max(240),
  industry: z.string().min(1).max(80),
  size_est: z.string().min(1).max(80),
});
export type ResearchOutput = z.infer<typeof ResearchOutput>;

export const StrategyOutput = z.object({
  angle: z.string().min(5).max(240),
  hook: z.string().min(5).max(240),
  pain_we_address: z.string().min(5).max(300),
});
export type StrategyOutput = z.infer<typeof StrategyOutput>;

export const CopyOutput = z.object({
  subject: z.string().min(1).max(120),
  line1: z.string().min(1).max(400),
  line2: z.string().min(1).max(400),
  line3: z.string().min(1).max(400),
  cta: z.string().min(1).max(200),
});
export type CopyOutput = z.infer<typeof CopyOutput>;

export const ValidatorOutput = z.object({
  pass: z.boolean(),
  issues: z.array(z.string()).default([]),
});
export type ValidatorOutput = z.infer<typeof ValidatorOutput>;

/**
 * Deterministic copy validator. Returns issues[] of human-readable strings
 * for any rule violation. Used to seed the LLM validator prompt AND to
 * double-check the LLM's answer — deterministic rules are source of truth.
 */
export function checkCopy(copy: CopyOutput): ValidatorOutput {
  const issues: string[] = [];
  if (copy.subject.length >= 55) {
    issues.push(`subject too long: ${copy.subject.length} chars (must be < 55)`);
  }
  for (const [name, line] of [
    ["line1", copy.line1],
    ["line2", copy.line2],
    ["line3", copy.line3],
  ] as const) {
    const words = line.trim().split(/\s+/).filter(Boolean).length;
    if (words > 20) issues.push(`${name} too long: ${words} words (must be <= 20)`);
  }
  const ctaLooksActionable = /\b(reply|book|schedule|grab|open|try|see|send|let me know|interested)\b/i.test(copy.cta);
  if (!ctaLooksActionable) {
    issues.push("cta does not contain an actionable verb");
  }
  return { pass: issues.length === 0, issues };
}
