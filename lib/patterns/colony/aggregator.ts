import { callJSON, DEFAULT_SONNET } from "@/lib/anthropic";
import { AggregatorOutput, WorkerOutput } from "./types";

export async function aggregateClusters(
  market: string,
  workers: WorkerOutput[],
): Promise<AggregatorOutput> {
  const quotes = workers
    .map((w, i) => `[${i}] "${w.pain_quote}" (urgency ${w.urgency_1_5}${w.tool_named ? `, tool=${w.tool_named}` : ""}${w.price_named ? `, price=${w.price_named}` : ""})`)
    .join("\n");

  return callJSON(
    {
      model: DEFAULT_SONNET,
      max_tokens: 1200,
      temperature: 0.4,
      system:
        "You cluster raw pain signals from a market discovery sweep into a handful of actionable themes. " +
        "Goal: identify where someone could build a product. " +
        "Output JSON: {clusters: [{theme, size, examples[1-3 quotes]}]}. " +
        "theme: a short noun-phrase name for the cluster (e.g. 'settlement deadline misses', 'remediation pricing opacity'). " +
        "size: number of input signals in the cluster. " +
        "examples: 1-3 representative exact quotes from the input, verbatim. " +
        "Aim for 4-8 clusters. Every input quote should fit into exactly one cluster.",
      user: `Market: ${market}\nPain signals:\n${quotes}\n\nCluster.`,
    },
    AggregatorOutput,
  );
}
