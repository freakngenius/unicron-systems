import { callJSON, DEFAULT_SONNET } from "@/lib/anthropic";
import { CopyOutput, StrategyOutput } from "../schemas";

export async function copy(input: StrategyOutput, priorIssues?: string[]): Promise<CopyOutput> {
  const fixNote = priorIssues?.length
    ? `\n\nPrevious attempt failed validation. You MUST fix these issues:\n- ${priorIssues.join("\n- ")}`
    : "";
  return callJSON(
    {
      model: DEFAULT_SONNET,
      max_tokens: 500,
      temperature: 0.6,
      system:
        "You are a B2B cold email copywriter. Tight, concrete, and useful.\n" +
        "HARD CONSTRAINTS (your copy MUST satisfy these exactly):\n" +
        " - subject: < 55 characters, lowercase, no emoji\n" +
        " - line1, line2, line3: each at most 20 words\n" +
        " - cta: must contain an actionable verb (reply, book, schedule, grab, open, try, see, send, let me know)\n" +
        "Return JSON: {subject, line1, line2, line3, cta}. No markdown.",
      user: `STRATEGY BRIEF:\n${JSON.stringify(input, null, 2)}${fixNote}\n\nWrite the email.`,
    },
    CopyOutput,
  );
}
