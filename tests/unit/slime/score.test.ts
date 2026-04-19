import { describe, it, expect } from "vitest";
import { JudgeOutput, Criteria } from "@/lib/patterns/slime/types";

describe("Slime schemas", () => {
  it("parses a valid JudgeOutput", () => {
    const r = JudgeOutput.parse({
      score_0_100: 76,
      per_criterion: { tam: 80, fit: 85, risk: 70, speed: 72, demoable: 74 },
      reasoning: "Strong TAM, clear story, competitive moat from warm network.",
    });
    expect(r.score_0_100).toBe(76);
  });

  it("rejects score > 100", () => {
    expect(() =>
      JudgeOutput.parse({
        score_0_100: 120,
        per_criterion: { tam: 10, fit: 10, risk: 10, speed: 10, demoable: 10 },
        reasoning: "short but ok",
      }),
    ).toThrow();
  });

  it("Criteria weights must be in [0,1]", () => {
    expect(() => Criteria.parse({ tam: 0.25, fit: 0.25, risk: 0.2, speed: 0.15, demoable: 0.15 })).not.toThrow();
    expect(() => Criteria.parse({ tam: 1.5, fit: 0.25, risk: 0.2, speed: 0.15, demoable: 0.15 })).toThrow();
  });
});
