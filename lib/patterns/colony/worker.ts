import { callJSON, DEFAULT_HAIKU } from "@/lib/anthropic";
import { WorkerOutput } from "./types";

export async function extractPain(blob: string): Promise<WorkerOutput> {
  return callJSON(
    {
      model: DEFAULT_HAIKU,
      max_tokens: 180,
      temperature: 0,
      system:
        "You extract a single pain signal from a short forum/review/complaint snippet. " +
        "Output strict JSON: {pain_quote, tool_named, price_named, urgency_1_5}. " +
        "pain_quote: 1 concise line paraphrasing the core complaint (<160 chars). " +
        "tool_named: exact tool/software/company name mentioned, else null. " +
        "price_named: any price/percentage/money figure mentioned (e.g. '$5k', '20%'), else null. " +
        "urgency_1_5: 1=mild, 5=crisis. Integer.",
      user: `Snippet:\n${blob}\n\nExtract.`,
    },
    WorkerOutput,
  );
}
