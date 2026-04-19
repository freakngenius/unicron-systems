import { callJSON, DEFAULT_HAIKU } from "@/lib/anthropic";
import { ClassifyOut, SIGNAL_TYPES } from "./types";

export async function classifySignal(body: string, hintTopic?: string) {
  const topicHint = hintTopic ? `\nHint topic: ${hintTopic}` : "";
  return callJSON(
    {
      model: DEFAULT_HAIKU,
      max_tokens: 200,
      temperature: 0,
      system:
        "You classify short team-memory signals for a small agentic startup. " +
        "Topics are business-facing like public-adjusters, mold-remediation, property-data, icp, competitors, pricing. " +
        "Return a tight JSON object: {type, topic_slug}. " +
        `type MUST be one of ${SIGNAL_TYPES.join("|")}. ` +
        "topic_slug MUST be lowercase-kebab-case with only [a-z0-9-].",
      user: `Signal body:\n${body}${topicHint}\n\nClassify.`,
    },
    ClassifyOut,
  );
}
