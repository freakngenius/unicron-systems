import { callJSON, DEFAULT_SONNET } from "@/lib/anthropic";
import { Criteria, HypothesisContext, JudgeOutput } from "./types";

export async function judge(
  hypothesis: string,
  context: HypothesisContext,
  criteria: Criteria,
): Promise<JudgeOutput> {
  return callJSON(
    {
      model: DEFAULT_SONNET,
      max_tokens: 700,
      temperature: 0.2,
      system:
        "You are a startup judge scoring vertical-SaaS business hypotheses for a 2-person team " +
        "competing in an 8-week build contest. The team has Perplexity Computer + Claude. " +
        "Score each criterion 0-100. Then produce a weighted composite score_0_100 = " +
        "sum(per_criterion[k] * criteria_weights[k]). " +
        "Return JSON: {score_0_100, per_criterion: {tam, fit, risk, speed, demoable}, reasoning}. " +
        "Reasoning is one tight paragraph, < 1000 chars, concrete.\n\n" +
        "Criteria meanings:\n" +
        " - tam: Total addressable market size (higher = better, $1T+ scores 90+)\n" +
        " - fit: Contest fit — does this story win judges (market × computer-is-engine × traction-by-June × wild-economics × founder-market-fit)?\n" +
        " - risk: Competitive-risk inverse — lower competition / clearer moat scores higher\n" +
        " - speed: Time-to-visible-traction in 8 weeks\n" +
        " - demoable: Can 2 humans + Computer ship a demoable prototype by week 6?",
      user:
        `HYPOTHESIS: ${hypothesis}\n\n` +
        `CONTEXT:\n${JSON.stringify(context, null, 2)}\n\n` +
        `CRITERIA WEIGHTS: ${JSON.stringify(criteria)}\n\nScore it.`,
    },
    JudgeOutput,
  );
}
