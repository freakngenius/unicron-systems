import { describe, it, expect } from "vitest";
import { CopyOutput, checkCopy, ResearchOutput } from "@/lib/patterns/beehive/schemas";

describe("Beehive schemas", () => {
  it("parses a well-formed ResearchOutput", () => {
    const r = ResearchOutput.parse({
      company_name: "AcmePA",
      one_line_desc: "Public adjuster firm serving South Florida since 2015",
      recent_signal: "hired 3 new adjusters in Q1",
      industry: "public adjusting",
      size_est: "10-25 people",
    });
    expect(r.company_name).toBe("AcmePA");
  });

  it("rejects short one_line_desc", () => {
    expect(() => ResearchOutput.parse({
      company_name: "X", one_line_desc: "short", recent_signal: "x x x x x",
      industry: "y", size_est: "z",
    })).toThrow();
  });
});

describe("checkCopy validator", () => {
  const base: CopyOutput = {
    subject: "quick question about PA workflow",
    line1: "Saw your firm is hiring adjusters.",
    line2: "Most PA firms we talk to lose 5-10k per claim on missed deadlines.",
    line3: "We built a workflow that cuts that loss by ~60% with zero change mgmt.",
    cta: "Reply and I'll share a 2-min video.",
  };

  it("passes a clean copy", () => {
    const r = checkCopy(base);
    expect(r.pass).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("fails on long subject", () => {
    const r = checkCopy({ ...base, subject: "x".repeat(60) });
    expect(r.pass).toBe(false);
    expect(r.issues.some((i) => i.includes("subject"))).toBe(true);
  });

  it("fails on long line", () => {
    const r = checkCopy({ ...base, line1: "word ".repeat(25) });
    expect(r.pass).toBe(false);
    expect(r.issues.some((i) => i.includes("line1"))).toBe(true);
  });

  it("fails on non-actionable cta", () => {
    const r = checkCopy({ ...base, cta: "thoughts?" });
    expect(r.pass).toBe(false);
    expect(r.issues.some((i) => i.includes("cta"))).toBe(true);
  });
});
