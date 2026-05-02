import { describe, it, expect, vi } from "vitest";
import { bounceLoop } from "@/lib/patterns/beehive/bounce";
import type { CopyOutput, StrategyOutput, ValidatorOutput } from "@/lib/patterns/beehive/schemas";

const strategy: StrategyOutput = {
  angle: "test angle",
  hook: "test hook",
  pain_we_address: "saving $5k/claim",
};

const goodCopy: CopyOutput = {
  subject: "quick q",
  line1: "short opener",
  line2: "short middle",
  line3: "short close",
  cta: "Reply if interested.",
};

describe("bounceLoop", () => {
  it("passes first try — no retries", async () => {
    const copy = vi.fn(async () => goodCopy);
    const validate = vi.fn((): ValidatorOutput => ({ pass: true, issues: [] }));
    const r = await bounceLoop(strategy, copy, validate);
    expect(r.validator.pass).toBe(true);
    expect(r.retries).toBe(0);
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it("bounces once then passes — retries=1", async () => {
    const copy = vi.fn(async () => goodCopy);
    let calls = 0;
    const validate = vi.fn((): ValidatorOutput => {
      calls += 1;
      return calls === 1
        ? { pass: false, issues: ["subject too long"] }
        : { pass: true, issues: [] };
    });
    const r = await bounceLoop(strategy, copy, validate);
    expect(r.validator.pass).toBe(true);
    expect(r.retries).toBe(1);
    expect(copy).toHaveBeenCalledTimes(2);
    expect(copy.mock.calls[1]?.[1]).toEqual(["subject too long"]);
  });

  it("exhausts retries and returns failed validator", async () => {
    const copy = vi.fn(async () => goodCopy);
    const validate = vi.fn((): ValidatorOutput => ({
      pass: false,
      issues: ["always fails"],
    }));
    const r = await bounceLoop(strategy, copy, validate);
    expect(r.validator.pass).toBe(false);
    expect(r.retries).toBe(2);
    expect(copy).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(r.trajectory).toHaveLength(3);
  });
});
