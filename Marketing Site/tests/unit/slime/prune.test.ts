import { describe, it, expect } from "vitest";
import { nextResourceShare, parseTam, prune } from "@/lib/patterns/slime/prune";

describe("prune", () => {
  it("keeps top half rounded up (10 → 5)", () => {
    const cands = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, score: i }));
    const { keep, eliminate } = prune(cands);
    expect(keep).toHaveLength(5);
    expect(eliminate).toHaveLength(5);
    // Top 5 scores are 9,8,7,6,5
    expect(keep).toEqual(["c9", "c8", "c7", "c6", "c5"]);
  });

  it("keeps ceil(n/2) when odd (5 → 3)", () => {
    const cands = [
      { id: "a", score: 10 },
      { id: "b", score: 8 },
      { id: "c", score: 6 },
      { id: "d", score: 4 },
      { id: "e", score: 2 },
    ];
    const { keep } = prune(cands);
    expect(keep).toEqual(["a", "b", "c"]);
  });

  it("tie-breaks by higher TAM", () => {
    const cands = [
      { id: "low", score: 50, tiebreak: 1e9 },
      { id: "high", score: 50, tiebreak: 5e9 },
      { id: "losing", score: 10, tiebreak: 999e9 },
    ];
    const { keep, eliminate } = prune(cands);
    // Top 2 by score are the two 50s; "high" edges "low" on tiebreak.
    expect(keep).toEqual(["high", "low"]);
    expect(eliminate).toEqual(["losing"]);
  });

  it("returns empty on empty input", () => {
    expect(prune([])).toEqual({ keep: [], eliminate: [] });
  });

  it("survives with just one candidate", () => {
    expect(prune([{ id: "solo", score: 7 }])).toEqual({ keep: ["solo"], eliminate: [] });
  });
});

describe("nextResourceShare", () => {
  it("doubles each cycle", () => {
    expect(nextResourceShare(1)).toBe(2);
    expect(nextResourceShare(2)).toBe(4);
  });
});

describe("parseTam", () => {
  it("parses single values with suffix", () => {
    expect(parseTam("14.6B")).toBe(14.6e9);
    expect(parseTam("210B")).toBe(210e9);
    expect(parseTam("60M")).toBe(60e6);
    expect(parseTam("1T")).toBe(1e12);
  });
  it("parses ranges", () => {
    expect(parseTam("3-5T")).toBe(4e12);
    expect(parseTam("10-20M")).toBe(15e6);
  });
  it("returns 0 on garbage", () => {
    expect(parseTam("nope")).toBe(0);
    expect(parseTam("")).toBe(0);
  });
});
