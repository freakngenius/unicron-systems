import { describe, it, expect } from "vitest";
import { AggregatorOutput, Cluster, WorkerOutput } from "@/lib/patterns/colony/types";

describe("Colony schemas", () => {
  it("parses a valid WorkerOutput", () => {
    const r = WorkerOutput.parse({
      pain_quote: "PA took 6 months to close a $40k claim",
      tool_named: "Adjustify",
      price_named: "$40k",
      urgency_1_5: 4,
    });
    expect(r.urgency_1_5).toBe(4);
  });

  it("rejects urgency out of range", () => {
    expect(() =>
      WorkerOutput.parse({
        pain_quote: "short",
        tool_named: null,
        price_named: null,
        urgency_1_5: 7,
      }),
    ).toThrow();
  });

  it("parses an aggregator output with multiple clusters", () => {
    const r = AggregatorOutput.parse({
      clusters: [
        { theme: "price opacity", size: 12, examples: ["quote $5k, billed $19k"] },
        { theme: "missed deadlines", size: 8, examples: ["90-day delay"] },
      ],
    });
    expect(r.clusters).toHaveLength(2);
  });

  it("rejects cluster with zero size", () => {
    expect(() => Cluster.parse({ theme: "x", size: 0, examples: ["a"] })).toThrow();
  });
});
