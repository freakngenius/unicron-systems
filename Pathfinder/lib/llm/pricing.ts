// Model pricing (USD per 1M tokens) — Phase 1 G1 Task A2.
// Pricing snapshot as of 2026-01 (knowledge cutoff). Update when provider
// pricing pages move. Out-of-date values produce wrong cost telemetry but
// don't break anything else; the cost number is best-effort.
//
// Anthropic prices: https://www.anthropic.com/pricing
// Perplexity prices: https://docs.perplexity.ai/guides/pricing

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cachedInputPerMTok: number; // prompt-cache read price (Anthropic)
}

const PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6':  { inputPerMTok: 3.00,  outputPerMTok: 15.00, cachedInputPerMTok: 0.30 },
  'claude-sonnet-4-5':  { inputPerMTok: 3.00,  outputPerMTok: 15.00, cachedInputPerMTok: 0.30 },
  'claude-haiku-4-5':   { inputPerMTok: 1.00,  outputPerMTok: 5.00,  cachedInputPerMTok: 0.10 },
  'claude-opus-4-7':    { inputPerMTok: 15.00, outputPerMTok: 75.00, cachedInputPerMTok: 1.50 },
  'sonar':              { inputPerMTok: 1.00,  outputPerMTok: 1.00,  cachedInputPerMTok: 1.00 },
  'sonar-pro':          { inputPerMTok: 3.00,  outputPerMTok: 15.00, cachedInputPerMTok: 3.00 },
};

const FALLBACK: ModelPricing = { inputPerMTok: 3.00, outputPerMTok: 15.00, cachedInputPerMTok: 0.30 };

export function pricingFor(model: string): ModelPricing {
  return PRICING[model] ?? FALLBACK;
}

export function costUsd(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}): number {
  const p = pricingFor(args.model);
  const inputCost = ((args.inputTokens - (args.cachedInputTokens ?? 0)) / 1_000_000) * p.inputPerMTok;
  const cachedCost = ((args.cachedInputTokens ?? 0) / 1_000_000) * p.cachedInputPerMTok;
  const outputCost = (args.outputTokens / 1_000_000) * p.outputPerMTok;
  const total = inputCost + cachedCost + outputCost;
  return Math.max(0, Number(total.toFixed(4)));
}
