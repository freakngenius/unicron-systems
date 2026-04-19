import { callJSON, DEFAULT_SONNET } from "@/lib/anthropic";
import { ResearchOutput, StrategyOutput } from "../schemas";

export async function strategy(input: ResearchOutput): Promise<StrategyOutput> {
  return callJSON(
    {
      model: DEFAULT_SONNET,
      max_tokens: 400,
      temperature: 0.7,
      system:
        "You are a B2B outreach strategist. Given a company research brief, pick ONE specific, " +
        "non-generic angle for a cold email. Avoid flattery and platitudes. " +
        "Return JSON: {angle, hook, pain_we_address}.\n" +
        " - angle: 1 sentence framing (why THIS company now)\n" +
        " - hook: 1 concrete opener line — a signal, a stat, or a named workflow\n" +
        " - pain_we_address: 1 sentence in $$ or hours terms",
      user: JSON.stringify(input),
    },
    StrategyOutput,
  );
}
